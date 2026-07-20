import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createAutoBaitController,
    getAutoBaitContext,
    getBaitGradeForBiome,
    getBaitIdForBiome,
    shouldPurchaseBait,
} from '../arcaneangler/src/auto-bait.js';
import {
    loadAutoBaitSettings,
    normalizeAutoBaitGrade,
    normalizeAutoBaitMinimumQuantity,
    normalizeAutoBaitPurchaseQuantity,
    normalizeIdleReloadMinutes,
} from '../arcaneangler/src/storage.js';

test('按当前地图和设置等级生成鱼饵 ID', () => {
    assert.equal(getBaitIdForBiome(8, 'default'), 'bait_default');
    assert.equal(getBaitIdForBiome(8, 'low'), 'bait_8_low');
    assert.equal(getBaitIdForBiome(8, 'medium'), 'bait_8_medium');
    assert.equal(getBaitIdForBiome(8, 'high'), 'bait_8_high');
    assert.equal(getBaitIdForBiome(8, 'super'), 'bait_8_super');
});

test('只有付费饵库存严格低于阈值时才购买', () => {
    assert.equal(shouldPurchaseBait(99, 100, 'medium'), true);
    assert.equal(shouldPurchaseBait(100, 100, 'medium'), false);
    assert.equal(shouldPurchaseBait(0, 100, 'default'), false);
});

test('按常规、个人赛和公会赛地图选择鱼饵等级', () => {
    const settings = {
        guildCompetitionBaitGrade: 'super',
        personalCompetitionBaitGrade: 'high',
        regularBaitGrade: 'low',
    };
    const competitionBiomes = {
        guildTournamentBiomeId: 8,
        personalDerbyBiomeId: 6,
    };

    assert.equal(getAutoBaitContext(4, competitionBiomes), 'regular');
    assert.equal(getAutoBaitContext(6, competitionBiomes), 'personal');
    assert.equal(getAutoBaitContext(8, competitionBiomes), 'guild');
    assert.equal(getBaitGradeForBiome(4, settings, competitionBiomes), 'low');
    assert.equal(getBaitGradeForBiome(6, settings, competitionBiomes), 'high');
    assert.equal(getBaitGradeForBiome(8, settings, competitionBiomes), 'super');
});

test('同一地图同时属于个人赛和公会赛时优先公会赛鱼饵', () => {
    const competitionBiomes = {
        guildTournamentBiomeId: 9,
        personalDerbyBiomeId: 9,
    };

    assert.equal(getAutoBaitContext(9, competitionBiomes), 'guild');
    assert.equal(
        getBaitGradeForBiome(
            9,
            {
                guildCompetitionBaitGrade: 'super',
                personalCompetitionBaitGrade: 'medium',
                regularBaitGrade: 'low',
            },
            competitionBiomes,
        ),
        'super',
    );
});

test('金风天气使用独立鱼饵设置且默认为免费饵', () => {
    const weatherState = {
        autoBiomeWeatherByBiome: {
            8: { weather: 'gold_breeze', xpBonus: -25 },
        },
    };

    assert.equal(
        getBaitGradeForBiome(
            8,
            {},
            { guildTournamentBiomeId: 8 },
            weatherState,
        ),
        'default',
    );
    assert.equal(
        getBaitGradeForBiome(
            8,
            {
                goldBreezeBaitGrade: 'high',
                guildCompetitionBaitGrade: 'super',
            },
            { guildTournamentBiomeId: 8 },
            weatherState,
        ),
        'high',
    );
});

test('自动买鱼饵设置会限制等级、阈值和商店购买数量', () => {
    assert.equal(normalizeAutoBaitGrade('super'), 'super');
    assert.equal(normalizeAutoBaitGrade('unknown'), 'low');
    assert.equal(normalizeAutoBaitMinimumQuantity(49), 49);
    assert.equal(normalizeAutoBaitMinimumQuantity(151), 151);
    assert.equal(normalizeAutoBaitMinimumQuantity(0), 100);
    assert.equal(normalizeAutoBaitPurchaseQuantity(1000), 1000);
    assert.equal(normalizeAutoBaitPurchaseQuantity(500), 100);
    assert.equal(normalizeIdleReloadMinutes(5), 5);
    assert.equal(normalizeIdleReloadMinutes(0), 5);
    assert.equal(normalizeIdleReloadMinutes(2000), 1440);
});

