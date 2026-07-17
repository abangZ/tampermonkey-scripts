function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBiomeId(value) {
    const biomeId = Number(value);

    return Number.isInteger(biomeId) && biomeId > 0 ? biomeId : null;
}

function normalizeQuantity(value) {
    const quantity = Number(value);

    return Number.isFinite(quantity) && quantity >= 0
        ? Math.floor(quantity)
        : null;
}

function isSuccessful(payload) {
    return payload?.success !== false;
}

/**
 * 汇总游戏自身请求的响应，供自动换图和自动买饵读取。
 */
export function createGameStateStore() {
    let player = null;
    let updatedAt = 0;

    function replacePlayer(nextPlayer) {
        if (!isObject(nextPlayer)) {
            return false;
        }

        // 游戏会分别请求角色和船只数据，角色刷新不能抹掉已知的组队状态。
        player =
            player?.boat !== undefined && !Object.hasOwn(nextPlayer, 'boat')
                ? {
                      ...nextPlayer,
                      boat: player.boat,
                  }
                : nextPlayer;
        updatedAt = Date.now();
        return true;
    }

    function mergePlayer(patch) {
        if (!player || !isObject(patch)) {
            return false;
        }

        player = {
            ...player,
            ...patch,
        };
        updatedAt = Date.now();
        return true;
    }

    function updateBaitInventory(baitId, quantity) {
        const normalizedQuantity = normalizeQuantity(quantity);

        if (!player || !baitId || normalizedQuantity === null) {
            return false;
        }

        return mergePlayer({
            baitInventory: {
                ...player.baitInventory,
                [baitId]: normalizedQuantity,
            },
        });
    }

    function handleCastResult(result) {
        if (!player || !isObject(result)) {
            return false;
        }

        const patch = {};
        const biomeId = normalizeBiomeId(result.currentBiome);

        if (biomeId) {
            patch.currentBiome = biomeId;
        }

        if (result.equippedBait) {
            patch.equippedBait = result.equippedBait;

            const quantity = normalizeQuantity(result.baitQuantity);

            if (quantity !== null) {
                patch.baitInventory = {
                    ...player.baitInventory,
                    [result.equippedBait]: quantity,
                };
            }
        }

        const fieldMap = {
            newGold: 'gold',
            newLevel: 'level',
            newStamina: 'stamina',
            newStatPoints: 'statPoints',
            newXP: 'xp',
            newXpToNext: 'xpToNext',
        };

        for (const [sourceField, targetField] of Object.entries(fieldMap)) {
            if (result[sourceField] !== undefined) {
                patch[targetField] = result[sourceField];
            }
        }

        return mergePlayer(patch);
    }

    function handleResponse({ method, pathname, payload, requestPayload }) {
        if (method === 'GET' && pathname === '/api/player/data') {
            return {
                changed: replacePlayer(payload),
                shouldEvaluate: true,
            };
        }

        if (method === 'GET' && pathname === '/api/boats/my-boat') {
            return {
                changed: mergePlayer({ boat: payload?.boat ?? null }),
                shouldEvaluate: true,
            };
        }

        if (method !== 'POST' || !isSuccessful(payload)) {
            return { changed: false, shouldEvaluate: false };
        }

        if (pathname === '/api/game/cast') {
            return {
                changed: handleCastResult(payload?.result),
                shouldEvaluate: false,
            };
        }

        if (pathname === '/api/game/change-biome') {
            const biomeId = normalizeBiomeId(requestPayload?.biomeId);

            return {
                changed: biomeId
                    ? mergePlayer({ currentBiome: biomeId })
                    : false,
                shouldEvaluate: false,
            };
        }

        if (pathname === '/api/game/equip-bait') {
            return {
                changed: requestPayload?.baitName
                    ? mergePlayer({ equippedBait: requestPayload.baitName })
                    : false,
                shouldEvaluate: false,
            };
        }

        if (pathname === '/api/game/equip-rod') {
            return {
                changed: requestPayload?.rodName
                    ? mergePlayer({ equippedRod: requestPayload.rodName })
                    : false,
                shouldEvaluate: false,
            };
        }

        if (pathname === '/api/game/buy-bait') {
            const baitId = requestPayload?.baitName;
            const responseQuantity = normalizeQuantity(
                payload?.newBaitQuantity,
            );
            const currentQuantity = normalizeQuantity(
                player?.baitInventory?.[baitId],
            );
            const purchasedQuantity = normalizeQuantity(
                requestPayload?.quantity,
            );
            const nextQuantity =
                responseQuantity ??
                (currentQuantity !== null && purchasedQuantity !== null
                    ? currentQuantity + purchasedQuantity
                    : null);
            let changed = updateBaitInventory(baitId, nextQuantity);

            if (payload?.newGold !== undefined) {
                changed = mergePlayer({ gold: payload.newGold }) || changed;
            }

            return { changed, shouldEvaluate: false };
        }

        return { changed: false, shouldEvaluate: false };
    }

    return {
        getPlayerSnapshot() {
            return player;
        },
        getUpdatedAt() {
            return updatedAt;
        },
        handleResponse,
    };
}
