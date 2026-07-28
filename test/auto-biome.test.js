import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createAutoBiomeController,
    findAvailableBaitForBiome,
    findMatchingDailyQuests,
    getBiomeScore,
    normalizeDailyQuests,
    normalizeGuildBoostersByBiome,
    normalizeMasteryXpBonusesByBiome,
    normalizeWeatherByBiome,
    normalizeWeatherResponse,
    resolveCompetitionBiomes,
    selectBestBiome,
} from '../arcaneangler/src/auto-biome.js';
import {
    AUTO_BIOME_PRIORITY_IDS,
    DEFAULT_AUTO_BIOME_PRIORITY_ORDER,
} from '../arcaneangler/src/auto-biome-priority.js';
import { loadAutoBiomeSettings } from '../arcaneangler/src/storage.js';

const {
    arcaneSurge,
    dailyQuest,
    goldBreeze,
    guildCompetition,
    personalCompetition,
    weightedExperience,
} = AUTO_BIOME_PRIORITY_IDS;

function createPriorityOrder(...enabledPriorities) {
    return [
        ...enabledPriorities,
        weightedExperience,
        ...DEFAULT_AUTO_BIOME_PRIORITY_ORDER.filter(
            (priorityId) =>
                priorityId !== weightedExperience &&
                !enabledPriorities.includes(priorityId),
        ),
    ];
}

test('地图评分会叠加天气经验、公会加成、精通加成和地图等级权重', () => {
    assert.equal(getBiomeScore(1, 30, 5), 30);
    assert.equal(getBiomeScore(4, 30, 5), 45);
    assert.equal(getBiomeScore(4, 30, 10), 60);
    assert.equal(getBiomeScore(4, 30, 10, 50), 110);
    assert.equal(getBiomeScore(4, 30, 10, 50, 5), 115);
});

test('公会经验加成会按地图归一化', () => {
    const now = Date.parse('2026-07-24T00:00:00.000Z');

    assert.deepEqual(
        normalizeGuildBoostersByBiome(
            {
                boosters: [
                    {
                        biome_id: 2,
                        bonus_percent: 50,
                        expires_at: '2026-07-24T00:30:00.000Z',
                    },
                    {
                        biome_id: '3',
                        bonus_percent: '60',
                        expires_at: '2026-07-24T00:00:00.000Z',
                    },
                    { biome_id: '4', bonus_percent: '75' },
                    { biome_id: 0, bonus_percent: 100 },
                ],
            },
            now,
        ),
        {
            2: 50,
            4: 75,
        },
    );
});

