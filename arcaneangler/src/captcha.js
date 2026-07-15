import { CONFIG, HUMAN_VERIFICATION_TEXT } from './config.js';
import { isVisible, normalizeText } from './utils/dom.js';
import { randomInt, sleep } from './utils/time.js';

export function createCaptchaController({
    getState,
    notify,
    setEnabled,
    setNextDelay,
    setStatus,
}) {
    let activeCaptchaChallenge = null;
    let captchaBypassAttemptId = 0;
    let captchaBypassInProgress = false;

    /**
     * 通过可见标题文字判断页面是否出现人机验证。
     */
    function findHumanVerification() {
        const headings = document.querySelectorAll(
            'h1, h2, h3, h4, [role="heading"]',
        );

        for (const heading of headings) {
            if (
                normalizeText(heading.textContent).includes(
                    HUMAN_VERIFICATION_TEXT,
                ) &&
                isVisible(heading)
            ) {
                return heading;
            }
        }

        return null;
    }

    /**
     * 调用页面传给验证弹窗的 onClose，保持 React 内部状态同步。
     */
    function closeHumanVerification(verification) {
        const fiberKey = Object.keys(verification).find(
            (key) =>
                key.startsWith('__reactFiber$') ||
                key.startsWith('__reactInternalInstance$'),
        );
        let fiber = fiberKey ? verification[fiberKey] : null;

        while (fiber) {
            const props = fiber.memoizedProps;

            if (props?.isOpen === true && typeof props.onClose === 'function') {
                props.onClose();
                return true;
            }

            fiber = fiber.return;
        }

        return false;
    }

    async function waitForCaptchaStep(
        minDelay,
        maxDelay,
        status,
        nextAction,
        isAttemptActive,
    ) {
        const endTime = Date.now() + randomInt(minDelay, maxDelay);

        while (isAttemptActive()) {
            const remaining = endTime - Date.now();

            if (remaining <= 0) {
                return true;
            }

            setStatus(status);
            setNextDelay(`${(remaining / 1000).toFixed(1)} 秒后${nextAction}`);

            await sleep(Math.min(100, remaining));
        }

        return false;
    }

    async function waitForHumanVerificationToClose(isAttemptActive) {
        const deadline = Date.now() + 1500;

        while (findHumanVerification()) {
            if (!isAttemptActive()) {
                return false;
            }

            if (Date.now() >= deadline) {
                throw new Error('人机验证弹窗关闭超时');
            }

            await sleep(50);
        }

        return true;
    }

    function parseSvgNumber(value, fieldName) {
        const number = Number.parseFloat(value);

        if (!Number.isFinite(number)) {
            throw new Error(`无法读取验证码的 ${fieldName}`);
        }

        return number;
    }

    /**
     * 从背景 SVG 中提取直接暴露的缺口坐标。
     *
     * 当前题面使用带 stroke-dasharray 的矩形标记缺口边界；该坐标与
     * 滑块答案一起下发到了浏览器，因此无需图像识别即可还原答案。
     */
    function readExposedCaptchaAnswer(source) {
        if (typeof source !== 'string' || !source.includes('<svg')) {
            throw new Error('服务端未返回有效的验证码 SVG');
        }

        const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
        const parserError = svg.querySelector('parsererror');

        if (parserError) {
            throw new Error('验证码背景 SVG 解析失败');
        }

        const root = svg.documentElement;
        const gap = Array.from(svg.querySelectorAll('rect')).find((rect) =>
            rect.hasAttribute('stroke-dasharray'),
        );

        if (!gap) {
            throw new Error('未找到验证码缺口标记');
        }

        const viewBox = root
            .getAttribute('viewBox')
            ?.trim()
            .split(/\s+/)
            .map(Number);
        const canvasWidth =
            viewBox?.length === 4 && Number.isFinite(viewBox[2])
                ? viewBox[2]
                : parseSvgNumber(root.getAttribute('width'), '画布宽度');
        const gapX = parseSvgNumber(gap.getAttribute('x'), '缺口横坐标');
        const gapWidth = parseSvgNumber(gap.getAttribute('width'), '拼图宽度');
        const travelWidth = canvasWidth - gapWidth;

        if (travelWidth <= 0 || gapX < 0 || gapX > travelWidth) {
            throw new Error('验证码缺口坐标超出可移动范围');
        }

        return {
            canvasWidth,
            gapX,
            gapWidth,
            ratio: gapX / travelWidth,
        };
    }

    async function runCaptchaBypass(challenge, isAttemptActive) {
        const api = window.ApiService;

        if (typeof api?.notifyCaptchaVerified !== 'function') {
            throw new Error('页面验证码 API 不可用');
        }

        if (!isAttemptActive()) {
            return false;
        }

        if (!challenge?.token || typeof challenge.bgSvg !== 'string') {
            throw new Error('验证码 challenge 数据不完整');
        }

        const answer = readExposedCaptchaAnswer(challenge.bgSvg);
        const rangeValue = Math.round(answer.ratio * 100);

        console.warn('[自动过验证] 客户端已暴露验证码答案：', {
            ...answer,
            rangeValue,
        });

        if (
            !(await waitForCaptchaStep(
                CONFIG.captchaObserveDelayMin,
                CONFIG.captchaObserveDelayMax,
                '正在观察验证题面',
                '操作滑块',
                isAttemptActive,
            ))
        ) {
            return false;
        }

        if (
            !(await waitForCaptchaStep(
                CONFIG.captchaDragDelayMin,
                CONFIG.captchaDragDelayMax,
                '正在模拟滑块操作',
                '提交验证',
                isAttemptActive,
            ))
        ) {
            return false;
        }

        await api.notifyCaptchaVerified(challenge.token, String(rangeValue));

        if (activeCaptchaChallenge?.token === challenge.token) {
            activeCaptchaChallenge = null;
        }

        if (!isAttemptActive()) {
            return false;
        }

        const verifiedAt = Date.now();
        const nextInterval = randomInt(900000, 1200000);

        localStorage.setItem('fishingCaptchaLastVerified', String(verifiedAt));
        localStorage.setItem('fishingCaptchaInterval', String(nextInterval));

        console.warn('[自动过验证] 服务端接受了由客户端题面计算出的答案。');

        if (
            !(await waitForCaptchaStep(
                CONFIG.captchaConfirmDelayMin,
                CONFIG.captchaConfirmDelayMax,
                '验证通过，等待页面确认',
                '关闭验证弹窗',
                isAttemptActive,
            ))
        ) {
            return false;
        }

        const verification = findHumanVerification();

        if (verification && !closeHumanVerification(verification)) {
            throw new Error('无法关闭人机验证弹窗');
        }

        if (!(await waitForHumanVerificationToClose(isAttemptActive))) {
            return false;
        }

        setStatus('人机验证已完成，正在恢复自动抛竿');
        setNextDelay('—');

        return true;
    }

    function cancelCaptchaBypass() {
        captchaBypassAttemptId += 1;
        captchaBypassInProgress = false;
    }

    function stopForHumanVerification() {
        setEnabled(false);
        setStatus('检测到人机验证，已停止');
        setNextDelay('请手动完成验证');

        console.warn('[自动抛竿] 检测到人机验证，自动操作已停止。');

        void notify();
    }

    /**
     * 自动尝试绕过人机验证。
     *
     * 成功时关闭验证弹窗并重新启动抛竿循环。
     * 失败时停止脚本并发送消息推送通知。
     */
    async function autoBypassCaptcha(challenge) {
        const { captchaBypassEnabled } = getState();

        if (!captchaBypassEnabled || captchaBypassInProgress) {
            return;
        }

        const attemptId = captchaBypassAttemptId + 1;

        captchaBypassAttemptId = attemptId;
        captchaBypassInProgress = true;
        let bypassSucceeded = false;
        console.warn('[自动抛竿] 捕获到验证码 challenge，尝试自动验证。');

        try {
            bypassSucceeded = await runCaptchaBypass(challenge, () => {
                const state = getState();

                return (
                    state.enabled &&
                    state.captchaBypassEnabled &&
                    attemptId === captchaBypassAttemptId
                );
            });
        } catch (error) {
            const state = getState();

            if (
                !state.enabled ||
                !state.captchaBypassEnabled ||
                attemptId !== captchaBypassAttemptId
            ) {
                return;
            }

            if (activeCaptchaChallenge?.token === challenge?.token) {
                activeCaptchaChallenge = null;
            }

            setEnabled(false);
            setStatus('人机验证绕过失败，已停止');
            setNextDelay('请手动完成验证');
            console.warn('[自动抛竿] 人机验证自动绕过失败：', error);

            void notify();
        } finally {
            if (attemptId === captchaBypassAttemptId) {
                captchaBypassInProgress = false;
            }
        }

        const state = getState();

        if (
            bypassSucceeded &&
            state.enabled &&
            state.captchaBypassEnabled &&
            attemptId === captchaBypassAttemptId
        ) {
            setEnabled(true);
        }
    }

    function stopIfCaptchaChallengeFound() {
        if (!activeCaptchaChallenge) {
            return false;
        }

        if (getState().captchaBypassEnabled) {
            // 触发自动过验证（异步，不阻塞当前循环退出）
            void autoBypassCaptcha(activeCaptchaChallenge);
        } else {
            stopForHumanVerification();
        }

        return true;
    }

    function handleChallenge(challenge) {
        activeCaptchaChallenge = challenge;

        const state = getState();

        if (!state.enabled) {
            return;
        }

        if (state.captchaBypassEnabled) {
            void autoBypassCaptcha(challenge);
        } else {
            stopForHumanVerification();
        }
    }

    function handleBypassSettingChanged() {
        const state = getState();

        if (!state.captchaBypassEnabled) {
            cancelCaptchaBypass();
        }

        if (!state.enabled || !activeCaptchaChallenge) {
            return;
        }

        if (state.captchaBypassEnabled) {
            void autoBypassCaptcha(activeCaptchaChallenge);
        } else {
            stopForHumanVerification();
        }
    }

    return {
        cancel: cancelCaptchaBypass,
        clearChallenge() {
            activeCaptchaChallenge = null;
        },
        handleBypassSettingChanged,
        handleChallenge,
        hasActiveChallenge() {
            return Boolean(activeCaptchaChallenge);
        },
        isBypassInProgress() {
            return captchaBypassInProgress;
        },
        stopIfChallengeFound: stopIfCaptchaChallengeFound,
    };
}
