import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import {
    createCaptchaController,
    findCaptchaGapFromPixels,
    solveStaffQuestion,
} from '../arcaneangler/src/captcha.js';
import { CONFIG } from '../arcaneangler/src/config.js';

test('新版图片验证码会从纯色矩形中还原滑块位置', () => {
    const width = 320;
    const height = 130;
    const gapX = 109;
    const gapY = 18;
    const gapWidth = 55;
    const gapHeight = 95;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;

            data[offset] = 10;
            data[offset + 1] = 90 + y;
            data[offset + 2] = 140 + Math.floor(y / 2);
            data[offset + 3] = 255;
        }
    }

    for (let y = gapY + 1; y < gapY + gapHeight - 1; y += 1) {
        for (let x = gapX + 1; x < gapX + gapWidth - 1; x += 1) {
            const offset = (y * width + x) * 4;

            data[offset] = 4;
            data[offset + 1] = 40;
            data[offset + 2] = 66;
            data[offset + 3] = 255;
        }
    }

    assert.deepEqual(
        findCaptchaGapFromPixels(
            { data, height, width },
            { height: gapHeight, width: gapWidth },
        ),
        {
            canvasWidth: width,
            gapWidth,
            gapX,
            ratio: gapX / (width - gapWidth),
        },
    );
});

test('Staff Question 只解析明确的基础算术题', () => {
    assert.equal(solveStaffQuestion('How much is 3x7?'), '21');
    assert.equal(solveStaffQuestion('how much is three plus one'), '4');
    assert.equal(solveStaffQuestion('What is 18 divided by 4?'), '4.5');
    assert.equal(solveStaffQuestion('What is twenty-one minus nine'), '12');
    assert.equal(
        solveStaffQuestion('What is two hundred and five divided by five?'),
        '41',
    );
    assert.equal(solveStaffQuestion('Calculate 8 minus 11?'), '-3');
    assert.equal(solveStaffQuestion('3乘以7等于多少？'), '21');
    assert.equal(solveStaffQuestion('请计算 18 除以 4'), '4.5');
    assert.equal(
        solveStaffQuestion('Please describe your current activity.'),
        null,
    );
    assert.equal(solveStaffQuestion('What is 5 divided by 0?'), null);
});

test('捕获到算术 Staff Question 后通过页面 API 回答并恢复运行', async () => {
    const previousDocument = globalThis.document;
    const previousHTMLElement = globalThis.HTMLElement;
    const previousWindow = globalThis.window;
    const previousDelays = {
        captchaConfirmDelayMax: CONFIG.captchaConfirmDelayMax,
        captchaConfirmDelayMin: CONFIG.captchaConfirmDelayMin,
        captchaObserveDelayMax: CONFIG.captchaObserveDelayMax,
        captchaObserveDelayMin: CONFIG.captchaObserveDelayMin,
    };
    const answerCalls = [];
    const verificationResults = [];
    let enabled = true;
    let resume;
    const resumed = new Promise((resolve) => {
        resume = resolve;
    });
    const window = new Window({
        url: 'https://arcaneangler.com/',
    });
    const popup = window.document.createElement('div');

    popup.innerHTML = `
        <div><div>❓ 员工提问</div><div>0:35</div></div>
        <div>三加一等于多少？</div>
        <input type="text" maxlength="500" placeholder="请输入答案……" />
        <div><button>回答</button><button>忽略</button></div>
    `;
    popup.querySelector('input').getBoundingClientRect = () => ({
        height: 40,
        width: 300,
    });
    popup.__reactFiber$test = {
        memoizedProps: {},
        return: {
            memoizedProps: {
                castCountRef: { current: 5 },
                onDismiss() {
                    popup.remove();
                },
                question: 'how much is three plus one',
                questionId: 42,
            },
            return: null,
        },
    };
    window.document.body.appendChild(popup);

    CONFIG.captchaConfirmDelayMax = 0;
    CONFIG.captchaConfirmDelayMin = 0;
    CONFIG.captchaObserveDelayMax = 0;
    CONFIG.captchaObserveDelayMin = 0;
    window.ApiService = {
        async answerToastQuestion(...args) {
            answerCalls.push(args);
        },
    };
    globalThis.document = window.document;
    globalThis.HTMLElement = window.HTMLElement;
    globalThis.window = window;

    try {
        const controller = createCaptchaController({
            getState() {
                return {
                    captchaBypassEnabled: true,
                    enabled,
                };
            },
            notify() {},
            onVerificationResult(result) {
                verificationResults.push(result);
            },
            setEnabled(nextEnabled) {
                enabled = nextEnabled;

                if (nextEnabled) {
                    resume();
                }
            },
            setNextDelay() {},
            setStatus() {},
        });

        controller.handleStaffQuestion({
            id: 42,
            question: 'how much is three plus one',
        });

        await resumed;
        assert.deepEqual(answerCalls, [[42, '4', 5]]);
        assert.equal(controller.hasActiveVerification(), false);
        assert.equal(popup.isConnected, false);
        assert.equal(verificationResults.length, 1);
        assert.equal(verificationResults[0].success, true);
        assert.equal(Number.isFinite(verificationResults[0].timestamp), true);
    } finally {
        Object.assign(CONFIG, previousDelays);
        globalThis.document = previousDocument;
        globalThis.HTMLElement = previousHTMLElement;
        globalThis.window = previousWindow;
    }
});

test('无法可靠回答 Staff Question 时停止并通知用户', async () => {
    const previousWindow = globalThis.window;
    let enabled = true;
    let notificationCount = 0;
    const verificationResults = [];
    let stop;
    const stopped = new Promise((resolve) => {
        stop = resolve;
    });

    globalThis.window = {
        ApiService: {
            async answerToastQuestion() {
                assert.fail('开放问题不应自动提交答案');
            },
        },
    };

    try {
        const controller = createCaptchaController({
            getState() {
                return {
                    captchaBypassEnabled: true,
                    enabled,
                };
            },
            notify() {
                notificationCount += 1;
            },
            onVerificationResult(result) {
                verificationResults.push(result);
            },
            setEnabled(nextEnabled) {
                enabled = nextEnabled;

                if (!nextEnabled) {
                    stop();
                }
            },
            setNextDelay() {},
            setStatus() {},
        });

        controller.handleStaffQuestion({
            id: 43,
            question: 'Please describe your current activity.',
        });

        await stopped;
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(notificationCount, 1);
        assert.equal(enabled, false);
        assert.equal(verificationResults.length, 1);
        assert.equal(verificationResults[0].success, false);
    } finally {
        globalThis.window = previousWindow;
    }
});
