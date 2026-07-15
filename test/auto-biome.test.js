import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createAutoBiomeController,
    findAvailableBaitForBiome,
    getBiomeScore,
    normalizeWeatherByBiome,
    selectBestBiome,
} from '../arcaneangler/src/auto-biome.js';

class FakeEventSource {
    static instance = null;

    constructor(url) {
        this.url = url;
        FakeEventSource.instance = this;
    }

    emit(payload) {
        this.onmessage?.({
            data: JSON.stringify(payload),
        });
    }

    close() {}
}

test('地图评分会叠加天气经验和地图等级权重', () => {
    assert.equal(getBiomeScore(1, 30, 5), 30);
    assert.equal(getBiomeScore(4, 30, 5), 45);
    assert.equal(getBiomeScore(4, 30, 10), 60);
});

test('只从已解锁地图选择，鱼饵库存不影响候选地图', () => {
    const weatherByBiome = normalizeWeatherByBiome({
        weather: {
            1: { weather: 'rain', xpBonus: 20 },
            2: { weather: 'windy', xpBonus: 15 },
            3: { weather: 'clear', xpBonus: 10 },
            4: { weather: 'arcane_surge', xpBonus: 75 },
            5: { weather: 'arcane_surge', xpBonus: 1000 },
        },
    });
    const player = {
        baitInventory: {
            bait_1_low: 10,
            bait_2_low: 10,
            bait_3_low: 10,
            bait_4_low: 0,
        },
        currentBiome: 1,
        equippedBait: 'bait_1_low',
        unlockedBiomes: [1, 2, 3, 4],
    };

    assert.deepEqual(
        selectBestBiome({
            biomeWeight: 5,
            player,
            weatherByBiome,
        }),
        {
            baitId: null,
            biomeId: 4,
            score: 90,
            weather: 'arcane_surge',
            xpBonus: 75,
        },
    );
});

test('优先沿用当前鱼饵档位，没有时回退到其他可用档位', () => {
    assert.equal(
        findAvailableBaitForBiome(
            {
                baitInventory: {
                    bait_8_low: 0,
                    bait_8_medium: 0,
                    bait_8_high: 3,
                },
                equippedBait: 'bait_1_medium',
            },
            8,
        ),
        'bait_8_high',
    );
});

test('天气 SSE 更新后会切到评分最高的地图并同步装备', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        baitInventory: {
            bait_1_low: 10,
            bait_2_low: 10,
        },
        boat: null,
        currentBiome: 1,
        equippedBait: 'bait_1_low',
        equippedRod: 'rod_biome_1',
        ownedRods: ['rod_biome_1', 'rod_biome_2'],
        unlockedBiomes: [1, 2],
    };

    globalThis.window = {
        ApiService: {
            baseURL: 'https://arcaneangler.com/api',
            async changeBiome(biomeId) {
                calls.push(['changeBiome', biomeId]);
                return { success: true };
            },
            async equipBait(baitId) {
                calls.push(['equipBait', baitId]);
                return { success: true };
            },
            async equipRod(rodId) {
                calls.push(['equipRod', rodId]);
                return { success: true };
            },
            async getAllBiomeWeather() {
                return {
                    weather: {
                        1: { weather: 'rain', xpBonus: 50 },
                        2: { weather: 'clear', xpBonus: 0 },
                    },
                };
            },
            async getPlayerData() {
                return player;
            },
        },
        BIOMES: {
            1: { name: 'Tinker River' },
            2: { name: 'Misty Pine Lake' },
        },
        EventSource: FakeEventSource,
        clearTimeout() {},
        location: {
            origin: 'https://arcaneangler.com',
        },
    };

    try {
        const controller = createAutoBiomeController({
            getState() {
                return {
                    autoBiomeSettings: {
                        biomeWeight: 0,
                        enabled: true,
                    },
                    enabled: true,
                };
            },
        });

        controller.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(calls, []);

        FakeEventSource.instance.emit({
            type: 'weather_update',
            weather: {
                1: { weather: 'clear', xpBonus: 0 },
                2: { weather: 'arcane_surge', xpBonus: 75 },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.deepEqual(calls, [
            ['changeBiome', 2],
            ['equipBait', 'bait_2_low'],
            ['equipRod', 'rod_biome_2'],
        ]);
        assert.match(
            controller.getSnapshot().autoBiomeStatus,
            /已切换到 \[B2\]/,
        );
        controller.handleCastResult({ currentBiome: 2 });
        assert.match(controller.getSnapshot().autoBiomeStatus, /已在 \[B2\]/);
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
        FakeEventSource.instance = null;
    }
});