test('地图精通经验加成会按地图归一化', () => {
    assert.deepEqual(
        normalizeMasteryXpBonusesByBiome({
            mastery: {
                1: { biomeId: 1, masteryLevel: 1, xpBonus: 5 },
                2: { biome_id: '2', mastery_level: 2 },
                3: { biomeId: 0, masteryLevel: 3, xpBonus: 15 },
            },
        }),
        {
            1: 5,
            2: 10,
        },
    );
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

test('每日任务会从 metadata 归一化地图与天气条件', () => {
    const dailyQuests = normalizeDailyQuests({
        quests: {
            daily: [
                {
                    completed: 0,
                    current_progress: 7,
                    description:
                        'Catch 279 fish in your current biome (Tinker River).',
                    expires_at: '2099-01-01T00:00:00.000Z',
                    id: 250677,
                    metadata: {
                        biome_rule: 'current',
                        targetBiome: 1,
                    },
                    target_amount: 279,
                },
                {
                    completed: 0,
                    current_progress: 0,
                    description: 'Cast 238 times during Arcane Surge weather.',
                    id: 250680,
                    metadata: JSON.stringify({
                        weather_rule: 'arcane_surge',
                    }),
                    target_amount: 238,
                },
                {
                    completed: 1,
                    description: 'Catch 3 treasure chests.',
                    id: 250678,
                    metadata: {},
                },
            ],
        },
    });

    assert.deepEqual(dailyQuests, [
        {
            completed: false,
            expiresAt: '2099-01-01T00:00:00.000Z',
            id: 250677,
            targetBiome: 1,
            weatherRule: null,
        },
        {
            completed: false,
            expiresAt: null,
            id: 250680,
            targetBiome: null,
            weatherRule: 'arcane_surge',
        },
        {
            completed: true,
            expiresAt: null,
            id: 250678,
            targetBiome: null,
            weatherRule: null,
        },
    ]);
    assert.deepEqual(
        findMatchingDailyQuests({
            biomeId: 1,
            dailyQuests,
            now: Date.parse('2026-07-17T00:00:00.000Z'),
            weather: 'clear',
        }).map((quest) => quest.id),
        [250677],
    );
    assert.deepEqual(
        findMatchingDailyQuests({
            biomeId: 4,
            dailyQuests,
            now: Date.parse('2026-07-17T00:00:00.000Z'),
            weather: 'arcane_surge',
        }).map((quest) => quest.id),
        [250680],
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
            selectionPriority: arcaneSurge,
            weather: 'arcane_surge',
            xpBonus: 75,
        },
    );
});

test('加权经验对比会把指定地图的公会 buff 算入评分', () => {
    const player = {
        currentBiome: 1,
        unlockedBiomes: [1, 2],
    };
    const weatherByBiome = {
        1: { weather: 'rain', xpBonus: 30 },
        2: { weather: 'clear', xpBonus: 0 },
    };

    assert.deepEqual(
        selectBestBiome({
            biomeWeight: 0,
            guildBoostersByBiome: { 2: 50 },
            player,
            priorityOrder: createPriorityOrder(),
            weatherByBiome,
        }),
        {
            baitId: null,
            biomeId: 2,
            guildXpBonus: 50,
            score: 50,
            selectionPriority: weightedExperience,
            weather: 'clear',
            xpBonus: 0,
        },
    );
});

test('加权经验对比会把指定地图的精通加成算入评分', () => {
    const player = {
        currentBiome: 1,
        unlockedBiomes: [1, 2],
    };
    const weatherByBiome = {
        1: { weather: 'rain', xpBonus: 30 },
        2: { weather: 'clear', xpBonus: 27 },
    };

    assert.deepEqual(
        selectBestBiome({
            biomeWeight: 0,
            masteryXpBonusesByBiome: { 2: 5 },
            player,
            priorityOrder: createPriorityOrder(),
            weatherByBiome,
        }),
        {
            baitId: null,
            biomeId: 2,
            masteryXpBonus: 5,
            score: 32,
            selectionPriority: weightedExperience,
            weather: 'clear',
            xpBonus: 27,
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
            priorityOrder: createPriorityOrder(
                guildCompetition,
                personalCompetition,
            ),
            weatherByBiome,
        }),
        {
            baitId: null,
            biomeId: 3,
            competitionType: 'guild',
            score: 10,
            selectionPriority: guildCompetition,
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
            priorityOrder: createPriorityOrder(
                guildCompetition,
                personalCompetition,
            ),
            weatherByBiome,
        }).biomeId,
        2,
    );

    assert.equal(
        selectBestBiome({
            biomeWeight: 5,
            competitionBiomes,
            player,
            priorityOrder: createPriorityOrder(),
            weatherByBiome,
        }).biomeId,
        4,
    );
});

test('排序列表会决定比赛、天气与加权经验的优先级', () => {
    const weatherByBiome = normalizeWeatherByBiome({
        weather: {
            1: { weather: 'gold_breeze', xpBonus: -25 },
            2: { weather: 'arcane_surge', xpBonus: 100 },
            3: { weather: 'clear', xpBonus: 0 },
        },
    });
    const player = {
        currentBiome: 2,
        unlockedBiomes: [1, 2, 3],
    };

    assert.equal(
        selectBestBiome({
            biomeWeight: 0,
            competitionBiomes: { guildTournamentBiomeId: 3 },
            player,
            priorityOrder: createPriorityOrder(guildCompetition, goldBreeze),
            weatherByBiome,
        }).biomeId,
        3,
    );
    assert.equal(
        selectBestBiome({
            biomeWeight: 0,
            player,
            priorityOrder: createPriorityOrder(goldBreeze),
            weatherByBiome,
        }).biomeId,
        1,
    );
    assert.equal(
        selectBestBiome({
            biomeWeight: 0,
            player,
            priorityOrder: createPriorityOrder(),
            weatherByBiome,
        }).biomeId,
        2,
    );
});

test('奥术涌动默认高于金风，拖动后可以让金风优先', () => {
    const weatherByBiome = normalizeWeatherByBiome({
        weather: {
            1: { weather: 'gold_breeze', xpBonus: 500 },
            2: { weather: 'arcane_surge', xpBonus: 75 },
        },
    });
    const player = {
        currentBiome: 1,
        unlockedBiomes: [1, 2],
    };

    assert.equal(
        selectBestBiome({
            biomeWeight: 0,
            player,
            priorityOrder: DEFAULT_AUTO_BIOME_PRIORITY_ORDER,
            weatherByBiome,
        }).biomeId,
        2,
    );
    assert.equal(
        selectBestBiome({
            biomeWeight: 0,
            player,
            priorityOrder: createPriorityOrder(goldBreeze, arcaneSurge),
            weatherByBiome,
        }).biomeId,
        1,
    );
});

