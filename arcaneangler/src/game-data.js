let cachedBaits = null;
let cachedBaitCatalog = new Map();

function normalizeId(value, fallback) {
    return String(value ?? '').trim() || fallback;
}

function getBaitCatalog() {
    const baits = Array.isArray(window.BAITS) ? window.BAITS : [];

    if (baits !== cachedBaits) {
        cachedBaits = baits;
        cachedBaitCatalog = new Map(
            baits
                .filter((bait) => bait?.id)
                .map((bait) => [String(bait.id), bait]),
        );
    }

    return cachedBaitCatalog;
}

function getBaitById(baitId) {
    if (typeof window.getBaitById === 'function') {
        try {
            const bait = window.getBaitById(baitId);

            if (bait) {
                return bait;
            }
        } catch (error) {
            console.warn('[收益统计] 无法从页面查询鱼饵信息：', error);
        }
    }

    return getBaitCatalog().get(baitId) ?? null;
}

function normalizeBaitPrice(value) {
    const price = Number(value);

    return Number.isFinite(price) && price >= 0 ? price : null;
}

export function getCastEarningsContext(result) {
    const biomeId = normalizeId(result.currentBiome, 'unknown');
    const baitId = normalizeId(result.equippedBait, 'unknown');
    const biome = window.BIOMES?.[biomeId] ?? null;
    const bait = getBaitById(baitId);

    return {
        biomeId,
        biomeName: String(biome?.name ?? '').trim() || `地图 ${biomeId}`,
        baitId,
        baitName: String(bait?.name ?? '').trim() || baitId,
        baitPrice: normalizeBaitPrice(bait?.price),
    };
}
