/**
 * 免责声明：
 * 本脚本仅供学习与个人研究使用。使用者应自行遵守目标网站的服务条款、
 * 使用规则及所在地法律法规。因使用本脚本产生的账号限制、数据损失或
 * 其他直接、间接后果，均由使用者自行承担，脚本作者不承担相关责任。
 */

'use strict';

import { createCaptchaController } from './captcha.js';
import { CONFIG } from './config.js';
import {
    createEmptyEarningsStats,
    loadEarningsStats,
    saveEarningsStats,
    updateEarningsStats,
} from './earnings.js';
import { installFetchInterceptor } from './network/fetch-interceptor.js';
import {
    requestBrowserNotificationPermission as requestNotificationPermission,
    sendHumanVerificationNotification as sendVerificationNotification,
} from './notifications.js';
import {
    createScheduleController,
    formatScheduleDuration,
} from './schedule.js';
import {
    loadCaptchaBypassEnabled,
    loadEnabled,
    loadNotificationMode,
    loadPushKey,
    loadScheduleSettings,
    normalizeScheduleMinutes,
    saveCaptchaBypassEnabled,
    saveEnabled,
    saveNotificationMode,
    savePushKey,
    saveScheduleSettings,
} from './storage.js';
import { createPanelController } from './ui/panel.js';
import { isDisplayed, normalizeText } from './utils/dom.js';
import { randomInt, sleep } from './utils/time.js';

let enabled = loadEnabled();
let captchaBypassEnabled = loadCaptchaBypassEnabled();
let pushKey = loadPushKey();
let notificationMode = loadNotificationMode();
let scheduleSettings = loadScheduleSettings();
let earningsStats = loadEarningsStats();
let loopId = 0;
let clickCount = 0;
let captcha = null;
let panel = null;
let schedule = null;

function recordCastResult(result) {
    earningsStats = updateEarningsStats(earningsStats, result);
    saveEarningsStats(earningsStats);
    panel.renderEarningsStats();
}

function setPushKey(nextPushKey) {
    pushKey = String(nextPushKey ?? '').trim();
    savePushKey(pushKey);
}

async function requestBrowserNotificationPermission() {
    await requestNotificationPermission();
    panel.renderNotificationSettings();
}

function resetEarningsStats() {
    if (!window.confirm('确定重置全部收益统计吗？此操作无法撤销。')) {
        return;
    }

    earningsStats = createEmptyEarningsStats();
    saveEarningsStats(earningsStats);
    panel.renderEarningsStats();
}

function getPanelState() {
    return {
        captchaBypassEnabled,
        clickCount,
        earningsStats,
        enabled,
        notificationMode,
        pushKey,
        scheduleSettings,
        ...schedule.getSnapshot(),
    };
}

/**
 * 查询当前可用的“抛竿线”按钮。
 *
 * 不使用完整 class，因为页面中的 Tailwind class
 * 较长，并且更新后容易变化。
 */
function findCastButton() {
    const buttons = document.querySelectorAll('button');

    for (const button of buttons) {
        const text = normalizeText(button.textContent);

        if (!text.includes(CONFIG.buttonText)) {
            continue;
        }

        if (button.disabled) {
            continue;
        }

        if (button.getAttribute('aria-disabled') === 'true') {
            continue;
        }

        if (!isDisplayed(button)) {
            continue;
        }

        return button;
    }

    return null;
}

function getRandomDelay() {
    const isLongDelay = Math.random() < CONFIG.longDelayChance;

    if (isLongDelay) {
        return {
            milliseconds: randomInt(CONFIG.longDelayMin, CONFIG.longDelayMax),
            isLongDelay: true,
        };
    }

    return {
        milliseconds: randomInt(CONFIG.normalDelayMin, CONFIG.normalDelayMax),
        isLongDelay: false,
    };
}

/**
 * 向元素发送 PointerEvent。
 */
function dispatchPointerEvent(target, type, options) {
    if (typeof window.PointerEvent !== 'function') {
        return;
    }

    target.dispatchEvent(
        new window.PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            width: 1,
            height: 1,
            pressure: options.buttons === 1 ? 0.5 : 0,
            button: 0,
            ...options,
        }),
    );
}

/**
 * 向元素发送 MouseEvent。
 */
function dispatchMouseEvent(target, type, options) {
    target.dispatchEvent(
        new window.MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            button: 0,
            ...options,
        }),
    );
}

/**
 * 模拟一次完整点击。
 */
