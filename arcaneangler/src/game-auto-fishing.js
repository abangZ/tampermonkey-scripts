import { CONFIG } from './config.js';
import { isDisplayed, normalizeText } from './utils/dom.js';

export function findGameAutoFishingButton(root = document) {
    const buttons = root.querySelectorAll('button');

    for (const button of buttons) {
        if (!isDisplayed(button)) {
            continue;
        }

        const text = normalizeText(button.textContent);
        const hasKnownIcon = text.includes('🤖') || text.includes('🛑');
        const hasKnownLayout = button.classList.contains('flex-[15]');

        if (hasKnownLayout && hasKnownIcon) {
            return button;
        }
    }

    return null;
}

export function getGameAutoFishingState(root = document) {
    const button = findGameAutoFishingButton(root);

    if (!button) {
        return {
            active: false,
            available: false,
            button: null,
            enabled: false,
        };
    }

    const text = normalizeText(button.textContent);

    return {
        active: text.includes('🛑'),
        available: true,
        button,
        enabled:
            !button.disabled && button.getAttribute('aria-disabled') !== 'true',
    };
}

export function dismissGameAutoFishingSummary(root = document) {
    const headings = root.querySelectorAll('h1, h2, h3');

    for (const heading of headings) {
        if (!normalizeText(heading.textContent).includes('🤖')) {
            continue;
        }

        let overlay = heading.parentElement;

        while (overlay && !overlay.classList.contains('fixed')) {
            overlay = overlay.parentElement;
        }

        if (!overlay) {
            continue;
        }

        const buttons = overlay.querySelectorAll('button');

        for (const button of buttons) {
            if (isDisplayed(button)) {
                button.click();
                return true;
            }
        }
    }

    return false;
}

export function dismissGameAutoFishingCompletion(root = document) {
    const overlays = root.querySelectorAll('div.fixed.inset-0');

    for (const overlay of overlays) {
        const text = normalizeText(overlay.textContent);
        const isCompletion =
            /auto-cast complete\s*:\s*all stamina consumed!?/i.test(text) ||
            /自动(?:抛竿|钓鱼)完成\s*[：:]\s*体力已耗尽[！!]?/.test(text);

        if (!isCompletion) {
            continue;
        }

        const buttons = overlay.querySelectorAll('button');

        for (const button of buttons) {
            const buttonText = normalizeText(button.textContent);

            if (isDisplayed(button) && /^(?:ok|确定)$/i.test(buttonText)) {
                button.click();
                return true;
            }
        }
    }

    return false;
}

export function createGameAutoFishingController({
    now = Date.now,
    onStateChange,
    prepareStart,
    retryInterval = CONFIG.gameAutoFishingRetryInterval,
    staminaRetryInterval = CONFIG.gameAutoFishingStaminaRetryInterval,
    shouldStart = () => true,
} = {}) {
    let mayBeActive = false;
    let preparationRequired = true;
    let startPendingUntil = 0;
    let staminaRetryUntil = 0;
    let status = '未启用';
    let wasActive = false;

    function setStatus(nextStatus) {
        if (status === nextStatus) {
            return;
        }

        status = nextStatus;
        onStateChange?.();
    }

    function observe() {
        const state = getGameAutoFishingState();

        if (state.active) {
            mayBeActive = true;
            preparationRequired = false;
            startPendingUntil = 0;
            wasActive = true;
        } else if (state.available && now() >= startPendingUntil) {
            if (wasActive) {
                preparationRequired = true;
            }

            mayBeActive = false;
            wasActive = false;
        }

        return state;
    }

    async function ensureActive() {
        if (dismissGameAutoFishingCompletion()) {
            mayBeActive = false;
            preparationRequired = true;
            startPendingUntil = 0;
            staminaRetryUntil = now() + staminaRetryInterval;
            wasActive = false;
            setStatus('体力已耗尽，稍后自动续期');

            return {
                ...getGameAutoFishingState(),
                active: false,
                staminaExhausted: true,
            };
        }

        dismissGameAutoFishingSummary();
        let state = observe();

        if (now() < staminaRetryUntil) {
            setStatus('体力已耗尽，稍后自动续期');
            return {
                ...state,
                active: false,
                staminaExhausted: true,
            };
        }

        staminaRetryUntil = 0;

        if (state.active) {
            setStatus('运行中，次数结束后自动续期');
            return state;
        }

        if (!state.available) {
            setStatus('等待游戏内置自动钓鱼按钮');
            return state;
        }

        if (now() < startPendingUntil) {
            setStatus('正在启动');
            return state;
        }

        if (!state.enabled) {
            setStatus('等待体力或按钮冷却');
            return state;
        }

        if (!shouldStart()) {
            setStatus('已取消启动');
            return state;
        }

        if (preparationRequired) {
            setStatus('正在准备内置自动钓鱼鱼饵');

            if ((await prepareStart?.()) === false) {
                setStatus('等待内置自动钓鱼鱼饵可用');
                return observe();
            }

            preparationRequired = false;
            state = observe();

            if (state.active) {
                setStatus('运行中，次数结束后自动续期');
                return state;
            }

            if (!state.available || !state.enabled || !shouldStart()) {
                setStatus(
                    !state.available
                        ? '等待游戏内置自动钓鱼按钮'
                        : !state.enabled
                          ? '等待体力或按钮冷却'
                          : '已取消启动',
                );
                return state;
            }
        }

        startPendingUntil = now() + retryInterval;
        mayBeActive = true;
        state.button.click();

        const nextState = observe();

        setStatus(nextState.active ? '运行中，次数结束后自动续期' : '正在启动');
        return nextState;
    }

    function ensureStopped() {
        const state = observe();

        if (!state.active) {
            if (now() < startPendingUntil) {
                setStatus('等待启动操作完成后停止');
                return false;
            }

            if (!state.available && mayBeActive) {
                setStatus('等待返回钓鱼页面后停止');
                return false;
            }

            // 无论是主动停止还是次数自然耗尽，都可能留下汇总遮罩。
            // 恢复脚本点击前先关闭，避免遮挡抛竿按钮。
            dismissGameAutoFishingSummary();
            dismissGameAutoFishingCompletion();

            mayBeActive = false;
            staminaRetryUntil = 0;
            setStatus('已停止');
            return true;
        }

        if (!state.enabled) {
            setStatus('等待按钮冷却后停止');
            return false;
        }

        startPendingUntil = 0;
        state.button.click();
        setStatus('正在停止');
        return false;
    }

    return {
        ensureActive,
        ensureStopped,
        getSnapshot() {
            return {
                gameAutoFishingMayBeActive: mayBeActive,
                gameAutoFishingStatus: status,
            };
        },
        observe,
    };
}
