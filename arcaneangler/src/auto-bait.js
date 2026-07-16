const DEFAULT_BAIT_ID = 'bait_default';
const GOLD_BREEZE_WEATHER = 'gold_breeze';
const PURCHASE_RETRY_DELAY = 60000;

export const BAIT_GRADE_LABELS = {
    default: '默认饵',
    low: '低级饵',
    medium: '中级饵（+250 幸运）',
    high: '高级饵（+500 幸运）',
    super: '超级饵（+1000 幸运）',
};

export const AUTO_BAIT_CONTEXT_LABELS = {
    guild: '公会赛',
    personal: '个人赛',
    regular: '常规',
};

function normalizeBiomeId(value) {
    const biomeId = Number(value);

    return Number.isInteger(biomeId) && biomeId > 0 ? biomeId : null;
}

function normalizeQuantity(value) {
    const quantity = Number(value);

    return Number.isFinite(quantity) && quantity >= 0
        ? Math.floor(quantity)
        : 0;
}

export function getBaitIdForBiome(biomeId, baitGrade) {
    if (baitGrade === 'default') {
        return DEFAULT_BAIT_ID;
    }

    const normalizedBiomeId = normalizeBiomeId(biomeId);

    return normalizedBiomeId ? `bait_${normalizedBiomeId}_${baitGrade}` : null;
}

export function getAutoBaitContext(biomeId, competitionBiomes) {
    const normalizedBiomeId = normalizeBiomeId(biomeId);

    if (
        normalizedBiomeId &&
        normalizedBiomeId ===
            normalizeBiomeId(competitionBiomes?.guildTournamentBiomeId)
    ) {
        return 'guild';
    }

    if (
        normalizedBiomeId &&
        normalizedBiomeId ===
            normalizeBiomeId(competitionBiomes?.personalDerbyBiomeId)
    ) {
        return 'personal';
    }

    return 'regular';
}

export function getBaitGradeForBiome(
    biomeId,
    autoBaitSettings,
    competitionBiomes,
    automationState = {},
) {
    const regularBaitGrade =
        autoBaitSettings?.regularBaitGrade ??
        autoBaitSettings?.baitGrade ??
        'low';

    if (
        automationState.autoBiomeWeatherByBiome?.[biomeId]?.weather ===
        GOLD_BREEZE_WEATHER
    ) {
        return autoBaitSettings?.goldBreezeBaitGrade ?? 'default';
    }

    const context = getAutoBaitContext(biomeId, competitionBiomes);

    if (context === 'guild') {
        return autoBaitSettings?.guildCompetitionBaitGrade ?? regularBaitGrade;
    }

    if (context === 'personal') {
        return (
            autoBaitSettings?.personalCompetitionBaitGrade ?? regularBaitGrade
        );
    }

    return regularBaitGrade;
}

export function shouldPurchaseBait(quantity, minimumQuantity, baitGrade) {
    return (
        baitGrade !== 'default' &&
        normalizeQuantity(quantity) < normalizeQuantity(minimumQuantity)
    );
}

function getBaitById(baitId) {
    if (typeof window.getBaitById === 'function') {
        try {
            const bait = window.getBaitById(baitId);

            if (bait) {
                return bait;
            }
        } catch {
            // 回退到公开的鱼饵目录。
        }
    }

    return Array.isArray(window.BAITS)
        ? window.BAITS.find((bait) => bait?.id === baitId)
        : null;
}

function getBaitLabel(baitId, baitGrade, biomeId) {
    const catalogName = String(getBaitById(baitId)?.name ?? '').trim();
    const gradeLabel = BAIT_GRADE_LABELS[baitGrade] ?? baitGrade;

    if (baitGrade === 'default') {
        return catalogName ? `${gradeLabel}（${catalogName}）` : gradeLabel;
    }

    return `[B${biomeId}] ${gradeLabel}${catalogName ? `（${catalogName}）` : ''}`;
}

function getErrorMessage(error) {
    return String(error?.message ?? error ?? '未知错误');
}

