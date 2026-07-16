import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createAutoBaitController,
    getBaitIdForBiome,
    shouldPurchaseBait,
} from '../arcaneangler/src/auto-bait.js';
import {
    normalizeAutoBaitGrade,
    normalizeAutoBaitMinimumQuantity,
    normalizeAutoBaitPurchaseQuantity,
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

test('自动买鱼饵设置会限制等级、阈值和商店购买数量', () => {
    assert.equal(normalizeAutoBaitGrade('super'), 'super');
    assert.equal(normalizeAutoBaitGrade('unknown'), 'low');
    assert.equal(normalizeAutoBaitMinimumQuantity(149), 100);
    assert.equal(normalizeAutoBaitMinimumQuantity(151), 200);
    assert.equal(normalizeAutoBaitPurchaseQuantity(1000), 1000);
    assert.equal(normalizeAutoBaitPurchaseQuantity(500), 100);
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
                        baitGrade: 'medium',
                        enabled: true,
                        minimumQuantity: 100,
                        purchaseQuantity: 100,
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

test('金币不足时保留并装备剩余鱼饵，不发起购买', async () => {
    const previousWindow = globalThis.window;
    const calls = [];
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

        assert.deepEqual(calls, [['equipBait', 'bait_5_super']]);
        assert.match(controller.getSnapshot().autoBaitStatus, /购买需/);
    } finally {
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
