import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createEmptyEarningsStats,
    updateEarningsStats,
} from '../arcaneangler/src/earnings.js';

test('鱼获会累加次数、分类、金币和经验', () => {
    const initialStats = createEmptyEarningsStats();
    const nextStats = updateEarningsStats(initialStats, {
        count: 2,
        fish: { name: 'Moon Carp' },
        goldGained: 12.5,
        rarity: 'Rare',
        xpGained: 8,
    });

    assert.equal(nextStats.casts, 1);
    assert.equal(nextStats.fish, 2);
    assert.equal(nextStats.gold, 12.5);
    assert.equal(nextStats.xp, 8);
    assert.equal(nextStats.rarityCounts.Rare, 2);
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
