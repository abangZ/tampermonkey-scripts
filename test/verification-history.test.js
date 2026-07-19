import assert from 'node:assert/strict';
import test from 'node:test';

import {
    addVerificationHistoryEntry,
    loadVerificationHistory,
    normalizeVerificationHistory,
    saveVerificationHistory,
} from '../arcaneangler/src/storage.js';

test('验证记录按时间倒序且只保留最近 5 条', () => {
    const history = addVerificationHistoryEntry(
        [
            { success: true, timestamp: 100 },
            { success: false, timestamp: 500 },
            { success: true, timestamp: 300 },
            { success: false, timestamp: 200 },
            { success: true, timestamp: 400 },
            { success: false, timestamp: 50 },
            { success: true, timestamp: 'invalid' },
        ],
        { success: false, timestamp: 600 },
    );

    assert.deepEqual(history, [
        { success: false, timestamp: 600 },
        { success: false, timestamp: 500 },
        { success: true, timestamp: 400 },
        { success: true, timestamp: 300 },
        { success: false, timestamp: 200 },
    ]);
});

test('验证记录会持久化规范化后的内容', () => {
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map();

    globalThis.localStorage = {
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
    };

    try {
        saveVerificationHistory([
            { success: true, timestamp: 300 },
            { success: false, timestamp: 100 },
            { success: true, timestamp: 200 },
            { success: 'yes', timestamp: 400 },
        ]);

        assert.deepEqual(loadVerificationHistory(), [
            { success: true, timestamp: 300 },
            { success: true, timestamp: 200 },
            { success: false, timestamp: 100 },
        ]);
        assert.deepEqual(normalizeVerificationHistory(null), []);
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});
