/**
 * 免责声明：
 * 本脚本仅供学习与个人研究使用。使用者应自行遵守目标网站的服务条款、
 * 使用规则及所在地法律法规。因使用本脚本产生的账号限制、数据损失或
 * 其他直接、间接后果，均由使用者自行承担，脚本作者不承担相关责任。
 */

'use strict';

import { createAutoBiomeController } from './auto-biome.js';
import { createAutoBaitController } from './auto-bait.js';
import { createCaptchaController } from './captcha.js';
import { CONFIG } from './config.js';
import {
    createCooldownWatchdog,
    createFishingActivityWatchdog,
    isCooldownButton,
} from './cooldown.js';
import {
    createEmptyEarningsStats,
    loadEarningsStats,
    saveEarningsStats,
    updateEarningsStats,
} from './earnings.js';
import { getCastEarningsContext } from './game-data.js';
import { createGameStateStore } from './game-state.js';
import { installEventSourceInterceptor } from './network/event-source-interceptor.js';
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
    loadAutoBaitSettings,
    loadAutoBiomeSettings,
    loadCaptchaBypassEnabled,
    loadEnabled,
    loadIdleReloadSettings,
    loadNotificationMode,
    loadPushKey,
    loadScheduleSettings,
    normalizeAutoBaitGrade,
    normalizeAutoBaitMinimumQuantity,
    normalizeAutoBaitPurchaseQuantity,
    normalizeAutoBiomeWeight,
    normalizeIdleReloadMinutes,
    normalizeScheduleMinutes,
    saveAutoBaitSettings,
    saveAutoBiomeSettings,
    saveCaptchaBypassEnabled,
    saveEnabled,
    saveIdleReloadSettings,
    saveNotificationMode,
    savePushKey,
    saveScheduleSettings,
} from './storage.js';
import { createPanelController } from './ui/panel.js';
import { isDisplayed, isVisible, normalizeText } from './utils/dom.js';
import { randomInt, sleep } from './utils/time.js';

let enabled = loadEnabled();
let captchaBypassEnabled = loadCaptchaBypassEnabled();
let pushKey = loadPushKey();
let notificationMode = loadNotificationMode();
let scheduleSettings = loadScheduleSettings();
let autoBiomeSettings = loadAutoBiomeSettings();
let autoBaitSettings = loadAutoBaitSettings();
let idleReloadSettings = loadIdleReloadSettings();
let earningsStats = loadEarningsStats();
let loopId = 0;
let clickCount = 0;
let captcha = null;
let panel = null;
let schedule = null;
let autoBiome = null;
let autoBait = null;
let forceNextAutoBaitCheck = false;
let pendingCaptchaChallenge = null;
const pendingCompetitionResponses = new Map();
const pendingWeatherResponses = new Map();
const gameState = createGameStateStore();
const fishingActivityWatchdog = createFishingActivityWatchdog();
const AUTO_BAIT_GRADE_FIELDS = new Set([
    'goldBreezeBaitGrade',
    'guildCompetitionBaitGrade',
    'personalCompetitionBaitGrade',
    'regularBaitGrade',
]);

function handleWeatherResponse(response) {
    if (autoBiome) {
        autoBiome.handleWeatherResponse(response);
    } else {
        pendingWeatherResponses.set(
            `${response.source ?? 'fetch'}:${response.pathname}`,
            response,
        );
    }
}

function recordCastResult(result) {
    fishingActivityWatchdog.markFishing();
    earningsStats = updateEarningsStats(
        earningsStats,
        result,
        getCastEarningsContext(result),
    );
    saveEarningsStats(earningsStats);
    panel?.renderEarningsStats();
    autoBiome?.handleCastResult(result);
    autoBait?.handleCastResult(result);
}

// 尽早安装 fetch hook，避免漏掉游戏初始化阶段的比赛与公会响应。
installEventSourceInterceptor({
    onWeatherUpdate(payload) {
        handleWeatherResponse({
            pathname: '/api/game/weather/stream',
            payload,
            source: 'stream',
        });
    },
});

