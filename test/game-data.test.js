import assert from 'node:assert/strict';
import test from 'node:test';

import { getCastEarningsContext } from '../arcaneangler/src/game-data.js';

test('从页面地图和鱼饵目录读取抛竿统计上下文', () => {
    const previousWindow = globalThis.window;

    globalThis.window = {
        BAITS: [
            {
                id: 'bait_1_medium',
                name: 'Tinker Larva',
                price: 100,
            },
        ],
        BIOMES: {
            1: {
                name: 'Tinker River',
            },
        },
    };

    try {
        assert.deepEqual(
            getCastEarningsContext({
                currentBiome: 1,
                equippedBait: 'bait_1_medium',
            }),
            {
                baitId: 'bait_1_medium',
                baitName: 'Tinker Larva',
                baitPrice: 100,
                biomeId: '1',
                biomeName: 'Tinker River',
            },
        );
    } finally {
        globalThis.window = previousWindow;
    }
});
