import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createEmptyEarningsStats,
    filterEarningsStats,
    loadEarningsStats,
    updateEarningsStats,
} from '../arcaneangler/src/earnings.js';
import { EARNINGS_STORAGE_KEY } from '../arcaneangler/src/config.js';

const tinkerLarvaContext = {
    baitId: 'bait_1_medium',
    baitName: 'Tinker Larva',
    baitPrice: 100,
    biomeId: '1',
    biomeName: 'Tinker River',
};

test('鱼获会累加数量、直接金币、鱼获价值、鱼饵成本和经验', () => {
    const initialStats = createEmptyEarningsStats();
    const nextStats = updateEarningsStats(
        initialStats,
        {
            count: 2,
            fish: { baseGold: 40, name: 'Moon Carp' },
            goldGained: 12.5,
            rarity: 'Rare',
            xpGained: 8,
        },
        tinkerLarvaContext,
    );

    assert.equal(nextStats.casts, 1);
    assert.equal(nextStats.fish, 2);
    assert.equal(nextStats.gold, 12.5);
    assert.equal(nextStats.fishGold, 80);
    assert.equal(nextStats.baitCost, 100);
    assert.equal(nextStats.xp, 8);
    assert.equal(nextStats.rarityCounts.Rare, 2);
    assert.equal(nextStats.lastContext.baitId, 'bait_1_medium');

    const breakdown = Object.values(nextStats.breakdowns)[0];

    assert.equal(breakdown.casts, 1);
    assert.equal(breakdown.fishGold, 80);
    assert.equal(breakdown.baitCost, 100);
    assert.equal(initialStats.casts, 0);
});

test('宝箱和装备按独立分类统计', () => {
    const initialStats = createEmptyEarningsStats();
    const withChest = updateEarningsStats(initialStats, {
        rarity: 'Treasure Chest',
        treasureChest: true,
    });
    const withGear = updateEarningsStats(withChest, {
        gear: { name: 'Arcane Rod' },
        inventoryFull: false,
        rarity: 'Gears',
    });

    assert.equal(withGear.treasureChests, 1);
    assert.equal(withGear.gears, 1);
    assert.equal(withGear.rarityCounts['Treasure Chest'], 1);
    assert.equal(withGear.rarityCounts.Gears, 1);
});

test('统计可以按地图和鱼饵单独或组合聚合', () => {
    const castResult = {
        count: 1,
        fish: { baseGold: 40, name: 'Moon Carp' },
        goldGained: 20,
        rarity: 'Common',
    };
    const mapOneMedium = updateEarningsStats(
        createEmptyEarningsStats(),
        castResult,
        tinkerLarvaContext,
    );
    const mapOneHigh = updateEarningsStats(mapOneMedium, castResult, {
        ...tinkerLarvaContext,
        baitId: 'bait_1_high',
        baitName: 'River Nymph',
        baitPrice: 200,
    });
    const allStats = updateEarningsStats(mapOneHigh, castResult, {
        baitId: 'bait_2_medium',
        baitName: 'Pine Larva',
        baitPrice: 102,
        biomeId: '2',
        biomeName: 'Misty Pine Lake',
    });

    const mapOneStats = filterEarningsStats(allStats, { biomeId: '1' });
    const mediumBaitStats = filterEarningsStats(allStats, {
        baitId: 'bait_1_medium',
    });
    const exactStats = filterEarningsStats(allStats, {
        biomeId: '1',
        baitId: 'bait_1_high',
    });

    assert.equal(allStats.casts, 3);
    assert.equal(allStats.baitCost, 402);
    assert.equal(mapOneStats.casts, 2);
    assert.equal(mapOneStats.baitCost, 300);
    assert.equal(mediumBaitStats.casts, 1);
    assert.equal(mediumBaitStats.baitCost, 100);
    assert.equal(exactStats.casts, 1);
    assert.equal(exactStats.fishGold, 40);
});

test('鱼饵价格未知时记录未计成本的抛竿次数', () => {
    const stats = updateEarningsStats(
        createEmptyEarningsStats(),
        { rarity: 'Common' },
        {
            ...tinkerLarvaContext,
            baitPrice: null,
        },
    );

    assert.equal(stats.baitCost, 0);
    assert.equal(stats.unknownBaitCostCasts, 1);
});

test('旧版整体统计会保留并补齐新版字段', () => {
    const previousLocalStorage = globalThis.localStorage;

    globalThis.localStorage = {
        getItem(key) {
            assert.equal(key, EARNINGS_STORAGE_KEY);

            return JSON.stringify({
                casts: 12,
                fish: 20,
                gold: 300,
                rarityCounts: {
                    Common: 20,
                },
                startedAt: 123,
                xp: 500,
            });
        },
    };

    try {
        const stats = loadEarningsStats();

        assert.equal(stats.casts, 12);
        assert.equal(stats.gold, 300);
        assert.equal(stats.fishGold, 0);
        assert.equal(stats.baitCost, 0);
        assert.deepEqual(stats.breakdowns, {});
        assert.equal(stats.lastContext, null);
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});