installFetchInterceptor({
    onCastResult: recordCastResult,
    onCaptchaChallenge(challenge) {
        if (captcha) {
            captcha.handleChallenge(challenge);
        } else {
            pendingCaptchaChallenge = challenge;
        }
    },
    onCaptchaVerified() {
        pendingCaptchaChallenge = null;
        captcha?.clearChallenge();
    },
    onCompetitionResponse(response) {
        if (autoBiome) {
            if (autoBiome.handleCompetitionResponse(response)) {
                void autoBait?.handleStateChanged({ force: true });
            }
        } else {
            pendingCompetitionResponses.set(response.pathname, response);
        }
    },
    onGameStateResponse(response) {
        const update = gameState.handleResponse(response);

        if (update.shouldEvaluate && autoBiome) {
            handleAutomationStateChanged();
        }
    },
    onWeatherResponse(response) {
        handleWeatherResponse(response);
    },
});

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
        idleReloadSettings,
        autoBaitSettings,
        autoBiomeSettings,
        notificationMode,
        pushKey,
        scheduleSettings,
        ...(autoBiome?.getSnapshot() ?? {
            autoBiomeCompetitionBiomes: {
                guildTournamentBiomeId: null,
                personalDerbyBiomeId: null,
            },
            autoBiomeCompetitionStatus: '自动换图开启后检测',
            autoBiomeCompetitionUpdatedAt: 0,
            autoBiomeLastUpdatedAt: 0,
            autoBiomeStatus: '等待天气数据',
            autoBiomeTarget: null,
            autoBiomeWeatherByBiome: {},
        }),
        ...(autoBait?.getSnapshot() ?? {
            autoBaitCurrentBaitId: null,
            autoBaitCurrentQuantity: null,
            autoBaitLastCheckedAt: 0,
            autoBaitLastPurchasedAt: 0,
            autoBaitStatus: '未启用',
        }),
        ...schedule.getSnapshot(),
    };
}

function handleAutomationStateChanged({ forceBait = false } = {}) {
    forceNextAutoBaitCheck ||= forceBait;
    const biomeUpdate = autoBiome?.handleStateChanged();

    if (!enabled || !autoBiomeSettings.enabled) {
        void Promise.resolve(biomeUpdate).then(() => {
            const force = forceNextAutoBaitCheck;

            forceNextAutoBaitCheck = false;
            return autoBait?.handleStateChanged({ force });
        });
    }
}