export function createAutoBaitController({
    getPlayer,
    getState,
    onStateChange,
}) {
    let checking = false;
    let currentBaitId = null;
    let currentQuantity = null;
    let lastCheckedAt = 0;
    let lastPurchasedAt = 0;
    let retryAfter = 0;
    let retryBaitId = null;
    let status = '未启用';
    let checkQueue = Promise.resolve();

    function notifyStateChanged() {
        onStateChange?.();
    }

    function updateSnapshot({ baitId, quantity, nextStatus }) {
        if (baitId !== undefined) {
            currentBaitId = baitId;
        }

        if (quantity !== undefined) {
            currentQuantity = quantity;
        }

        if (nextStatus !== undefined) {
            status = nextStatus;
        }

        notifyStateChanged();
    }

    function getSnapshot() {
        return {
            autoBaitCurrentBaitId: currentBaitId,
            autoBaitCurrentQuantity: currentQuantity,
            autoBaitLastCheckedAt: lastCheckedAt,
            autoBaitLastPurchasedAt: lastPurchasedAt,
            autoBaitStatus: status,
        };
    }

    async function equipBait(api, player, baitId, baitLabel) {
        if (player.equippedBait === baitId) {
            return;
        }

        const result = await api.equipBait(baitId);

        if (result?.success !== true) {
            throw new Error(result?.message ?? `无法装备${baitLabel}`);
        }
    }

    async function evaluate({
        biomeId: requestedBiomeId = null,
        force = false,
    }) {
        const state = getState();
        const { autoBaitSettings, autoBiomeCompetitionBiomes, enabled } = state;

        if (!autoBaitSettings.enabled) {
            updateSnapshot({
                baitId: null,
                quantity: null,
                nextStatus: '未启用',
            });
            return;
        }

        if (!enabled) {
            updateSnapshot({
                baitId: null,
                quantity: null,
                nextStatus: '脚本启动后自动检查',
            });
            return;
        }

        const api = window.ApiService;

        if (typeof api?.equipBait !== 'function') {
            updateSnapshot({ nextStatus: '等待游戏鱼饵接口' });
            return;
        }

        const player = getPlayer?.();

        if (!player) {
            updateSnapshot({ nextStatus: '等待游戏角色数据' });
            return;
        }

        checking = true;
        updateSnapshot({ nextStatus: '正在检查鱼饵库存' });
        let attemptedBaitId = null;

        try {
            const biomeId =
                normalizeBiomeId(requestedBiomeId) ??
                normalizeBiomeId(player?.currentBiome);
            const baitContext = getAutoBaitContext(
                biomeId,
                autoBiomeCompetitionBiomes,
            );
            const baitGrade = getBaitGradeForBiome(
                biomeId,
                autoBaitSettings,
                autoBiomeCompetitionBiomes,
                state,
            );
            const baitId = getBaitIdForBiome(biomeId, baitGrade);

            attemptedBaitId = baitId;

            if (!baitId) {
                throw new Error('无法识别当前地图');
            }

            if (!force && baitId === retryBaitId && Date.now() < retryAfter) {
                return;
            }

            if (baitGrade !== 'default' && typeof api?.buyBait !== 'function') {
                updateSnapshot({ nextStatus: '等待游戏鱼饵购买接口' });
                return;
            }

            const baitLabel = getBaitLabel(baitId, baitGrade, biomeId);
            const contextLabel =
                state.autoBiomeWeatherByBiome?.[biomeId]?.weather ===
                GOLD_BREEZE_WEATHER
                    ? '金风'
                    : AUTO_BAIT_CONTEXT_LABELS[baitContext];

            lastCheckedAt = Date.now();

            if (baitGrade === 'default') {
                await equipBait(api, player, baitId, baitLabel);
                retryAfter = 0;
                retryBaitId = null;
                updateSnapshot({
                    baitId,
                    quantity: null,
                    nextStatus: `${contextLabel} · ${baitLabel} · 无限`,
                });
                return;
            }

            let quantity = normalizeQuantity(player?.baitInventory?.[baitId]);
            let purchased = false;

            if (
                shouldPurchaseBait(
                    quantity,
                    autoBaitSettings.minimumQuantity,
                    baitGrade,
                )
            ) {
                const bait = getBaitById(baitId);
                const baitPrice = Number(bait?.price);
                const totalCost = baitPrice * autoBaitSettings.purchaseQuantity;

                if (
                    Number.isFinite(totalCost) &&
                    totalCost > Number(player?.gold ?? 0)
                ) {
                    if (quantity > 0) {
                        await equipBait(api, player, baitId, baitLabel);
                    }

                    retryBaitId = baitId;
                    retryAfter = Date.now() + PURCHASE_RETRY_DELAY;
                    updateSnapshot({
                        baitId,
                        quantity,
                        nextStatus: `${contextLabel} ${baitLabel}不足，购买需 ${totalCost.toLocaleString()} 金币`,
                    });
                    return;
                }

                updateSnapshot({
                    baitId,
                    quantity,
                    nextStatus: `正在购买 ${baitLabel} ×${autoBaitSettings.purchaseQuantity}`,
                });

                const result = await api.buyBait(
                    baitId,
                    autoBaitSettings.purchaseQuantity,
                );

                if (result?.success !== true) {
                    throw new Error(result?.message ?? '游戏未确认购买成功');
                }

                quantity = Number.isFinite(Number(result.newBaitQuantity))
                    ? normalizeQuantity(result.newBaitQuantity)
                    : quantity + autoBaitSettings.purchaseQuantity;
                lastPurchasedAt = Date.now();
                purchased = true;
            }

            await equipBait(api, player, baitId, baitLabel);
            retryAfter = 0;
            retryBaitId = null;
            updateSnapshot({
                baitId,
                quantity,
                nextStatus: purchased
                    ? `已购买${contextLabel} ${baitLabel}，当前 ${quantity.toLocaleString()} 个`
                    : `${contextLabel} · ${baitLabel} · ${quantity.toLocaleString()} 个`,
            });
        } catch (error) {
            console.error('[自动买鱼饵] 检查或购买失败：', error);
            retryBaitId = attemptedBaitId ?? currentBaitId;
            retryAfter = Date.now() + PURCHASE_RETRY_DELAY;
            updateSnapshot({
                nextStatus: `鱼饵处理失败：${getErrorMessage(error)}`,
            });
        } finally {
            checking = false;
        }
    }

    function checkNow(options = {}) {
        checkQueue = checkQueue.then(
            () => evaluate(options),
            () => evaluate(options),
        );

        return checkQueue;
    }

    function handleCastResult(result) {
        const state = getState();
        const { autoBaitSettings, autoBiomeCompetitionBiomes, enabled } = state;

        if (!autoBaitSettings.enabled || !enabled) {
            return;
        }

        const biomeId = normalizeBiomeId(result?.currentBiome);
        const baitContext = getAutoBaitContext(
            biomeId,
            autoBiomeCompetitionBiomes,
        );
        const baitGrade = getBaitGradeForBiome(
            biomeId,
            autoBaitSettings,
            autoBiomeCompetitionBiomes,
            state,
        );
        const baitId = getBaitIdForBiome(biomeId, baitGrade);

        if (!baitId) {
            return;
        }

        if (result?.equippedBait !== baitId) {
            void checkNow({ biomeId });
            return;
        }

        lastCheckedAt = Date.now();

        const contextLabel =
            state.autoBiomeWeatherByBiome?.[biomeId]?.weather ===
            GOLD_BREEZE_WEATHER
                ? '金风'
                : AUTO_BAIT_CONTEXT_LABELS[baitContext];

        if (baitGrade === 'default') {
            updateSnapshot({
                baitId,
                quantity: null,
                nextStatus: `${contextLabel} · ${BAIT_GRADE_LABELS.default} · 无限`,
            });
            return;
        }

        const quantity = normalizeQuantity(result?.baitQuantity);
        const baitLabel = getBaitLabel(baitId, baitGrade, biomeId);

        updateSnapshot({
            baitId,
            quantity,
            nextStatus: `${contextLabel} · ${baitLabel} · ${quantity.toLocaleString()} 个`,
        });

        if (
            shouldPurchaseBait(
                quantity,
                autoBaitSettings.minimumQuantity,
                baitGrade,
            )
        ) {
            void checkNow({ biomeId });
        }
    }

    return {
        checkNow,
        getSnapshot,
        handleCastResult,
        handleStateChanged(options = {}) {
            return checkNow(options);
        },
        isChecking() {
            return checking;
        },
    };
}
