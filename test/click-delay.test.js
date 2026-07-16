import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_CLICK_DELAY_SETTINGS,
    getRandomClickDelay,
    normalizeClickDelaySettings,
} from '../arcaneangler/src/click-delay.js';
import {
    loadClickDelaySettings,
    saveClickDelaySettings,
} from '../arcaneangler/src/storage.js';

test('点击间隔设置会限制范围并自动校正大小顺序', () => {
    assert.deepEqual(
        normalizeClickDelaySettings({
            longDelayChancePercent: 120,
            longDelayMaxSeconds: 4,
            longDelayMinSeconds: 12,
            shortDelayMaxSeconds: 0,
            shortDelayMinSeconds: 3,
        }),
        {
            longDelayChancePercent: 100,
            longDelayMaxSeconds: 12,
            longDelayMinSeconds: 4,
            shortDelayMaxSeconds: 3,
            shortDelayMinSeconds: 0.1,
        },
    );
});

test('按设置概率选择小间隔或大间隔', () => {
    const smallRandomValues = [0.5, 0];
    const longRandomValues = [0.01, 1 - Number.EPSILON];

    assert.deepEqual(
        getRandomClickDelay(DEFAULT_CLICK_DELAY_SETTINGS, () =>
            smallRandomValues.shift(),
        ),
        {
            milliseconds: 500,
            isLongDelay: false,
        },
    );
    assert.deepEqual(
        getRandomClickDelay(DEFAULT_CLICK_DELAY_SETTINGS, () =>
            longRandomValues.shift(),
        ),
        {
            milliseconds: 10000,
            isLongDelay: true,
        },
    );
});

test('旧用户无设置时沿用现有间隔，新设置可持久化', () => {
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map();

    globalThis.localStorage = {
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            values.set(key, value);
        },
    };

    try {
        assert.deepEqual(loadClickDelaySettings(), {
            ...DEFAULT_CLICK_DELAY_SETTINGS,
        });

        saveClickDelaySettings({
            ...DEFAULT_CLICK_DELAY_SETTINGS,
            longDelayChancePercent: 15,
        });

        assert.equal(loadClickDelaySettings().longDelayChancePercent, 15);
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});