function reloadIfFishingIdle() {
    if (!enabled || schedule?.getSnapshot().schedulePhase === 'rest') {
        return false;
    }

    const timeoutMilliseconds = idleReloadSettings.minutes * 60000;

    if (!fishingActivityWatchdog.observe(timeoutMilliseconds)) {
        return false;
    }

    panel.setStatus(
        `连续 ${idleReloadSettings.minutes} 分钟未钓鱼，正在刷新页面`,
    );
    panel.setNextDelay('—');
    console.warn(
        `[自动抛竿] 连续 ${idleReloadSettings.minutes} 分钟未收到抛竿结果，正在刷新页面。`,
    );
    window.location.reload();
    return true;
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

/**
 * 查询当前可见且不可点击的冷却倒计时按钮。
 */
function findCooldownButton() {
    const buttons = document.querySelectorAll('button');

    for (const button of buttons) {
        if (!isCooldownButton(button, CONFIG.cooldownButtonText)) {
            continue;
        }

        if (!isVisible(button)) {
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
    const cooldownWatchdog = createCooldownWatchdog(CONFIG.cooldownReloadDelay);

    while (enabled && currentLoopId === loopId) {
        if (captcha.stopIfChallengeFound()) {
            return null;
        }

        if (schedule.isWorkExpired()) {
            return null;
        }

        if (reloadIfFishingIdle()) {
            return null;
        }

        const button = findCastButton();

        if (button) {
            return button;
        }

        const cooldownButton = findCooldownButton();

        if (cooldownWatchdog.observe(Boolean(cooldownButton))) {
            panel.setStatus('冷却倒计时卡住，正在刷新页面');
            panel.setNextDelay('—');

            console.warn(
                '[自动抛竿] 冷却倒计时持续超过 10 秒，正在刷新页面。',
                cooldownButton,
            );

            window.location.reload();
            return null;
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

        if (reloadIfFishingIdle()) {
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

        if (autoBiome?.isSwitching() || autoBait?.isChecking()) {
            await sleep(CONFIG.buttonPollInterval);
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
    fishingActivityWatchdog.markFishing();

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

    handleAutomationStateChanged();
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

function setAutoBiomeEnabled(nextEnabled) {
    autoBiomeSettings = {
        ...autoBiomeSettings,
        enabled: Boolean(nextEnabled),
    };
    saveAutoBiomeSettings(autoBiomeSettings);
    panel.renderAutoBiomeSettings();
    handleAutomationStateChanged();
}

function setAutoBiomeWeight(nextWeight) {
    autoBiomeSettings = {
        ...autoBiomeSettings,
        biomeWeight: normalizeAutoBiomeWeight(
            nextWeight,
            autoBiomeSettings.biomeWeight,
        ),
    };
    saveAutoBiomeSettings(autoBiomeSettings);
    panel.renderAutoBiomeSettings();
    handleAutomationStateChanged();
}

function setAutoBiomeChaseGoldBreeze(nextEnabled) {
    autoBiomeSettings = {
        ...autoBiomeSettings,
        chaseGoldBreeze: Boolean(nextEnabled),
    };
    saveAutoBiomeSettings(autoBiomeSettings);
    panel.renderAutoBiomeSettings();
    handleAutomationStateChanged({ forceBait: true });
}

function setAutoBiomePreferCompetition(nextEnabled) {
    autoBiomeSettings = {
        ...autoBiomeSettings,
        preferCompetitionBiomes: Boolean(nextEnabled),
    };
    saveAutoBiomeSettings(autoBiomeSettings);
    panel.renderAutoBiomeSettings();
    handleAutomationStateChanged();
}

function updateAutoBaitSettings(nextSettings) {
    autoBaitSettings = {
        ...autoBaitSettings,
        ...nextSettings,
    };
    saveAutoBaitSettings(autoBaitSettings);
    panel.renderAutoBaitSettings();
    handleAutomationStateChanged({ forceBait: true });
}

function setAutoBaitEnabled(nextEnabled) {
    updateAutoBaitSettings({ enabled: Boolean(nextEnabled) });
}

function setAutoBaitGrade(field, nextGrade) {
    if (!AUTO_BAIT_GRADE_FIELDS.has(field)) {
        return;
    }

    updateAutoBaitSettings({
        [field]: normalizeAutoBaitGrade(nextGrade, autoBaitSettings[field]),
    });
}

function setAutoBaitMinimumQuantity(nextQuantity) {
    updateAutoBaitSettings({
        minimumQuantity: normalizeAutoBaitMinimumQuantity(
            nextQuantity,
            autoBaitSettings.minimumQuantity,
        ),
    });
}

function setAutoBaitPurchaseQuantity(nextQuantity) {
    updateAutoBaitSettings({
        purchaseQuantity: normalizeAutoBaitPurchaseQuantity(
            nextQuantity,
            autoBaitSettings.purchaseQuantity,
        ),
    });
}

function setIdleReloadMinutes(nextMinutes) {
    idleReloadSettings = {
        minutes: normalizeIdleReloadMinutes(
            nextMinutes,
            idleReloadSettings.minutes,
        ),
    };
    saveIdleReloadSettings(idleReloadSettings);
    fishingActivityWatchdog.markFishing();
    panel.renderIdleReloadSettings();
}

function setScheduleEnabled(nextEnabled) {
    scheduleSettings = {
        ...scheduleSettings,
        enabled: Boolean(nextEnabled),
    };
    saveScheduleSettings(scheduleSettings);
    schedule.reset();
    fishingActivityWatchdog.markFishing();

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
    fishingActivityWatchdog.markFishing();

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

function initialize() {
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
        onWorkStarted() {
            fishingActivityWatchdog.markFishing();
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
            setAutoBaitEnabled,
            setAutoBaitGrade,
            setAutoBaitMinimumQuantity,
            setAutoBaitPurchaseQuantity,
            setAutoBiomeEnabled,
            setAutoBiomeChaseGoldBreeze,
            setAutoBiomePreferCompetition,
            setAutoBiomeWeight,
            setCaptchaBypassEnabled,
            setEnabled,
            setIdleReloadMinutes,
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

    autoBait = createAutoBaitController({
        getPlayer: gameState.getPlayerSnapshot,
        getState: getPanelState,
        onStateChange() {
            panel?.renderAutoBaitSettings();
        },
    });

    autoBiome = createAutoBiomeController({
        getPlayer: gameState.getPlayerSnapshot,
        getState: getPanelState,
        onBiomeReady(biomeId) {
            const force = forceNextAutoBaitCheck;

            forceNextAutoBaitCheck = false;
            return autoBait?.checkNow({ biomeId, force });
        },
        onStateChange() {
            panel?.renderAutoBiomeSettings();
        },
    });

    for (const response of pendingWeatherResponses.values()) {
        autoBiome.handleWeatherResponse(response);
    }
    pendingWeatherResponses.clear();

    for (const response of pendingCompetitionResponses.values()) {
        if (autoBiome.handleCompetitionResponse(response)) {
            void autoBait.handleStateChanged({ force: true });
        }
    }
    pendingCompetitionResponses.clear();

    if (pendingCaptchaChallenge) {
        captcha.handleChallenge(pendingCaptchaChallenge);
        pendingCaptchaChallenge = null;
    }

    // 第一次安装默认关闭；之后恢复上次保存的状态
    setEnabled(enabled);
    autoBiome.start();

    console.info('[自动抛竿] 脚本已加载，使用右下角按钮或 Alt + A 控制。');
}

if (document.body) {
    initialize();
} else {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
}