test('每日任务低于金风、高于普通图，并从匹配地图中选择经验评分最高项', () => {
    const weatherByBiome = normalizeWeatherByBiome({
        weather: {
            1: { weather: 'gold_breeze', xpBonus: -25 },
            2: { weather: 'clear', xpBonus: 500 },
            3: { weather: 'arcane_surge', xpBonus: 75 },
            4: { weather: 'arcane_surge', xpBonus: 150 },
        },
    });
    const dailyQuests = normalizeDailyQuests({
        quests: {
            daily: [
                {
                    completed: 0,
                    id: 1,
                    metadata: { targetBiome: 1 },
                },
                {
                    completed: 0,
                    id: 2,
                    metadata: { weather_rule: 'arcane_surge' },
                },
            ],
        },
    });
    const player = {
        currentBiome: 2,
        unlockedBiomes: [1, 2, 3],
    };

    assert.deepEqual(
        selectBestBiome({
            biomeWeight: 5,
            dailyQuests,
            player,
            priorityOrder: createPriorityOrder(dailyQuest),
            weatherByBiome,
        }),
        {
            baitId: null,
            biomeId: 3,
            dailyQuestCount: 1,
            score: 85,
            selectionPriority: dailyQuest,
            weather: 'arcane_surge',
            xpBonus: 75,
        },
    );
    assert.equal(
        selectBestBiome({
            biomeWeight: 5,
            dailyQuests,
            player,
            priorityOrder: createPriorityOrder(goldBreeze, dailyQuest),
            weatherByBiome,
        }).biomeId,
        1,
    );
    assert.equal(
        selectBestBiome({
            biomeWeight: 5,
            competitionBiomes: { guildTournamentBiomeId: 2 },
            dailyQuests,
            player,
            priorityOrder: createPriorityOrder(
                guildCompetition,
                goldBreeze,
                dailyQuest,
            ),
            weatherByBiome,
        }).biomeId,
        2,
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

test('旧版自动换图设置会迁移到排序列表并保留原开关', () => {
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
            priorityOrder: createPriorityOrder(
                guildCompetition,
                personalCompetition,
                arcaneSurge,
            ),
        });
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});

test('首次使用自动换图时采用完整默认优先级', () => {
    const previousLocalStorage = globalThis.localStorage;

    globalThis.localStorage = {
        getItem() {
            return null;
        },
    };

    try {
        assert.deepEqual(loadAutoBiomeSettings(), {
            biomeWeight: 5,
            enabled: false,
            priorityOrder: DEFAULT_AUTO_BIOME_PRIORITY_ORDER,
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

test('控制器会读取 fetch hook 捕获的公会经验加成', () => {
    const previousWindow = globalThis.window;
    const previousDateNow = Date.now;
    const scheduledCallbacks = [];
    let now = Date.parse('2026-07-24T00:00:00.000Z');

    globalThis.window = {
        clearTimeout() {},
        setTimeout(callback) {
            scheduledCallbacks.push(callback);
            return scheduledCallbacks.length;
        },
    };
    Date.now = () => now;

    try {
        const controller = createAutoBiomeController({
            getState() {
                return {};
            },
        });

        assert.equal(
            controller.handleGuildBoosterResponse({
                pathname: '/api/guild/boosters/active',
                payload: {
                    boosters: [
                        {
                            biome_id: 5,
                            bonus_percent: 75,
                            expires_at: '2026-07-23T23:59:59.000Z',
                        },
                        {
                            biome_id: 6,
                            bonus_percent: 50,
                            expires_at: '2026-07-24T00:30:00.000Z',
                        },
                    ],
                },
            }),
            true,
        );
        assert.deepEqual(
            controller.getSnapshot().autoBiomeGuildBoostersByBiome,
            { 6: 50 },
        );

        now = Date.parse('2026-07-24T00:30:00.050Z');
        scheduledCallbacks[0]();
        assert.deepEqual(
            controller.getSnapshot().autoBiomeGuildBoostersByBiome,
            {},
        );
        controller.destroy();
    } finally {
        Date.now = previousDateNow;
        globalThis.window = previousWindow;
    }
});

test('控制器初始化只读取一次地图精通并用于首次选图', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        boat: null,
        currentBiome: 1,
        unlockedBiomes: [1, 2],
    };

    globalThis.window = {
        ApiService: {
            async changeBiome(biomeId) {
                calls.push(['changeBiome', biomeId]);
                player.currentBiome = biomeId;
                return { success: true };
            },
            async getAllBiomeWeather() {
                return {
                    weather: {
                        1: { weather: 'rain', xpBonus: 30 },
                        2: { weather: 'clear', xpBonus: 27 },
                    },
                };
            },
            async request(pathname) {
                calls.push(['request', pathname]);
                return {
                    mastery: {
                        1: { biomeId: 1, masteryLevel: 0, xpBonus: 0 },
                        2: { biomeId: 2, masteryLevel: 1, xpBonus: 5 },
                    },
                };
            },
        },
        BIOMES: {
            2: { name: 'Misty Pine Lake' },
        },
        clearTimeout() {},
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
                        priorityOrder: createPriorityOrder(),
                    },
                    enabled: true,
                };
            },
        });

        controller.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        await controller.handleStateChanged();

        assert.deepEqual(calls, [
            ['request', '/mastery'],
            ['changeBiome', 2],
        ]);
        assert.deepEqual(
            controller.getSnapshot().autoBiomeMasteryXpBonusesByBiome,
            { 2: 5 },
        );
        assert.match(
            controller.getSnapshot().autoBiomeStatus,
            /精通 \+5%.*评分 32/,
        );
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('控制器会读取 fetch hook 捕获的每日任务响应', () => {
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

        assert.equal(
            controller.handleQuestResponse({
                pathname: '/api/quests',
                payload: {
                    quests: {
                        daily: [
                            {
                                completed: 0,
                                id: 250677,
                                metadata: { targetBiome: 1 },
                            },
                            {
                                completed: 0,
                                id: 250680,
                                metadata: {
                                    weather_rule: 'arcane_surge',
                                },
                            },
                        ],
                    },
                },
            }),
            true,
        );

        const snapshot = controller.getSnapshot();

        assert.equal(snapshot.autoBiomeDailyQuestStatus, 'B1 · 奥术涌动');
        assert.equal(snapshot.autoBiomeDailyQuests.length, 2);
        assert.ok(snapshot.autoBiomeDailyQuestUpdatedAt > 0);
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('关闭自动换图后不会因小时兜底或完成任务刷新每日任务', async () => {
    const previousWindow = globalThis.window;
    const scheduledCallbacks = [];
    let questRequestCount = 0;

    globalThis.window = {
        ApiService: {
            async getAllBiomeWeather() {
                return {
                    weather: {
                        1: { weather: 'clear', xpBonus: 0 },
                    },
                };
            },
            async getQuests() {
                questRequestCount += 1;
                return { quests: { daily: [] } };
            },
        },
        clearTimeout() {},
        setTimeout(callback) {
            scheduledCallbacks.push(callback);
            return scheduledCallbacks.length;
        },
    };

    try {
        const controller = createAutoBiomeController({
            getState() {
                return {
                    autoBiomeSettings: {
                        enabled: false,
                        priorityOrder: createPriorityOrder(dailyQuest),
                    },
                    enabled: true,
                };
            },
        });

        controller.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await scheduledCallbacks[0]();
        controller.handleCastResult({ completedQuests: [250677] });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(questRequestCount, 0);
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('每日任务响应缺少 daily 数组时会结束读取状态', async () => {
    const previousWindow = globalThis.window;

    globalThis.window = {
        ApiService: {
            async getQuests() {
                return { success: true };
            },
        },
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

        await controller.refreshDailyQuests();

        assert.equal(
            controller.getSnapshot().autoBiomeDailyQuestStatus,
            '每日任务响应异常，按普通地图选择',
        );
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('主动读取与 fetch hook 捕获同一每日任务响应时只重新评估一次', async () => {
    const previousWindow = globalThis.window;
    const payload = {
        quests: {
            daily: [
                {
                    completed: 0,
                    id: 250677,
                    metadata: { targetBiome: 1 },
                },
            ],
        },
    };
    let controller;
    let evaluationCount = 0;

    globalThis.window = {
        ApiService: {
            async getQuests() {
                controller.handleQuestResponse({
                    pathname: '/api/quests',
                    payload,
                    source: 'fetch',
                });
                return payload;
            },
        },
        clearTimeout() {},
        setTimeout() {
            return 1;
        },
    };

    try {
        controller = createAutoBiomeController({
            getState() {
                evaluationCount += 1;
                return {};
            },
        });

        await controller.refreshDailyQuests();
        controller.handleQuestResponse({
            pathname: '/api/quests',
            payload,
            source: 'fetch',
        });

        assert.equal(evaluationCount, 1);
        assert.equal(controller.getSnapshot().autoBiomeDailyQuestStatus, 'B1');
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('开启每日任务优先后会主动读取任务并切到匹配地图', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        boat: null,
        currentBiome: 1,
        unlockedBiomes: [1, 2, 3],
    };

    globalThis.window = {
        ApiService: {
            async changeBiome(biomeId) {
                calls.push(['changeBiome', biomeId]);
                return { success: true };
            },
            async getAllBiomeWeather() {
                return {
                    weather: {
                        1: { weather: 'clear', xpBonus: 0 },
                        2: { weather: 'arcane_surge', xpBonus: 75 },
                        3: { weather: 'clear', xpBonus: 500 },
                    },
                };
            },
            async getQuests() {
                calls.push(['getQuests']);
                return {
                    quests: {
                        daily: [
                            {
                                completed: 0,
                                id: 250680,
                                metadata: {
                                    weather_rule: 'arcane_surge',
                                },
                            },
                        ],
                    },
                    success: true,
                };
            },
        },
        BIOMES: {
            2: { name: 'Sunken Ruins' },
        },
        clearTimeout() {},
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
                        priorityOrder: createPriorityOrder(dailyQuest),
                    },
                    enabled: true,
                };
            },
        });

        controller.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.deepEqual(calls, [['getQuests'], ['changeBiome', 2]]);
        assert.match(
            controller.getSnapshot().autoBiomeStatus,
            /每日任务优先.*\[B2\]/,
        );
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
                        priorityOrder: createPriorityOrder(),
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

test('组队普通队员收到天气更新也不会自动切图', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        boat: { boat_id: 7, isActive: true, role: 'member' },
        currentBiome: 1,
        unlockedBiomes: [1, 2],
    };

    globalThis.window = {
        ApiService: {
            async changeBiome(biomeId) {
                calls.push(['changeBiome', biomeId]);
                return { success: true };
            },
            async changeBoatBiome(biomeId) {
                calls.push(['changeBoatBiome', biomeId]);
                return { success: true };
            },
        },
        clearTimeout() {},
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
                        priorityOrder: createPriorityOrder(),
                    },
                    enabled: true,
                };
            },
        });

        controller.handleWeatherResponse({
            pathname: '/api/game/weather',
            payload: {
                weather: {
                    1: { weather: 'clear', xpBonus: 0 },
                    2: { weather: 'arcane_surge', xpBonus: 75 },
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.deepEqual(calls, []);
        assert.equal(
            controller.getSnapshot().autoBiomeStatus,
            '组队中，等待队长换图',
        );
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('组队队长会通过组队接口自动切换整队地图', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        boat: { boat_id: 7, isActive: true, role: 'leader' },
        currentBiome: 1,
        unlockedBiomes: [1, 2],
    };

    globalThis.window = {
        ApiService: {
            async changeBiome(biomeId) {
                calls.push(['changeBiome', biomeId]);
                return { success: true };
            },
            async changeBoatBiome(biomeId) {
                calls.push(['changeBoatBiome', biomeId]);
                return { success: true };
            },
        },
        clearTimeout() {},
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
                        priorityOrder: createPriorityOrder(),
                    },
                    enabled: true,
                };
            },
        });

        controller.handleWeatherResponse({
            pathname: '/api/game/weather',
            payload: {
                weather: {
                    1: { weather: 'clear', xpBonus: 0 },
                    2: { weather: 'arcane_surge', xpBonus: 75 },
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.deepEqual(calls, [['changeBoatBiome', 2]]);
        assert.match(
            controller.getSnapshot().autoBiomeStatus,
            /已切换整队到 \[B2\]/,
        );
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});

test('组队状态尚未返回前不会抢先按天气切图', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        currentBiome: 1,
        unlockedBiomes: [1, 2],
    };

    globalThis.window = {
        ApiService: {
            async changeBiome(biomeId) {
                calls.push(['changeBiome', biomeId]);
                return { success: true };
            },
        },
        clearTimeout() {},
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
                        priorityOrder: createPriorityOrder(),
                    },
                    enabled: true,
                };
            },
        });

        controller.handleWeatherResponse({
            pathname: '/api/game/weather',
            payload: {
                weather: {
                    1: { weather: 'clear', xpBonus: 0 },
                    2: { weather: 'arcane_surge', xpBonus: 75 },
                },
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.deepEqual(calls, []);
        assert.equal(
            controller.getSnapshot().autoBiomeStatus,
            '等待游戏组队状态',
        );
        controller.destroy();
    } finally {
        globalThis.window = previousWindow;
    }
});