async function simulateClick(button, currentLoopId) {
    if (!button?.isConnected) {
        return false;
    }

    // 确保按钮处于可点击区域
    button.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'auto',
    });

    await sleep(60);

    if (
        !enabled ||
        currentLoopId !== loopId ||
        !button.isConnected ||
        schedule.isWorkExpired()
    ) {
        return false;
    }

    if (captcha.stopIfChallengeFound()) {
        return false;
    }

    const rect = button.getBoundingClientRect();

    // 在按钮中心附近随机选择一个位置
    const clientX = rect.left + rect.width * (0.42 + Math.random() * 0.16);

    const clientY = rect.top + rect.height * (0.38 + Math.random() * 0.24);

    // 获取该坐标实际覆盖的元素
    const hitElement = document.elementFromPoint(clientX, clientY);

    // 如果按钮被其他元素遮挡，先不点击
    if (
        !hitElement ||
        (hitElement !== button && !button.contains(hitElement))
    ) {
        console.warn('[自动抛竿] 按钮可能被其他元素遮挡：', hitElement);

        return false;
    }

    // 可能命中按钮内部的 span 或其他子元素
    const eventTarget = hitElement;

    try {
        button.focus({
            preventScroll: true,
        });
    } catch {
        button.focus();
    }

    const baseOptions = {
        clientX,
        clientY,
        screenX: window.screenX + clientX,
        screenY: window.screenY + clientY,
    };

    // 移入
    dispatchPointerEvent(eventTarget, 'pointerover', {
        ...baseOptions,
        buttons: 0,
    });

    dispatchMouseEvent(eventTarget, 'mouseover', {
        ...baseOptions,
        buttons: 0,
        detail: 0,
    });

    dispatchPointerEvent(eventTarget, 'pointermove', {
        ...baseOptions,
        buttons: 0,
    });

    dispatchMouseEvent(eventTarget, 'mousemove', {
        ...baseOptions,
        buttons: 0,
        detail: 0,
    });

    // 按下
    dispatchPointerEvent(eventTarget, 'pointerdown', {
        ...baseOptions,
        buttons: 1,
    });

    dispatchMouseEvent(eventTarget, 'mousedown', {
        ...baseOptions,
        buttons: 1,
        detail: 1,
    });

    // 模拟真实鼠标按住几十毫秒
    await sleep(randomInt(CONFIG.mouseDownMin, CONFIG.mouseDownMax));

    const wasCancelled = !enabled || currentLoopId !== loopId;

    // 即使中途停止，也要发送松开事件，避免按钮卡在按下状态
    dispatchPointerEvent(eventTarget, 'pointerup', {
        ...baseOptions,
        buttons: 0,
    });

    dispatchMouseEvent(eventTarget, 'mouseup', {
        ...baseOptions,
        buttons: 0,
        detail: 1,
    });

    if (wasCancelled) {
        return false;
    }

    // 最终 click
    dispatchMouseEvent(eventTarget, 'click', {
        ...baseOptions,
        buttons: 0,
        detail: 1,
    });

    return true;
}

/**
 * 等待按钮出现。
 */
async function waitForButton(currentLoopId) {
    while (enabled && currentLoopId === loopId) {
        if (captcha.stopIfChallengeFound()) {
            return null;
        }

        if (schedule.isWorkExpired()) {
            return null;
        }

        const button = findCastButton();

        if (button) {
            return button;
        }

        panel.setStatus('等待“抛竿线”按钮出现');
        panel.setNextDelay('—');

        await sleep(CONFIG.buttonPollInterval);
    }

    return null;
}

/**
 * 带倒计时的等待。
 */
async function waitWithCountdown(milliseconds, isLongDelay, currentLoopId) {
    const endTime = Date.now() + milliseconds;

    while (enabled && currentLoopId === loopId) {
        if (captcha.stopIfChallengeFound()) {
            return false;
        }

        if (schedule.isWorkExpired()) {
            return false;
        }

        const remaining = endTime - Date.now();

        if (remaining <= 0) {
            panel.setNextDelay('准备点击');
            return true;
        }

        const seconds = (remaining / 1000).toFixed(1);

        panel.setStatus(isLongDelay ? '随机长等待中' : '等待下一次操作');

        panel.setNextDelay(
            isLongDelay ? `${seconds} 秒（长等待）` : `${seconds} 秒`,
        );

        await sleep(Math.min(100, remaining));
    }

    return false;
}

/**
 * 主循环。
 */
async function runLoop(currentLoopId) {
    while (enabled && currentLoopId === loopId) {
        const scheduleReady = await schedule.waitForWork(currentLoopId);

        if (!scheduleReady) {
            return;
        }

        const button = await waitForButton(currentLoopId);

        if (!button) {
            if (schedule.shouldEnterRest(currentLoopId)) {
                continue;
            }

            return;
        }

        const delay = getRandomDelay();

        const completed = await waitWithCountdown(
            delay.milliseconds,
            delay.isLongDelay,
            currentLoopId,
        );

        if (!completed) {
            if (schedule.shouldEnterRest(currentLoopId)) {
                continue;
            }

            return;
        }

        // 等待期间 DOM 可能发生变化，所以重新查找
        const latestButton = findCastButton();

        if (!latestButton) {
            continue;
        }

        if (schedule.isWorkExpired()) {
            continue;
        }

        panel.setStatus('正在模拟点击');
        panel.setNextDelay('—');

        const clicked = await simulateClick(latestButton, currentLoopId);

        if (!enabled || currentLoopId !== loopId) {
            return;
        }

        if (clicked) {
            clickCount += 1;
            panel.updateClickCount();

            const time = new Date().toLocaleTimeString();

            panel.setStatus(`已点击，时间：${time}`);
            console.info(`[自动抛竿] 第 ${clickCount} 次点击`, latestButton);

            // 给页面一点时间处理状态变化
            await sleep(150);
        } else {
            // 如果验证码导致未点击，按当前过验证设置处理后退出。
            if (
                captcha.isBypassInProgress() ||
                captcha.stopIfChallengeFound()
            ) {
                return;
            }

            if (schedule.isWorkExpired()) {
                continue;
            }

            panel.setStatus('本次未点击，重新等待');
            await sleep(500);
        }
    }
}

