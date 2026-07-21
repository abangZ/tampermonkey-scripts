import assert from 'node:assert/strict';
import test from 'node:test';

import { createScheduleController } from '../arcaneangler/src/schedule.js';
import {
    loadScheduleRuntime,
    saveScheduleRuntime,
} from '../arcaneangler/src/storage.js';

test('休息结束后等待内置自动钓鱼停止，再恢复工作阶段', async () => {
    let currentTime = 0;
    let prepareCount = 0;
    const events = [];
    const state = {
        enabled: true,
        loopId: 1,
        scheduleSettings: {
            enabled: true,
            gameAutoFishingDuringRest: true,
            restMinutes: 1,
            workMinutes: 1,
        },
    };
    const schedule = createScheduleController({
        getCaptcha() {
            return {
                hasActiveVerification: () => false,
                isBypassInProgress: () => false,
                stopIfVerificationFound: () => false,
            };
        },
        getState: () => state,
        now: () => currentTime,
        onRestTick() {
            events.push('rest-tick');
            assert.equal(schedule.isRestActive(), true);
            currentTime += 120000;
            assert.equal(schedule.isRestActive(), false);
            return '休息接管中';
        },
        onWorkStarted() {
            events.push('work-started');
        },
        prepareForWork() {
            prepareCount += 1;
            events.push(`prepare-${prepareCount}`);
            return prepareCount >= 2;
        },
        renderSettings() {},
        renderStatus() {},
        setNextDelay() {},
        setStatus() {},
        sleepFor() {},
    });

    schedule.startWork();
    // 快进到本轮工作结束，直接验证工作到休息的阶段切换。
    currentTime = schedule.getSnapshot().scheduleEndsAt;

    assert.equal(await schedule.waitForWork(1), true);
    assert.deepEqual(events, [
        'work-started',
        'rest-tick',
        'prepare-1',
        'prepare-2',
        'work-started',
    ]);
    assert.equal(schedule.getSnapshot().schedulePhase, 'work');
});

test('页面刷新后恢复原运行周期，不会从头计算长周期', async () => {
    let currentTime = Date.UTC(2026, 6, 20, 12, 0, 0);
    let restTickCount = 0;
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map();
    const state = {
        enabled: true,
        loopId: 1,
        scheduleSettings: {
            enabled: true,
            gameAutoFishingDuringRest: true,
            restMinutes: 5,
            workMinutes: 60,
        },
    };
    const createSchedule = (initialRuntime) =>
        createScheduleController({
            getCaptcha() {
                return {
                    hasActiveVerification: () => false,
                    isBypassInProgress: () => false,
                    stopIfVerificationFound: () => false,
                };
            },
            getState: () => state,
            initialRuntime,
            now: () => currentTime,
            onRestTick() {
                restTickCount += 1;
                currentTime += 10 * 60000;
                return '休息接管中';
            },
            onRuntimeChange: saveScheduleRuntime,
            prepareForWork: () => true,
            renderSettings() {},
            renderStatus() {},
            setNextDelay() {},
            setStatus() {},
            sleepFor() {},
        });

    globalThis.localStorage = {
        getItem(key) {
            return values.get(key) ?? null;
        },
        setItem(key, value) {
            values.set(key, value);
        },
    };

    try {
        const originalSchedule = createSchedule();

        originalSchedule.startWork();
        const originalRuntime = loadScheduleRuntime();

        currentTime += 20 * 60000;

        const restoredSchedule = createSchedule(loadScheduleRuntime());

        assert.deepEqual(restoredSchedule.getSnapshot(), originalRuntime);
        assert.equal(await restoredSchedule.waitForWork(1), true);
        assert.deepEqual(restoredSchedule.getSnapshot(), originalRuntime);

        currentTime = originalRuntime.scheduleEndsAt;
        assert.equal(restoredSchedule.isWorkExpired(), true);
        assert.equal(await restoredSchedule.waitForWork(1), true);
        assert.equal(restTickCount, 1);
        assert.equal(restoredSchedule.getSnapshot().schedulePhase, 'work');
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});
