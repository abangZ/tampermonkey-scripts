import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import {
    createGameAutoFishingController,
    dismissGameAutoFishingCompletion,
    dismissGameAutoFishingSummary,
    findGameAutoFishingButton,
    getGameAutoFishingState,
} from '../arcaneangler/src/game-auto-fishing.js';
import {
    loadGameAutoFishingSettings,
    loadScheduleSettings,
} from '../arcaneangler/src/storage.js';

function createVisibleButton(window, { className = '', icon = '🤖' } = {}) {
    const button = window.document.createElement('button');

    button.className = className;
    button.textContent = icon;
    button.getBoundingClientRect = () => ({
        bottom: 40,
        height: 40,
        left: 0,
        right: 40,
        top: 0,
        width: 40,
        x: 0,
        y: 0,
    });
    window.document.body.appendChild(button);
    return button;
}

function installDomGlobals(window) {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement;

    globalThis.window = window;
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;

    return () => {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
    };
}

test('通过按钮结构和图标识别内置自动钓鱼，不依赖页面语言', () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);

    try {
        createVisibleButton(window, { className: 'other-button', icon: '🤖' });
        const button = createVisibleButton(window, {
            className: 'flex-[15] translated-auto-cast',
            icon: '🤖',
        });

        button.title = '开始自动钓鱼（汉化）';

        assert.equal(findGameAutoFishingButton(), button);
        assert.deepEqual(
            {
                active: getGameAutoFishingState().active,
                available: getGameAutoFishingState().available,
                enabled: getGameAutoFishingState().enabled,
            },
            { active: false, available: true, enabled: true },
        );

        button.textContent = '🛑';
        button.title = '停止自动钓鱼（汉化）';
        assert.equal(getGameAutoFishingState().active, true);
    } finally {
        restore();
    }
});

test('内置自动钓鱼每次启动前准备鱼饵，结束后续期并可安全停止', async () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);
    const button = createVisibleButton(window, {
        className: 'flex-[15]',
        icon: '🤖',
    });
    let clickCount = 0;
    let prepareCount = 0;

    button.addEventListener('click', () => {
        clickCount += 1;
        button.textContent = button.textContent.includes('🤖') ? '🛑' : '🤖';
    });

    try {
        const controller = createGameAutoFishingController({
            async prepareStart() {
                prepareCount += 1;
                return true;
            },
        });

        assert.equal((await controller.ensureActive()).active, true);
        assert.equal(prepareCount, 1);
        assert.equal(clickCount, 1);
        assert.match(
            controller.getSnapshot().gameAutoFishingStatus,
            /自动续期/,
        );

        // 模拟游戏内置次数耗尽，按钮自动回到可启动状态。
        button.textContent = '🤖';
        assert.equal((await controller.ensureActive()).active, true);
        assert.equal(prepareCount, 2);
        assert.equal(clickCount, 2);

        assert.equal(controller.ensureStopped(), false);
        assert.equal(controller.ensureStopped(), true);
        assert.equal(clickCount, 3);
        assert.equal(getGameAutoFishingState().active, false);
    } finally {
        restore();
    }
});

test('按汇总遮罩结构和图标关闭弹层，不依赖关闭按钮文案', () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);
    const overlay = window.document.createElement('div');
    const dialog = window.document.createElement('div');
    const heading = window.document.createElement('h2');
    const closeButton = window.document.createElement('button');
    let closed = false;

    overlay.className = 'fixed inset-0';
    heading.textContent = '🤖 自动钓鱼汇总（汉化）';
    closeButton.textContent = '关掉';
    closeButton.getBoundingClientRect = () => ({
        bottom: 40,
        height: 40,
        left: 0,
        right: 40,
        top: 0,
        width: 40,
        x: 0,
        y: 0,
    });
    closeButton.addEventListener('click', () => {
        closed = true;
    });
    dialog.append(heading, closeButton);
    overlay.appendChild(dialog);
    window.document.body.appendChild(overlay);

    try {
        assert.equal(dismissGameAutoFishingSummary(), true);
        assert.equal(closed, true);
    } finally {
        restore();
    }
});

test('识别并关闭汉化后的体力耗尽完成弹窗', () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);
    const overlay = window.document.createElement('div');
    const message = window.document.createElement('p');
    const confirmButton = createVisibleButton(window, { icon: '确定' });
    let closed = false;

    overlay.className = 'fixed inset-0 z-50';
    message.textContent = '自动抛竿完成：体力已耗尽！';
    confirmButton.addEventListener('click', () => {
        closed = true;
        overlay.remove();
    });
    overlay.append(message, confirmButton);
    window.document.body.appendChild(overlay);

    try {
        assert.equal(dismissGameAutoFishingCompletion(), true);
        assert.equal(closed, true);
    } finally {
        restore();
    }
});