/**
 * 开关控制。
 */
function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    saveEnabled(enabled);
    schedule.reset();

    if (!enabled) {
        captcha.cancel();
    }

    // 令旧循环失效，避免出现多个循环同时运行
    loopId += 1;

    panel.renderToggle();

    if (enabled) {
        const currentLoopId = loopId;

        panel.setStatus('已启动，正在查找按钮');
        panel.setNextDelay('—');

        runLoop(currentLoopId).catch((error) => {
            console.error('[自动抛竿] 运行异常：', error);

            if (currentLoopId === loopId) {
                panel.setStatus(`运行异常：${error.message}`);
            }
        });
    } else {
        panel.setStatus('已停止');
        panel.setNextDelay('—');
    }
}

function setCaptchaBypassEnabled(nextEnabled) {
    captchaBypassEnabled = Boolean(nextEnabled);
    saveCaptchaBypassEnabled(captchaBypassEnabled);

    panel.renderCaptchaBypassToggle();
    captcha.handleBypassSettingChanged();
}

function setNotificationMode(nextMode) {
    notificationMode = nextMode === 'browser' ? 'browser' : 'server';
    saveNotificationMode(notificationMode);
    panel.renderNotificationSettings();

    if (
        notificationMode === 'browser' &&
        typeof window.Notification === 'function' &&
        window.Notification.permission === 'default'
    ) {
        void requestBrowserNotificationPermission();
    }
}

function setScheduleEnabled(nextEnabled) {
    scheduleSettings = {
        ...scheduleSettings,
        enabled: Boolean(nextEnabled),
    };
    saveScheduleSettings(scheduleSettings);
    schedule.reset();

    if (enabled && scheduleSettings.enabled) {
        schedule.startWork();
    }
}

function setScheduleMinutes(field, value) {
    const nextValue = normalizeScheduleMinutes(value, scheduleSettings[field]);

    scheduleSettings = {
        ...scheduleSettings,
        [field]: nextValue,
    };
    saveScheduleSettings(scheduleSettings);
    schedule.reset();

    if (enabled && scheduleSettings.enabled) {
        schedule.startWork();
    }
}

/**
 * 快捷键 Alt + A。
 */
document.addEventListener(
    'keydown',
    (event) => {
        const target = event.target;

        const isTyping =
            target instanceof HTMLElement &&
            (target.isContentEditable ||
                target.matches('input, textarea, select'));

        if (isTyping) {
            return;
        }

        if (
            event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            event.code === 'KeyA'
        ) {
            event.preventDefault();
            event.stopPropagation();

            setEnabled(!enabled);
        }
    },
    true,
);

schedule = createScheduleController({
    getCaptcha() {
        return captcha;
    },
    getState() {
        return {
            enabled,
            loopId,
            scheduleSettings,
        };
    },
    renderSettings() {
        panel?.renderScheduleSettings();
    },
    renderStatus(remaining) {
        panel?.renderScheduleStatus(remaining);
    },
    setNextDelay(text) {
        panel?.setNextDelay(text);
    },
    setStatus(text) {
        panel?.setStatus(text);
    },
});

panel = createPanelController({
    actions: {
        requestBrowserNotificationPermission,
        resetEarningsStats,
        setCaptchaBypassEnabled,
        setEnabled,
        setNotificationMode,
        setPushKey,
        setScheduleEnabled,
        setScheduleMinutes,
    },
    formatScheduleDuration,
    getState: getPanelState,
});

captcha = createCaptchaController({
    getState() {
        return {
            captchaBypassEnabled,
            enabled,
        };
    },
    notify() {
        return sendVerificationNotification({
            notificationMode,
            pushKey,
        });
    },
    setEnabled,
    setNextDelay: panel.setNextDelay,
    setStatus: panel.setStatus,
});

installFetchInterceptor({
    onCastResult: recordCastResult,
    onCaptchaChallenge(challenge) {
        captcha.handleChallenge(challenge);
    },
    onCaptchaVerified() {
        captcha.clearChallenge();
    },
});

// 第一次安装默认关闭；之后恢复上次保存的状态
setEnabled(enabled);

console.info('[自动抛竿] 脚本已加载，使用右下角按钮或 Alt + A 控制。');
