import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createAutoBiomeController,
    findAvailableBaitForBiome,
    getBiomeScore,
    normalizeWeatherByBiome,
    normalizeWeatherResponse,
    resolveCompetitionBiomes,
    selectBestBiome,
} from '../arcaneangler/src/auto-biome.js';
import { loadAutoBiomeSettings } from '../arcaneangler/src/storage.js';

test('地图评分会叠加天气经验和地图等级权重', () => {
    assert.equal(getBiomeScore(1, 30, 5), 30);
    assert.equal(getBiomeScore(4, 30, 5), 45);
    assert.equal(getBiomeScore(4, 30, 10), 60);
});

test('单地图天气接口响应会归一化到对应地图', () => {
    assert.deepEqual(
        normalizeWeatherResponse('/api/game/weather/3', {
            weather: 'rain',
            xpBonus: 25,
        }),
        {
            3: {
                weather: 'rain',
                xpBonus: 25,
            },
        },
    );
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

test('公会锦标赛优先于个人比赛，比赛优先于天气评分', () => {
    const weatherByBiome = normalizeWeatherByBiome({
        weather: {
            1: { weather: 'arcane_surge', xpBonus: 100 },
            2: { weather: 'clear', xpBonus: 0 },
            3: { weather: 'clear', xpBonus: 0 },
            4: { weather: 'arcane_surge', xpBonus: 200 },
        },
    });
    const player = {
        currentBiome: 1,
        unlockedBiomes: [1, 2, 3, 4],
    };
    const competitionBiomes = {
        guildTournamentBiomeId: 3,
        personalDerbyBiomeId: 2,
    };

    assert.deepEqual(
        selectBestBiome({
            biomeWeight: 5,
            competitionBiomes,
            player,
            preferCompetitionBiomes: true,
            weatherByBiome,
        }),
        {
            baitId: null,
            biomeId: 3,
            competitionType: 'guild',
            score: 10,
            weather: 'clear',
            xpBonus: 0,
        },
    );

    assert.equal(
        selectBestBiome({
            biomeWeight: 5,
            competitionBiomes,
            player: {
                ...player,
                unlockedBiomes: [1, 2, 4],
            },
            preferCompetitionBiomes: true,
            weatherByBiome,
        }).biomeId,
        2,
    );

    assert.equal(
        selectBestBiome({
            biomeWeight: 5,
            competitionBiomes,
            player,
            preferCompetitionBiomes: false,
            weatherByBiome,
        }).biomeId,
        4,
    );
});

test('只识别已经报名的个人比赛和当前公会参加的锦标赛', () => {
    assert.deepEqual(
        resolveCompetitionBiomes({
            derbyResponse: {
                active: {
                    biome_id: 4,
                    is_registered: true,
                },
            },
            guildResponse: {
                guild: {
                    guild_id: 7,
                },
            },
            tournamentResponse: {
                active: {
                    biome_id: 5,
                },
            },
            tournamentStandingsResponse: {
                standings: [{ guild_id: 7 }],
            },
        }),
        {
            guildTournamentBiomeId: 5,
            personalDerbyBiomeId: 4,
        },
    );

    assert.deepEqual(
        resolveCompetitionBiomes({
            derbyResponse: {
                active: {
                    biome_id: 4,
                    is_registered: false,
                },
            },
            guildResponse: {
                guild: {
                    guild_id: 7,
                },
            },
            tournamentResponse: {
                active: {
                    biome_id: 5,
                },
            },
            tournamentStandingsResponse: {
                standings: [{ guild_id: 8 }],
            },
        }),
        {
            guildTournamentBiomeId: null,
            personalDerbyBiomeId: null,
        },
    );
});

test('旧版自动换图设置默认开启比赛地图优先', () => {
    const previousLocalStorage = globalThis.localStorage;

    globalThis.localStorage = {
        getItem() {
            return JSON.stringify({
                biomeWeight: 10,
                enabled: true,
            });
        },
    };

    try {
        assert.deepEqual(loadAutoBiomeSettings(), {
            biomeWeight: 10,
            enabled: true,
            preferCompetitionBiomes: true,
        });
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});

test('控制器会聚合游戏 hook 捕获的比赛响应', () => {
    const previousWindow = globalThis.window;

    globalThis.window = {
        clearTimeout() {},
        setTimeout() {
            return 1;
        },
    };

    try {
        const controller = createAutoBiomeController({
            getState() {
                return {};
            },
        });

        controller.handleCompetitionResponse({
            pathname: '/api/guild/tournaments/current',
            payload: {
                active: {
                    biome_id: 5,
                    id: 12,
                },
            },
        });
        controller.handleCompetitionResponse({
            pathname: '/api/guild/tournaments/12/standings',
            payload: {
                standings: [{ guild_id: 7 }],
            },
        });
        controller.handleCompetitionResponse({
            pathname: '/api/guild/my-guild',
            payload: {
                guild: { guild_id: 7 },
            },
        });
        controller.handleCompetitionResponse({
            pathname: '/api/derby/current',
            payload: {
                active: {
                    biome_id: 4,
                    is_registered: true,
                },
            },
        });
        controller.handleCompetitionResponse({
            pathname: '/api/guild/tournaments/13/standings',
            payload: {
                standings: [{ guild_id: 8 }],
            },
        });

        const snapshot = controller.getSnapshot();

        assert.deepEqual(snapshot.autoBiomeCompetitionBiomes, {
            guildTournamentBiomeId: 5,
            personalDerbyBiomeId: 4,
        });
        assert.equal(snapshot.autoBiomeCompetitionStatus, '公会 B5 · 个人 B4');
        assert.ok(snapshot.autoBiomeCompetitionUpdatedAt > 0);
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
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

test('游戏天气 hook 更新后会切到评分最高的地图并同步装备', async () => {
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
        },
        BIOMES: {
            1: { name: 'Tinker River' },
            2: { name: 'Misty Pine Lake' },
        },
        clearTimeout() {},
        location: {
            origin: 'https://arcaneangler.com',
        },
        setTimeout() {
            return 1;
        },
    };

    try {
        const controller = createAutoBiomeController({
            getPlayer() {
                return player;
            },
            getState() {
                return {
                    autoBiomeSettings: {
                        biomeWeight: 0,
                        enabled: true,
                        preferCompetitionBiomes: false,
                    },
                    enabled: true,
                };
            },
        });

        controller.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(calls, []);

        controller.handleWeatherResponse({
            pathname: '/api/game/weather/stream',
            payload: {
                type: 'weather_update',
                weather: {
                    1: { weather: 'clear', xpBonus: 0 },
                    2: { weather: 'arcane_surge', xpBonus: 75 },
                },
            },
            source: 'stream',
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
    }
});