test('旧版单一鱼饵等级会迁移到旧场景，金风默认免费饵', () => {
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map([
        [
            'arcane-angler-auto-bait-settings-v1',
            JSON.stringify({
                baitGrade: 'high',
                enabled: true,
                minimumQuantity: 200,
                purchaseQuantity: 1000,
            }),
        ],
    ]);

    globalThis.localStorage = {
        getItem(key) {
            return values.get(key) ?? null;
        },
    };

    try {
        assert.deepEqual(loadAutoBaitSettings(), {
            enabled: true,
            goldBreezeBaitGrade: 'default',
            guildCompetitionBaitGrade: 'high',
            minimumQuantity: 200,
            personalCompetitionBaitGrade: 'high',
            purchaseQuantity: 1000,
            regularBaitGrade: 'high',
        });
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});

test('库存低于阈值时购买当前地图所选等级鱼饵并装备', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        baitInventory: {
            bait_3_medium: 50,
        },
        currentBiome: 3,
        equippedBait: 'bait_3_low',
        gold: 100000,
    };

    globalThis.window = {
        ApiService: {
            async buyBait(baitId, quantity) {
                calls.push(['buyBait', baitId, quantity]);
                return {
                    newBaitQuantity: 150,
                    success: true,
                };
            },
            async equipBait(baitId) {
                calls.push(['equipBait', baitId]);
                return { success: true };
            },
        },
        BAITS: [
            {
                id: 'bait_3_medium',
                name: 'Test Larva',
                price: 100,
            },
        ],
    };

    try {
        const controller = createAutoBaitController({
            getPlayer() {
                return player;
            },
            getState() {
                return {
                    autoBaitSettings: {
                        enabled: true,
                        guildCompetitionBaitGrade: 'super',
                        minimumQuantity: 100,
                        personalCompetitionBaitGrade: 'medium',
                        purchaseQuantity: 100,
                        regularBaitGrade: 'low',
                    },
                    autoBiomeCompetitionBiomes: {
                        guildTournamentBiomeId: 5,
                        personalDerbyBiomeId: 3,
                    },
                    enabled: true,
                };
            },
        });

        await controller.checkNow();

        assert.deepEqual(calls, [
            ['buyBait', 'bait_3_medium', 100],
            ['equipBait', 'bait_3_medium'],
        ]);
        assert.equal(controller.getSnapshot().autoBaitCurrentQuantity, 150);
        assert.match(controller.getSnapshot().autoBaitStatus, /已购买/);
        assert.match(controller.getSnapshot().autoBaitStatus, /个人赛/);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('游戏内置自动钓鱼使用独立鱼饵并在启动前补足库存', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        baitInventory: {
            bait_4_high: 20,
        },
        currentBiome: 4,
        equippedBait: 'bait_4_low',
        gold: 100000,
    };

    globalThis.window = {
        ApiService: {
            async buyBait(baitId, quantity) {
                calls.push(['buyBait', baitId, quantity]);
                return { newBaitQuantity: 120, success: true };
            },
            async equipBait(baitId) {
                calls.push(['equipBait', baitId]);
                return { success: true };
            },
        },
        BAITS: [{ id: 'bait_4_high', name: 'Test Bait', price: 100 }],
        GameHelpers: {
            getTotalStats() {
                return { stamina: 58 };
            },
        },
    };

    try {
        const controller = createAutoBaitController({
            getPlayer: () => player,
            getState() {
                return {
                    autoBaitSettings: {
                        enabled: true,
                        minimumQuantity: 20,
                        purchaseQuantity: 100,
                    },
                    autoBiomeCompetitionBiomes: {},
                    enabled: true,
                };
            },
        });

        assert.equal(await controller.prepareGameAutoFishing('high'), true);
        assert.deepEqual(calls, [
            ['buyBait', 'bait_4_high', 100],
            ['equipBait', 'bait_4_high'],
        ]);
        assert.match(controller.getSnapshot().autoBaitStatus, /内置自动钓鱼/);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('自动买鱼饵关闭时内置自动钓鱼保持当前鱼饵', async () => {
    const previousWindow = globalThis.window;
    const calls = [];

    globalThis.window = {
        ApiService: {
            async buyBait(...args) {
                calls.push(['buyBait', ...args]);
            },
            async equipBait(...args) {
                calls.push(['equipBait', ...args]);
            },
        },
    };

    try {
        const controller = createAutoBaitController({
            getPlayer: () => ({
                currentBiome: 4,
                equippedBait: 'bait_4_low',
            }),
            getState: () => ({
                autoBaitSettings: { enabled: false },
                enabled: true,
            }),
        });

        assert.equal(await controller.prepareGameAutoFishing('super'), true);
        assert.deepEqual(calls, []);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('多个检查排队时不会因角色库存尚未同步而重复购买', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        baitInventory: {
            bait_3_medium: 0,
        },
        currentBiome: 3,
        equippedBait: 'bait_3_low',
        gold: 100000,
    };

    globalThis.window = {
        ApiService: {
            async buyBait(baitId, quantity) {
                calls.push(['buyBait', baitId, quantity]);
                return {
                    newBaitQuantity: 100,
                    success: true,
                };
            },
            async equipBait(baitId) {
                calls.push(['equipBait', baitId]);
                return { success: true };
            },
        },
        BAITS: [
            {
                id: 'bait_3_medium',
                name: 'Test Larva',
                price: 100,
            },
        ],
    };

    try {
        const controller = createAutoBaitController({
            getPlayer() {
                return player;
            },
            getState() {
                return {
                    autoBaitSettings: {
                        baitGrade: 'medium',
                        enabled: true,
                        minimumQuantity: 100,
                        purchaseQuantity: 100,
                    },
                    enabled: true,
                };
            },
        });

        await Promise.all([
            controller.checkNow({ force: true }),
            controller.checkNow({ force: true }),
        ]);

        assert.equal(calls.filter(([name]) => name === 'buyBait').length, 1);
        assert.equal(controller.getSnapshot().autoBaitCurrentQuantity, 100);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('默认饵只自动装备，不发起购买', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
    const player = {
        currentBiome: 4,
        equippedBait: 'bait_4_high',
    };

    globalThis.window = {
        ApiService: {
            async equipBait(baitId) {
                calls.push(['equipBait', baitId]);
                return { success: true };
            },
        },
        BAITS: [],
    };

    try {
        const controller = createAutoBaitController({
            getPlayer() {
                return player;
            },
            getState() {
                return {
                    autoBaitSettings: {
                        baitGrade: 'default',
                        enabled: true,
                        minimumQuantity: 100,
                        purchaseQuantity: 1000,
                    },
                    enabled: true,
                };
            },
        });

        await controller.checkNow();

        assert.deepEqual(calls, [['equipBait', 'bait_default']]);
        assert.match(controller.getSnapshot().autoBaitStatus, /无限/);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('金币不足时切换免费饵，金币足够后恢复购买目标鱼饵', async () => {
    const previousWindow = globalThis.window;
    const previousDateNow = Date.now;
    const calls = [];
    let now = 1000;
    const player = {
        baitInventory: {
            bait_5_super: 20,
        },
        currentBiome: 5,
        equippedBait: 'bait_5_low',
        gold: 100,
    };

    globalThis.window = {
        ApiService: {
            async buyBait(baitId, quantity) {
                calls.push(['buyBait', baitId, quantity]);
                return {
                    newBaitQuantity: 120,
                    success: true,
                };
            },
            async equipBait(baitId) {
                calls.push(['equipBait', baitId]);
                return { success: true };
            },
        },
        BAITS: [
            {
                id: 'bait_5_super',
                name: 'Test Jig',
                price: 810,
            },
        ],
    };
    Date.now = () => now;

    try {
        const controller = createAutoBaitController({
            getPlayer() {
                return player;
            },
            getState() {
                return {
                    autoBaitSettings: {
                        baitGrade: 'super',
                        enabled: true,
                        minimumQuantity: 100,
                        purchaseQuantity: 100,
                    },
                    enabled: true,
                };
            },
        });

        await controller.checkNow();

        assert.deepEqual(calls, [['equipBait', 'bait_default']]);
        assert.match(controller.getSnapshot().autoBaitStatus, /购买需/);
        assert.match(controller.getSnapshot().autoBaitStatus, /免费饵/);

        player.equippedBait = 'bait_default';
        player.gold = 100000;
        now += 60000;
        await controller.checkNow();

        assert.deepEqual(calls, [
            ['equipBait', 'bait_default'],
            ['buyBait', 'bait_5_super', 100],
            ['equipBait', 'bait_5_super'],
        ]);
        assert.match(controller.getSnapshot().autoBaitStatus, /已购买/);
    } finally {
        Date.now = previousDateNow;
        globalThis.window = previousWindow;
    }
});

test('抛竿结果显示库存充足时不再触发额外操作', async () => {
    const previousWindow = globalThis.window;
    let requestCount = 0;

    globalThis.window = {
        ApiService: {
            async buyBait() {
                requestCount += 1;
            },
            async equipBait() {
                requestCount += 1;
            },
        },
        BAITS: [],
    };

    try {
        const controller = createAutoBaitController({
            getState() {
                return {
                    autoBaitSettings: {
                        baitGrade: 'high',
                        enabled: true,
                        minimumQuantity: 100,
                        purchaseQuantity: 1000,
                    },
                    enabled: true,
                };
            },
        });

        controller.handleCastResult({
            baitQuantity: 999,
            currentBiome: 6,
            equippedBait: 'bait_6_high',
        });
        await Promise.resolve();

        assert.equal(requestCount, 0);
        assert.equal(controller.getSnapshot().autoBaitCurrentQuantity, 999);
    } finally {
        globalThis.window = previousWindow;
    }
});
