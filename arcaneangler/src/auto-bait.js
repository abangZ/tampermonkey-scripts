const DEFAULT_BAIT_ID = 'bait_default';
const PURCHASE_RETRY_DELAY = 60000;

export const BAIT_GRADE_LABELS = {
    default: '默认饵',
    low: '低级饵',
    medium: '中级饵（+250 幸运）',
    high: '高级饵（+500 幸运）',
    super: '超级饵（+1000 幸运）',
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
        const { autoBaitSettings, enabled } = getState();

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

        const requestedBaitId = getBaitIdForBiome(
            requestedBiomeId,
            autoBaitSettings.baitGrade,
        );

        if (
            !force &&
            requestedBaitId &&
            requestedBaitId === retryBaitId &&
            Date.now() < retryAfter
        ) {
            return;
        }

        const api = window.ApiService;

        if (
            typeof api?.equipBait !== 'function' ||
            (autoBaitSettings.baitGrade !== 'default' &&
                typeof api?.buyBait !== 'function')
        ) {
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

        try {
            const biomeId =
                normalizeBiomeId(requestedBiomeId) ??
                normalizeBiomeId(player?.currentBiome);
            const baitId = getBaitIdForBiome(
                biomeId,
                autoBaitSettings.baitGrade,
            );

            if (!baitId) {
                throw new Error('无法识别当前地图');
            }

            const baitLabel = getBaitLabel(
                baitId,
                autoBaitSettings.baitGrade,
                biomeId,
            );

            lastCheckedAt = Date.now();

            if (autoBaitSettings.baitGrade === 'default') {
                await equipBait(api, player, baitId, baitLabel);
                retryAfter = 0;
                retryBaitId = null;
                updateSnapshot({
                    baitId,
                    quantity: null,
                    nextStatus: `${baitLabel} · 无限`,
                });
                return;
            }

            let quantity = normalizeQuantity(player?.baitInventory?.[baitId]);
            let purchased = false;

            if (
                shouldPurchaseBait(
                    quantity,
                    autoBaitSettings.minimumQuantity,
                    autoBaitSettings.baitGrade,
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
                        nextStatus: `${baitLabel}不足，购买需 ${totalCost.toLocaleString()} 金币`,
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
                    ? `已购买 ${baitLabel}，当前 ${quantity.toLocaleString()} 个`
                    : `${baitLabel} · ${quantity.toLocaleString()} 个`,
            });
        } catch (error) {
            console.error('[自动买鱼饵] 检查或购买失败：', error);
            retryBaitId = requestedBaitId ?? currentBaitId;
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
        const { autoBaitSettings, enabled } = getState();

        if (!autoBaitSettings.enabled || !enabled) {
            return;
        }

        const biomeId = normalizeBiomeId(result?.currentBiome);
        const baitId = getBaitIdForBiome(biomeId, autoBaitSettings.baitGrade);

        if (!baitId) {
            return;
        }

        if (result?.equippedBait !== baitId) {
            void checkNow({ biomeId });
            return;
        }

        lastCheckedAt = Date.now();

        if (autoBaitSettings.baitGrade === 'default') {
            updateSnapshot({
                baitId,
                quantity: null,
                nextStatus: `${BAIT_GRADE_LABELS.default} · 无限`,
            });
            return;
        }

        const quantity = normalizeQuantity(result?.baitQuantity);
        const baitLabel = getBaitLabel(
            baitId,
            autoBaitSettings.baitGrade,
            biomeId,
        );

        updateSnapshot({
            baitId,
            quantity,
            nextStatus: `${baitLabel} · ${quantity.toLocaleString()} 个`,
        });

        if (
            shouldPurchaseBait(
                quantity,
                autoBaitSettings.minimumQuantity,
                autoBaitSettings.baitGrade,
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
