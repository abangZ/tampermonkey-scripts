import assert from 'node:assert/strict';
import test from 'node:test';

import { createScheduleController } from '../arcaneangler/src/schedule.js';

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
