import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createCooldownWatchdog,
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
