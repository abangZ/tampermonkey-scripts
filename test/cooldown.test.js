import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createCooldownWatchdog,
    createFishingActivityWatchdog,
    isCooldownButton,
} from '../arcaneangler/src/cooldown.js';

test('只识别不可点击的冷却倒计时按钮', () => {
    const button = {
        disabled: true,
        getAttribute: () => null,
        textContent: '⏱️ 冷却时间：2s',
    };

    assert.equal(isCooldownButton(button, '冷却时间'), true);
    assert.equal(
        isCooldownButton({ ...button, disabled: false }, '冷却时间'),
        false,
    );
    assert.equal(isCooldownButton(button, '抛竿线'), false);
});

test('冷却状态连续达到阈值后只触发一次', () => {
    const watchdog = createCooldownWatchdog(10000);

    assert.equal(watchdog.observe(true, 1000), false);
    assert.equal(watchdog.observe(true, 10999), false);
    assert.equal(watchdog.observe(true, 11000), true);
    assert.equal(watchdog.observe(true, 21000), false);
});

test('冷却状态中断后重新计时', () => {
    const watchdog = createCooldownWatchdog(10000);

    assert.equal(watchdog.observe(true, 1000), false);
    assert.equal(watchdog.observe(false, 9000), false);
    assert.equal(watchdog.observe(true, 10000), false);
    assert.equal(watchdog.observe(true, 19999), false);
    assert.equal(watchdog.observe(true, 20000), true);
});

test('连续未触发钓鱼达到阈值后只触发一次刷新', () => {
    const watchdog = createFishingActivityWatchdog(1000);

    assert.equal(watchdog.observe(300000, 300999), false);
    assert.equal(watchdog.observe(300000, 301000), true);
    assert.equal(watchdog.observe(300000, 601000), false);
});

test('触发钓鱼后重新计算无活动时间', () => {
    const watchdog = createFishingActivityWatchdog(1000);

    assert.equal(watchdog.observe(300000, 301000), true);
    watchdog.markFishing(400000);
    assert.equal(watchdog.observe(300000, 699999), false);
    assert.equal(watchdog.observe(300000, 700000), true);
});