test('体力耗尽弹窗关闭后延迟重试续期', async () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);
    const autoButton = createVisibleButton(window, {
        className: 'flex-[15]',
        icon: '🤖',
    });
    const overlay = window.document.createElement('div');
    const message = window.document.createElement('p');
    const confirmButton = createVisibleButton(window, { icon: '确定' });
    let autoButtonClicks = 0;
    let currentTime = 1000;

    overlay.className = 'fixed inset-0 z-50';
    message.textContent = 'Auto-Cast complete: All stamina consumed!';
    confirmButton.addEventListener('click', () => overlay.remove());
    autoButton.addEventListener('click', () => {
        autoButtonClicks += 1;
        autoButton.textContent = '🛑';
    });
    overlay.append(message, confirmButton);
    window.document.body.appendChild(overlay);

    try {
        const controller = createGameAutoFishingController({
            now: () => currentTime,
            staminaRetryInterval: 60000,
        });

        assert.equal((await controller.ensureActive()).active, false);
        assert.equal(autoButtonClicks, 0);
        assert.match(
            controller.getSnapshot().gameAutoFishingStatus,
            /稍后自动续期/,
        );

        currentTime += 59999;
        assert.equal((await controller.ensureActive()).active, false);
        assert.equal(autoButtonClicks, 0);

        currentTime += 1;
        assert.equal((await controller.ensureActive()).active, true);
        assert.equal(autoButtonClicks, 1);
    } finally {
        restore();
    }
});

test('次数自然耗尽后恢复脚本时也会关闭汇总遮罩', () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);
    const overlay = window.document.createElement('div');
    const heading = window.document.createElement('h2');
    const closeButton = createVisibleButton(window, { icon: '关闭（汉化）' });
    let closed = false;

    overlay.className = 'fixed inset-0';
    heading.textContent = '🤖 自动钓鱼汇总（汉化）';
    closeButton.addEventListener('click', () => {
        closed = true;
    });
    overlay.append(heading, closeButton);
    window.document.body.appendChild(overlay);

    try {
        const controller = createGameAutoFishingController();

        assert.equal(controller.ensureStopped(), true);
        assert.equal(closed, true);
    } finally {
        restore();
    }
});

test('启动操作未完成时不会误判为已停止', async () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);
    const button = createVisibleButton(window, {
        className: 'flex-[15]',
        icon: '🤖',
    });
    let currentTime = 1000;

    try {
        const controller = createGameAutoFishingController({
            now: () => currentTime,
            retryInterval: 5000,
        });

        await controller.ensureActive();
        assert.equal(controller.ensureStopped(), false);

        currentTime += 5000;
        assert.equal(controller.ensureStopped(), true);
    } finally {
        restore();
    }
});

test('鱼饵准备期间切回脚本模式不会再启动内置自动钓鱼', async () => {
    const window = new Window({ url: 'https://arcaneangler.com/' });
    const restore = installDomGlobals(window);
    const button = createVisibleButton(window, {
        className: 'flex-[15]',
        icon: '🤖',
    });
    let startAllowed = true;
    let clickCount = 0;

    button.addEventListener('click', () => {
        clickCount += 1;
    });

    try {
        const controller = createGameAutoFishingController({
            async prepareStart() {
                startAllowed = false;
                return true;
            },
            shouldStart: () => startAllowed,
        });

        assert.equal((await controller.ensureActive()).active, false);
        assert.equal(clickCount, 0);
        assert.equal(controller.ensureStopped(), true);
    } finally {
        restore();
    }
});

test('内置自动钓鱼与休息期接管设置默认关闭并兼容保存值', () => {
    const previousLocalStorage = globalThis.localStorage;
    const values = new Map();

    globalThis.localStorage = {
        getItem(key) {
            return values.get(key) ?? null;
        },
    };

    try {
        assert.deepEqual(loadGameAutoFishingSettings(), {
            baitGrade: 'low',
            enabled: false,
        });
        assert.equal(loadScheduleSettings().gameAutoFishingDuringRest, false);

        values.set(
            'arcane-angler-game-auto-fishing-settings-v1',
            JSON.stringify({ baitGrade: 'super', enabled: true }),
        );
        values.set(
            'arcane-angler-schedule-settings-v1',
            JSON.stringify({
                enabled: true,
                gameAutoFishingDuringRest: true,
                restMinutes: 10,
                workMinutes: 60,
            }),
        );

        assert.deepEqual(loadGameAutoFishingSettings(), {
            baitGrade: 'super',
            enabled: true,
        });
        assert.equal(loadScheduleSettings().gameAutoFishingDuringRest, true);
    } finally {
        globalThis.localStorage = previousLocalStorage;
    }
});
