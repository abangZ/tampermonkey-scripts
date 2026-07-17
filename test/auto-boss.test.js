import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createAutoBossController,
    selectBestBossStat,
} from '../arcaneangler/src/auto-boss.js';
import { loadAutoBossSettings } from '../arcaneangler/src/storage.js';

test('按角色属性和 Boss 弱点选择预估伤害最高的招式', () => {
    const anomaly = {
        primaryWeakness: 'strength',
        resistantStat: 'luck',
        secondaryWeakness: 'intelligence',
    };

    assert.equal(
        selectBestBossStat(anomaly, {
            intelligence: 100,
            luck: 5000,
            stamina: 100,
            strength: 1000,
        }),
        'strength',
    );
    assert.equal(
        selectBestBossStat(anomaly, {
            intelligence: 3000,
            luck: 100,
            stamina: 100,
            strength: 100,
        }),
        'intelligence',
    );
});

test('角色属性不可用时回退到 Boss 主要弱点', () => {
    assert.equal(
        selectBestBossStat(
            {
                primaryWeakness: 'luck',
            },
            {},
        ),
        'luck',
    );
});

test('自动攻击读取当前 Boss 并提交 statUsed 对应属性', async () => {
    const previousWindow = globalThis.window;
    const attackedStats = [];

    globalThis.window = {
        ApiService: {
            async attackAnomaly(stat) {
                attackedStats.push(stat);
                return {
                    anomaly: {
                        defeated: false,
                        name: 'Eclipse Wyrm',
                    },
                    attack: {
                        finalDamage: 3750,
                    },
                };
            },
            async getCurrentAnomaly() {
                return {
                    active: true,
                    event: {
                        anomaly: {
                            primaryWeakness: 'strength',
                            resistantStat: 'luck',
                            secondaryWeakness: 'intelligence',
                        },
                        currentHp: 10000,
                    },
                    playerParticipation: null,
                };
            },
        },
        GameHelpers: {
            getTotalStats() {
                return {
                    intelligence: 100,
                    luck: 100,
                    stamina: 100,
                    strength: 1000,
                };
            },
        },
        clearTimeout() {},
        setTimeout() {
            return 1;
        },
    };

    try {
        const controller = createAutoBossController({
            getPlayer() {
                return { stats: {} };
            },
            getState() {
                return {
                    autoBossSettings: { enabled: true },
                    enabled: true,
                };
            },
        });

        await controller.checkNow();

        assert.deepEqual(attackedStats, ['strength']);
        assert.equal(controller.getSnapshot().autoBossLastDamage, 3750);
        assert.match(controller.getSnapshot().autoBossStatus, /3,750/);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('检查进行中收到重复触发时只在请求结束后补跑一次', async () => {
    const previousWindow = globalThis.window;
    const scheduledTasks = [];
    let resolveCurrent;

    globalThis.window = {
        ApiService: {
            async attackAnomaly() {
                throw new Error('没有活动 Boss 时不应攻击');
            },
            getCurrentAnomaly() {
                return new Promise((resolve) => {
                    resolveCurrent = resolve;
                });
            },
        },
        clearTimeout() {},
        setTimeout(callback, delay) {
            scheduledTasks.push({ callback, delay });
            return scheduledTasks.length;
        },
    };

    try {
        const controller = createAutoBossController({
            getState() {
                return {
                    autoBossSettings: { enabled: true },
                    enabled: true,
                };
            },
        });

        controller.start();
        const initialTask = scheduledTasks.shift();

        assert.equal(initialTask.delay, 0);
        initialTask.callback();
        await Promise.resolve();

        await controller.checkNow();
        assert.deepEqual(scheduledTasks, []);

        resolveCurrent({ active: false });
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(
            scheduledTasks.map((task) => task.delay),
            [10000, 0],
        );
        assert.equal(
            scheduledTasks.some((task) => task.delay === 100),
            false,
        );
    } finally {
        globalThis.window = previousWindow;
    }
});

test('自动打 Boss 设置默认关闭并兼容已保存值', () => {
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map();

    globalThis.localStorage = {
        getItem(key) {
            return values.get(key) ?? null;
        },
    };

    try {
        assert.deepEqual(loadAutoBossSettings(), { enabled: false });

        values.set(
            'arcane-angler-auto-boss-settings-v1',
            JSON.stringify({ enabled: true }),
        );
        assert.deepEqual(loadAutoBossSettings(), { enabled: true });
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});
