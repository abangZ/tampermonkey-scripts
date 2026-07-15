import { EARNINGS_STORAGE_KEY } from './config.js';

function createEmptyEarningsCounters() {
    return {
        casts: 0,
        fish: 0,
        gold: 0,
        fishGold: 0,
        baitCost: 0,
        unknownBaitCostCasts: 0,
        xp: 0,
        relics: 0,
        treasureChests: 0,
        gears: 0,
        rarityCounts: {},
    };
}

export function createEmptyEarningsStats() {
    return {
        startedAt: Date.now(),
        updatedAt: null,
        ...createEmptyEarningsCounters(),
        breakdowns: {},
        lastContext: null,
    };
}

function toNonNegativeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : 0;
}

function toNullableNonNegativeNumber(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeRarityCounts(rarityCounts) {
    if (!rarityCounts || typeof rarityCounts !== 'object') {
        return {};
    }

    return Object.fromEntries(
        Object.entries(rarityCounts)
            .map(([category, count]) => [
                String(category),
                toNonNegativeNumber(count),
            ])
            .filter(([, count]) => count > 0),
    );
}

function normalizeEarningsCounters(source) {
    return {
        casts: toNonNegativeNumber(source?.casts),
        fish: toNonNegativeNumber(source?.fish),
        gold: toNonNegativeNumber(source?.gold),
        fishGold: toNonNegativeNumber(source?.fishGold),
        baitCost: toNonNegativeNumber(source?.baitCost),
        unknownBaitCostCasts: toNonNegativeNumber(source?.unknownBaitCostCasts),
        xp: toNonNegativeNumber(source?.xp),
        relics: toNonNegativeNumber(source?.relics),
        treasureChests: toNonNegativeNumber(source?.treasureChests),
        gears: toNonNegativeNumber(source?.gears),
        rarityCounts: normalizeRarityCounts(source?.rarityCounts),
    };
}

function normalizeDimensionId(value) {
    return String(value ?? '').trim();
}

function normalizeEarningsContext(context) {
    if (!context || typeof context !== 'object') {
        return null;
    }

    const biomeId = normalizeDimensionId(context.biomeId);
    const baitId = normalizeDimensionId(context.baitId);

    if (!biomeId || !baitId) {
        return null;
    }

    return {
        biomeId,
        biomeName: String(context.biomeName ?? '').trim() || `地图 ${biomeId}`,
        baitId,
        baitName: String(context.baitName ?? '').trim() || baitId,
        baitPrice: toNullableNonNegativeNumber(context.baitPrice),
    };
}

function createBreakdownKey(context) {
    return JSON.stringify([context.biomeId, context.baitId]);
}

function normalizeBreakdowns(breakdowns) {
    if (!breakdowns || typeof breakdowns !== 'object') {
        return {};
    }

    const normalizedBreakdowns = {};

    for (const breakdown of Object.values(breakdowns)) {
        const context = normalizeEarningsContext(breakdown);

        if (!context) {
            continue;
        }

        normalizedBreakdowns[createBreakdownKey(context)] = {
            ...context,
            startedAt: toNonNegativeNumber(breakdown.startedAt) || Date.now(),
            updatedAt: toNonNegativeNumber(breakdown.updatedAt) || null,
            ...normalizeEarningsCounters(breakdown),
        };
    }

    return normalizedBreakdowns;
}

export function loadEarningsStats() {
    const emptyStats = createEmptyEarningsStats();

    try {
        const savedStats = JSON.parse(
            localStorage.getItem(EARNINGS_STORAGE_KEY),
        );

        if (!savedStats || typeof savedStats !== 'object') {
            return emptyStats;
        }

        return {
            startedAt:
                toNonNegativeNumber(savedStats.startedAt) ||
                emptyStats.startedAt,
            updatedAt: toNonNegativeNumber(savedStats.updatedAt) || null,
            ...normalizeEarningsCounters(savedStats),
            breakdowns: normalizeBreakdowns(savedStats.breakdowns),
            lastContext: normalizeEarningsContext(savedStats.lastContext),
        };
    } catch (error) {
        console.warn('[收益统计] 无法读取本地统计：', error);
        return emptyStats;
    }
}

export function saveEarningsStats(earningsStats) {
    try {
        localStorage.setItem(
            EARNINGS_STORAGE_KEY,
            JSON.stringify(earningsStats),
        );
    } catch (error) {
        console.warn('[收益统计] 无法保存本地统计：', error);
    }
}

function getCastEarnings(result, context) {
    const rarity = String(result.rarity ?? '').trim();
    const count = Math.max(1, toNonNegativeNumber(result.count));
    const isTreasure =
        Boolean(result.treasureChest) || rarity === 'Treasure Chest';
    const isRelic = rarity === 'Relic';
    const isGear =
        rarity === 'Gears' && Boolean(result.gear) && !result.inventoryFull;
    const isFish =
        Boolean(result.fish?.name) &&
        !isTreasure &&
        !isRelic &&
        rarity !== 'Gears';
    const baitPrice = toNullableNonNegativeNumber(context?.baitPrice);
    const hasBait = Boolean(context?.baitId);
    const category = isTreasure
        ? 'Treasure Chest'
        : isRelic
          ? 'Relic'
          : rarity === 'Gears'
            ? 'Gears'
            : rarity || 'Unknown';

    return {
        casts: 1,
        fish: isFish ? count : 0,
        gold: toNonNegativeNumber(result.goldGained),
        fishGold: isFish
            ? toNonNegativeNumber(result.fish?.baseGold) * count
            : 0,
        baitCost: baitPrice ?? 0,
        unknownBaitCostCasts: hasBait && baitPrice === null ? 1 : 0,
        xp: toNonNegativeNumber(result.xpGained),
        relics: toNonNegativeNumber(result.relicsGained),
        treasureChests: isTreasure ? 1 : 0,
        gears: isGear ? 1 : 0,
        category,
        earnedCount: isFish ? count : 1,
    };
}

function incrementEarningsSummary(summary, castEarnings, updatedAt) {
    return {
        ...summary,
        updatedAt,
        casts: summary.casts + castEarnings.casts,
        fish: summary.fish + castEarnings.fish,
        gold: summary.gold + castEarnings.gold,
        fishGold: summary.fishGold + castEarnings.fishGold,
        baitCost: summary.baitCost + castEarnings.baitCost,
        unknownBaitCostCasts:
            summary.unknownBaitCostCasts + castEarnings.unknownBaitCostCasts,
        xp: summary.xp + castEarnings.xp,
        relics: summary.relics + castEarnings.relics,
        treasureChests: summary.treasureChests + castEarnings.treasureChests,
        gears: summary.gears + castEarnings.gears,
        rarityCounts: {
            ...summary.rarityCounts,
            [castEarnings.category]:
                toNonNegativeNumber(
                    summary.rarityCounts[castEarnings.category],
                ) + castEarnings.earnedCount,
        },
    };
}

export function updateEarningsStats(earningsStats, result, context = null) {
    const updatedAt = Date.now();
    const normalizedContext = normalizeEarningsContext(context);
    const castEarnings = getCastEarnings(result, normalizedContext);
    const nextStats = incrementEarningsSummary(
        earningsStats,
        castEarnings,
        updatedAt,
    );

    if (!normalizedContext) {
        return nextStats;
    }

    const key = createBreakdownKey(normalizedContext);
    const currentBreakdown = earningsStats.breakdowns?.[key] ?? {
        ...normalizedContext,
        startedAt: updatedAt,
        updatedAt: null,
        ...createEmptyEarningsCounters(),
    };
    const nextBreakdown = incrementEarningsSummary(
        {
            ...currentBreakdown,
            ...normalizedContext,
        },
        castEarnings,
        updatedAt,
    );

    return {
        ...nextStats,
        breakdowns: {
            ...earningsStats.breakdowns,
            [key]: nextBreakdown,
        },
        lastContext: normalizedContext,
    };
}

function mergeRarityCounts(left, right) {
    const merged = { ...left };

    for (const [category, count] of Object.entries(right)) {
        merged[category] = toNonNegativeNumber(merged[category]) + count;
    }

    return merged;
}

export function filterEarningsStats(
    earningsStats,
    { biomeId = null, baitId = null } = {},
) {
    const normalizedBiomeId = biomeId === null ? null : String(biomeId);
    const normalizedBaitId = baitId === null ? null : String(baitId);

    if (normalizedBiomeId === null && normalizedBaitId === null) {
        return earningsStats;
    }

    let filteredStats = {
        startedAt: null,
        updatedAt: null,
        ...createEmptyEarningsCounters(),
    };

    for (const breakdown of Object.values(earningsStats.breakdowns ?? {})) {
        if (
            (normalizedBiomeId !== null &&
                breakdown.biomeId !== normalizedBiomeId) ||
            (normalizedBaitId !== null && breakdown.baitId !== normalizedBaitId)
        ) {
            continue;
        }

        filteredStats = {
            ...filteredStats,
            startedAt:
                filteredStats.startedAt === null
                    ? breakdown.startedAt
                    : Math.min(filteredStats.startedAt, breakdown.startedAt),
            updatedAt: Math.max(
                filteredStats.updatedAt ?? 0,
                breakdown.updatedAt ?? 0,
            ),
            casts: filteredStats.casts + breakdown.casts,
            fish: filteredStats.fish + breakdown.fish,
            gold: filteredStats.gold + breakdown.gold,
            fishGold: filteredStats.fishGold + breakdown.fishGold,
            baitCost: filteredStats.baitCost + breakdown.baitCost,
            unknownBaitCostCasts:
                filteredStats.unknownBaitCostCasts +
                breakdown.unknownBaitCostCasts,
            xp: filteredStats.xp + breakdown.xp,
            relics: filteredStats.relics + breakdown.relics,
            treasureChests:
                filteredStats.treasureChests + breakdown.treasureChests,
            gears: filteredStats.gears + breakdown.gears,
            rarityCounts: mergeRarityCounts(
                filteredStats.rarityCounts,
                breakdown.rarityCounts,
            ),
        };
    }

    return filteredStats;
}

export function listEarningsBreakdowns(earningsStats) {
    return Object.values(earningsStats.breakdowns ?? {});
}
