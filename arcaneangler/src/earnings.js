export function createEmptyEarningsStats() {
    return {
        startedAt: Date.now(),
        updatedAt: null,
        casts: 0,
        fish: 0,
        gold: 0,
        xp: 0,
        relics: 0,
        treasureChests: 0,
        gears: 0,
        rarityCounts: {},
    };
}

function toNonNegativeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : 0;
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
            ...emptyStats,
            startedAt:
                toNonNegativeNumber(savedStats.startedAt) ||
                emptyStats.startedAt,
            updatedAt: toNonNegativeNumber(savedStats.updatedAt) || null,
            casts: toNonNegativeNumber(savedStats.casts),
            fish: toNonNegativeNumber(savedStats.fish),
            gold: toNonNegativeNumber(savedStats.gold),
            xp: toNonNegativeNumber(savedStats.xp),
            relics: toNonNegativeNumber(savedStats.relics),
            treasureChests: toNonNegativeNumber(savedStats.treasureChests),
            gears: toNonNegativeNumber(savedStats.gears),
            rarityCounts:
                savedStats.rarityCounts &&
                typeof savedStats.rarityCounts === 'object'
                    ? savedStats.rarityCounts
                    : {},
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

export function updateEarningsStats(earningsStats, result) {
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
    const gold = toNonNegativeNumber(result.goldGained);
    const xp = toNonNegativeNumber(result.xpGained);
    const relics = toNonNegativeNumber(result.relicsGained);
    const category = isTreasure
        ? 'Treasure Chest'
        : isRelic
          ? 'Relic'
          : rarity === 'Gears'
            ? 'Gears'
            : rarity || 'Unknown';
    const earnedCount = isFish ? count : 1;

    return {
        ...earningsStats,
        updatedAt: Date.now(),
        casts: earningsStats.casts + 1,
        fish: earningsStats.fish + (isFish ? count : 0),
        gold: earningsStats.gold + gold,
        xp: earningsStats.xp + xp,
        relics: earningsStats.relics + relics,
        treasureChests: earningsStats.treasureChests + (isTreasure ? 1 : 0),
        gears: earningsStats.gears + (isGear ? 1 : 0),
        rarityCounts: {
            ...earningsStats.rarityCounts,
            [category]:
                toNonNegativeNumber(earningsStats.rarityCounts[category]) +
                earnedCount,
        },
    };
}
import { EARNINGS_STORAGE_KEY } from './config.js';
