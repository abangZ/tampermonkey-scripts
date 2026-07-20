import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameStateStore } from '../arcaneangler/src/game-state.js';

test('角色数据响应会建立完整状态，抛竿响应会增量更新', () => {
    const store = createGameStateStore();
    const player = {
        baitInventory: {
            bait_2_medium: 10,
        },
        currentBiome: 2,
        equippedBait: 'bait_2_medium',
        gold: 1000,
        unlockedBiomes: [1, 2, 3],
    };

    store.handleResponse({
        method: 'GET',
        pathname: '/api/player/data',
        payload: player,
    });
    store.handleResponse({
        method: 'POST',
        pathname: '/api/game/cast',
        payload: {
            result: {
                baitQuantity: 9,
                currentBiome: 3,
                equippedBait: 'bait_3_medium',
                newGold: 1200,
            },
            success: true,
        },
    });

    assert.deepEqual(store.getPlayerSnapshot(), {
        ...player,
        baitInventory: {
            bait_2_medium: 10,
            bait_3_medium: 9,
        },
        currentBiome: 3,
        equippedBait: 'bait_3_medium',
        gold: 1200,
    });
});

test('内置自动钓鱼的顶层响应会同步鱼饵库存和装备状态', () => {
    const store = createGameStateStore();

    store.handleResponse({
        method: 'GET',
        pathname: '/api/player/data',
        payload: {
            baitInventory: { bait_2_high: 20 },
            currentBiome: 2,
            equippedBait: 'bait_2_high',
        },
    });
    store.handleResponse({
        method: 'POST',
        pathname: '/api/game/auto-cast',
        payload: {
            baitQuantity: 19,
            currentBiome: 2,
            equippedBait: 'bait_2_high',
            newStamina: 57,
            success: true,
        },
    });

    assert.deepEqual(store.getPlayerSnapshot(), {
        baitInventory: { bait_2_high: 19 },
        currentBiome: 2,
        equippedBait: 'bait_2_high',
        stamina: 57,
    });
});

test('切图、装备和买饵响应会同步本地角色状态', () => {
    const store = createGameStateStore();

    store.handleResponse({
        method: 'GET',
        pathname: '/api/player/data',
        payload: {
            baitInventory: { bait_1_high: 5 },
            currentBiome: 1,
            equippedBait: 'bait_1_low',
            equippedRod: 'rod_default',
            gold: 5000,
        },
    });
    store.handleResponse({
        method: 'POST',
        pathname: '/api/game/change-biome',
        payload: { success: true },
        requestPayload: { biomeId: 2 },
    });
    store.handleResponse({
        method: 'POST',
        pathname: '/api/game/equip-bait',
        payload: { success: true },
        requestPayload: { baitName: 'bait_2_high' },
    });
    store.handleResponse({
        method: 'POST',
        pathname: '/api/game/equip-rod',
        payload: { success: true },
        requestPayload: { rodName: 'rod_biome_2' },
    });
    store.handleResponse({
        method: 'POST',
        pathname: '/api/game/buy-bait',
        payload: {
            newBaitQuantity: 105,
            newGold: 4000,
            success: true,
        },
        requestPayload: {
            baitName: 'bait_2_high',
            quantity: 100,
        },
    });

    assert.deepEqual(store.getPlayerSnapshot(), {
        baitInventory: {
            bait_1_high: 5,
            bait_2_high: 105,
        },
        currentBiome: 2,
        equippedBait: 'bait_2_high',
        equippedRod: 'rod_biome_2',
        gold: 4000,
    });
});

test('船只响应会同步组队状态并请求重新评估地图', () => {
    const store = createGameStateStore();

    store.handleResponse({
        method: 'GET',
        pathname: '/api/player/data',
        payload: { currentBiome: 1 },
    });

    const update = store.handleResponse({
        method: 'GET',
        pathname: '/api/boats/my-boat',
        payload: { boat: { boat_id: 7 } },
    });

    assert.deepEqual(update, {
        changed: true,
        shouldEvaluate: true,
    });
    assert.deepEqual(store.getPlayerSnapshot().boat, { boat_id: 7 });
});

test('角色数据刷新不会覆盖单独获取的组队状态', () => {
    const store = createGameStateStore();

    store.handleResponse({
        method: 'GET',
        pathname: '/api/player/data',
        payload: { currentBiome: 1, gold: 1000 },
    });
    store.handleResponse({
        method: 'GET',
        pathname: '/api/boats/my-boat',
        payload: { boat: { boat_id: 7, isActive: true } },
    });
    store.handleResponse({
        method: 'GET',
        pathname: '/api/player/data',
        payload: { currentBiome: 1, gold: 1200 },
    });

    assert.deepEqual(store.getPlayerSnapshot(), {
        boat: { boat_id: 7, isActive: true },
        currentBiome: 1,
        gold: 1200,
    });

    store.handleResponse({
        method: 'GET',
        pathname: '/api/boats/my-boat',
        payload: { boat: null },
    });

    assert.equal(store.getPlayerSnapshot().boat, null);
});
