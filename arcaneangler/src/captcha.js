import {
    CONFIG,
    HUMAN_VERIFICATION_TEXT,
    STAFF_QUESTION_TEXT,
} from './config.js';
import { isVisible, normalizeText } from './utils/dom.js';
import { randomInt, sleep } from './utils/time.js';

const ENGLISH_SMALL_NUMBERS = {
    eight: 8,
    eighteen: 18,
    eleven: 11,
    fifteen: 15,
    five: 5,
    four: 4,
    fourteen: 14,
    nine: 9,
    nineteen: 19,
    one: 1,
    seven: 7,
    seventeen: 17,
    six: 6,
    sixteen: 16,
    ten: 10,
    thirteen: 13,
    three: 3,
    twelve: 12,
    two: 2,
    zero: 0,
};
const ENGLISH_TENS = {
    eighty: 80,
    fifty: 50,
    forty: 40,
    ninety: 90,
    seventy: 70,
    sixty: 60,
    thirty: 30,
    twenty: 20,
};

function parseEnglishNumber(value) {
    const tokens = String(value ?? '')
        .toLowerCase()
        .replace(/-/g, ' ')
        .split(/\s+/)
        .filter((token) => token && token !== 'and');

    function parseUnderOneHundred(parts) {
        if (parts.length === 1) {
            return ENGLISH_SMALL_NUMBERS[parts[0]] ?? ENGLISH_TENS[parts[0]];
        }

        if (
            parts.length === 2 &&
            ENGLISH_TENS[parts[0]] != null &&
            ENGLISH_SMALL_NUMBERS[parts[1]] > 0 &&
            ENGLISH_SMALL_NUMBERS[parts[1]] < 10
        ) {
            return ENGLISH_TENS[parts[0]] + ENGLISH_SMALL_NUMBERS[parts[1]];
        }

        return undefined;
    }

    const hundredIndex = tokens.indexOf('hundred');

    if (hundredIndex === -1) {
        return parseUnderOneHundred(tokens);
    }

    if (
        hundredIndex !== 1 ||
        ENGLISH_SMALL_NUMBERS[tokens[0]] == null ||
        ENGLISH_SMALL_NUMBERS[tokens[0]] < 1 ||
        ENGLISH_SMALL_NUMBERS[tokens[0]] > 9
    ) {
        return undefined;
    }

    const remainder = tokens.slice(2);
    const remainderValue =
        remainder.length === 0 ? 0 : parseUnderOneHundred(remainder);

    return remainderValue == null
        ? undefined
        : ENGLISH_SMALL_NUMBERS[tokens[0]] * 100 + remainderValue;
}

function parseStaffQuestionNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : parseEnglishNumber(value);
}

/**
 * 只回答能够明确解析的基础算术题，开放问题交给用户手动处理。
 */
export function solveStaffQuestion(question) {
    const normalizedQuestion = normalizeText(question);
    const match =
        normalizedQuestion.match(
            /^(?:how much is|what is|calculate)\s+([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(x|×|\*|\+|-|−|÷|\/|plus|minus|times|multiplied by|divided by)\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*\??$/i,
        ) ??
        normalizedQuestion.match(
            /^(?:how much is|what is|calculate)\s+(.+?)\s+(plus|minus|times|multiplied by|divided by)\s+(.+?)\s*\??$/i,
        ) ??
        normalizedQuestion.match(
            /^(?:请?计算\s*)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(x|×|\*|\+|-|−|÷|\/|加|减|乘|乘以|除以)\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:等于多少|是多少|结果是多少)?\s*[?？]?$/i,
        );

    if (!match) {
        return null;
    }

    const left = parseStaffQuestionNumber(match[1]);
    const right = parseStaffQuestionNumber(match[3]);
    const operator = match[2].toLowerCase();
    let result;

    if (!Number.isFinite(left) || !Number.isFinite(right)) {
        return null;
    }

    if (
        ['x', '×', '*', 'times', 'multiplied by', '乘', '乘以'].includes(
            operator,
        )
    ) {
        result = left * right;
    } else if (['+', 'plus', '加'].includes(operator)) {
        result = left + right;
    } else if (['-', '−', 'minus', '减'].includes(operator)) {
        result = left - right;
    } else if (
        ['/', '÷', 'divided by', '除以'].includes(operator) &&
        right !== 0
    ) {
        result = left / right;
    } else {
        return null;
    }

    if (!Number.isFinite(result)) {
        return null;
    }

    const normalizedResult = Math.round(result * 1e10) / 1e10;

    return String(Object.is(normalizedResult, -0) ? 0 : normalizedResult);
}

/**
 * 新版验证码会把缺口绘制成位于画面垂直中央的纯色矩形。
 * 在拼图高度范围内统计重复颜色，再从连续列中还原缺口左边界。
 */
export function findCaptchaGapFromPixels(imageData, pieceDimensions) {
    const canvasWidth = Number(imageData?.width);
    const canvasHeight = Number(imageData?.height);
    const pixels = imageData?.data;
    const gapWidth = Math.round(Number(pieceDimensions?.width));
    const gapHeight = Math.round(Number(pieceDimensions?.height));

    if (
        !Number.isInteger(canvasWidth) ||
        !Number.isInteger(canvasHeight) ||
        canvasWidth <= 0 ||
        canvasHeight <= 0 ||
        pixels?.length !== canvasWidth * canvasHeight * 4
    ) {
        throw new Error('验证码背景像素数据无效');
    }

    if (
        !Number.isInteger(gapWidth) ||
        !Number.isInteger(gapHeight) ||
        gapWidth <= 2 ||
        gapHeight <= 2 ||
        gapWidth >= canvasWidth ||
        gapHeight > canvasHeight
    ) {
        throw new Error('验证码拼图尺寸无效');
    }

    const gapTop = Math.round((canvasHeight - gapHeight) / 2);
    const sampleTop = Math.max(0, gapTop + 1);
    const sampleBottom = Math.min(canvasHeight, gapTop + gapHeight - 1);
    const sampleHeight = sampleBottom - sampleTop;
    const colorCounts = new Map();

    for (let y = sampleTop; y < sampleBottom; y += 1) {
        for (let x = 0; x < canvasWidth; x += 1) {
            const offset = (y * canvasWidth + x) * 4;
            const color =
                pixels[offset] * 0x1000000 +
                pixels[offset + 1] * 0x10000 +
                pixels[offset + 2] * 0x100 +
                pixels[offset + 3];

            colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
        }
    }

    let repeatedColor = null;
    let repeatedColorCount = 0;

    for (const [color, count] of colorCounts) {
        if (count > repeatedColorCount) {
            repeatedColor = color;
            repeatedColorCount = count;
        }
    }

    const columnMatches = new Uint16Array(canvasWidth);

    for (let x = 0; x < canvasWidth; x += 1) {
        for (let y = sampleTop; y < sampleBottom; y += 1) {
            const offset = (y * canvasWidth + x) * 4;
            const color =
                pixels[offset] * 0x1000000 +
                pixels[offset + 1] * 0x10000 +
                pixels[offset + 2] * 0x100 +
                pixels[offset + 3];

            if (color === repeatedColor) {
                columnMatches[x] += 1;
            }
        }
    }

    const minimumColumnMatches = Math.floor(sampleHeight * 0.8);
    const minimumRunWidth = Math.floor(gapWidth * 0.6);
    const maximumRunWidth = Math.ceil(gapWidth * 1.2);
    const candidates = [];
    let runStart = null;

    for (let x = 0; x <= canvasWidth; x += 1) {
        const isMatchingColumn =
            x < canvasWidth && columnMatches[x] >= minimumColumnMatches;

        if (isMatchingColumn && runStart == null) {
            runStart = x;
        } else if (!isMatchingColumn && runStart != null) {
            const runWidth = x - runStart;

            if (runWidth >= minimumRunWidth && runWidth <= maximumRunWidth) {
                candidates.push({
                    end: x,
                    start: runStart,
                    width: runWidth,
                });
            }

            runStart = null;
        }
    }

    const gap = candidates.sort(
        (left, right) =>
            Math.abs(left.width - gapWidth) - Math.abs(right.width - gapWidth),
    )[0];

    if (!gap) {
        throw new Error('未找到验证码图片中的缺口');
    }

    const gapX = Math.round((gap.start + gap.end - gapWidth) / 2);
    const travelWidth = canvasWidth - gapWidth;

    if (gapX < 0 || gapX > travelWidth) {
        throw new Error('验证码缺口坐标超出可移动范围');
    }

    return {
        canvasWidth,
        gapX,
        gapWidth,
        ratio: gapX / travelWidth,
    };
}

export function createCaptchaController({
    getState,
    notify,
    onVerificationResult,
    setEnabled,
    setNextDelay,
    setStatus,
}) {
    let activeCaptchaChallenge = null;
    let activeStaffQuestion = null;
    let captchaBypassAttemptId = 0;
    let captchaBypassInProgress = false;

    function reportVerificationResult(success) {
        try {
            onVerificationResult?.({
                success: Boolean(success),
                timestamp: Date.now(),
            });
        } catch (error) {
            console.warn('[自动过验证] 无法记录验证结果：', error);
        }
    }

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

    function findStaffQuestion() {
        const inputs = document.querySelectorAll(
            'input[type="text"][maxlength="500"]',
        );

        for (const input of inputs) {
            if (!isVisible(input)) {
                continue;
            }

            const verification = {
                container: input.parentElement,
                input,
            };
            const props = readStaffQuestionProps(verification);

            if (
                props &&
                (activeStaffQuestion?.id == null ||
                    String(props.questionId) === String(activeStaffQuestion.id))
            ) {
                return {
                    ...verification,
                    question: normalizeText(props.question),
                };
            }
        }

        return null;
    }

    function getReactFiber(element) {
        const fiberKey = Object.keys(element ?? {}).find(
            (key) =>
                key.startsWith('__reactFiber$') ||
                key.startsWith('__reactInternalInstance$'),
        );

        return fiberKey ? element[fiberKey] : null;
    }

    /**
     * 调用页面传给验证弹窗的 onClose，保持 React 内部状态同步。
     */
    function closeHumanVerification(verification) {
        let fiber = getReactFiber(verification);

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

    function readStaffQuestionProps(verification) {
        for (const element of [verification?.container, verification?.input]) {
            let fiber = getReactFiber(element);

            while (fiber) {
                const props = fiber.memoizedProps;

                if (
                    props?.questionId != null &&
                    typeof props.question === 'string' &&
                    typeof props.onDismiss === 'function'
                ) {
                    return props;
                }

                fiber = fiber.return;
            }
        }

        return null;
    }

    function closeStaffQuestion(verification) {
        const props = readStaffQuestionProps(verification);

        if (!props) {
            return false;
        }

        props.onDismiss();
        return true;
    }

    function syncVisibleStaffQuestion() {
        const verification = findStaffQuestion();

        if (!verification) {
            return null;
        }

        const props = readStaffQuestionProps(verification);
        const detectedQuestion = {
            ...activeStaffQuestion,
            castCountRef:
                props?.castCountRef ?? activeStaffQuestion?.castCountRef,
            id: props?.questionId ?? activeStaffQuestion?.id ?? null,
            question:
                props?.question ??
                verification.question ??
                activeStaffQuestion?.question ??
                '',
        };

        activeStaffQuestion = detectedQuestion;

        return verification;
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

    async function waitForStaffQuestionToClose(isAttemptActive) {
        const deadline = Date.now() + 1500;

        while (findStaffQuestion()) {
            if (!isAttemptActive()) {
                return false;
            }

            if (Date.now() >= deadline) {
                throw new Error('Staff Question 弹窗关闭超时');
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

    function readSvgDimensions(source, fieldName) {
        if (typeof source !== 'string' || !source.includes('<svg')) {
            throw new Error(`服务端未返回有效的${fieldName} SVG`);
        }

        const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
        const parserError = svg.querySelector('parsererror');

        if (parserError) {
            throw new Error(`${fieldName} SVG 解析失败`);
        }

        const root = svg.documentElement;
        const viewBox = root
            .getAttribute('viewBox')
            ?.trim()
            .split(/\s+/)
            .map(Number);
        const width = root.hasAttribute('width')
            ? parseSvgNumber(root.getAttribute('width'), `${fieldName}宽度`)
            : viewBox?.[2];
        const height = root.hasAttribute('height')
            ? parseSvgNumber(root.getAttribute('height'), `${fieldName}高度`)
            : viewBox?.[3];

        if (!(width > 0) || !(height > 0)) {
            throw new Error(`无法读取${fieldName}尺寸`);
        }

        return {
            height,
            svg,
            width,
        };
    }

    /**
     * 从背景 SVG 中提取直接暴露的缺口坐标。
     *
     * 当前题面使用带 stroke-dasharray 的矩形标记缺口边界；该坐标与
     * 滑块答案一起下发到了浏览器，因此无需图像识别即可还原答案。
     */
    function readExposedCaptchaAnswer(source) {
        const { svg } = readSvgDimensions(source, '验证码背景');
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

    async function readImageCaptchaAnswer(challenge) {
        const piece = readSvgDimensions(challenge.pieceSvg, '验证码拼图');
        const image = await new Promise((resolve, reject) => {
            const element = new Image();

            element.addEventListener('load', () => resolve(element), {
                once: true,
            });
            element.addEventListener(
                'error',
                () => reject(new Error('验证码背景图片加载失败')),
                { once: true },
            );
            element.src = challenge.bgImage;
        });
        const canvas = document.createElement('canvas');

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) {
            throw new Error('浏览器不支持读取验证码背景图片');
        }

        context.drawImage(image, 0, 0);

        return findCaptchaGapFromPixels(
            context.getImageData(0, 0, canvas.width, canvas.height),
            piece,
        );
    }

    async function readCaptchaAnswer(challenge) {
        if (typeof challenge?.bgSvg === 'string') {
            return readExposedCaptchaAnswer(challenge.bgSvg);
        }

        if (
            typeof challenge?.bgImage === 'string' &&
            typeof challenge?.pieceSvg === 'string'
        ) {
            return readImageCaptchaAnswer(challenge);
        }

        throw new Error('验证码 challenge 数据不完整');
    }

    async function runCaptchaBypass(challenge, isAttemptActive) {
        const api = window.ApiService;

        if (typeof api?.notifyCaptchaVerified !== 'function') {
            throw new Error('页面验证码 API 不可用');
        }

        if (!isAttemptActive()) {
            return false;
        }

        if (!challenge?.token) {
            throw new Error('验证码 challenge 数据不完整');
        }

        const answer = await readCaptchaAnswer(challenge);
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

    async function runStaffQuestionBypass(question, isAttemptActive) {
        const api = window.ApiService;

        if (typeof api?.answerToastQuestion !== 'function') {
            throw new Error('页面 Staff Question API 不可用');
        }

        const answer = solveStaffQuestion(question?.question);

        if (answer == null) {
            throw new Error(
                `无法可靠回答 Staff Question：${question?.question || '未知题目'}`,
            );
        }

        if (
            !(await waitForCaptchaStep(
                CONFIG.captchaObserveDelayMin,
                CONFIG.captchaObserveDelayMax,
                '正在识别 Staff Question',
                '提交答案',
                isAttemptActive,
            ))
        ) {
            return false;
        }

        const verification = syncVisibleStaffQuestion();
        const latestQuestion = activeStaffQuestion ?? question;

        if (latestQuestion?.id == null) {
            throw new Error('Staff Question 缺少题目 ID');
        }

        const castCount = Number(latestQuestion.castCountRef?.current);

        await api.answerToastQuestion(
            latestQuestion.id,
            answer,
            Number.isFinite(castCount) && castCount >= 0 ? castCount : 0,
        );

        if (String(activeStaffQuestion?.id) === String(latestQuestion.id)) {
            activeStaffQuestion = null;
        }

        console.warn('[自动过验证] Staff Question 已自动回答：', {
            answer,
            question: latestQuestion.question,
        });

        if (
            !(await waitForCaptchaStep(
                CONFIG.captchaConfirmDelayMin,
                CONFIG.captchaConfirmDelayMax,
                '答案已提交，等待页面确认',
                '关闭验证弹窗',
                isAttemptActive,
            ))
        ) {
            return false;
        }

        const visibleQuestion = verification?.container?.isConnected
            ? verification
            : findStaffQuestion();

        if (visibleQuestion && !closeStaffQuestion(visibleQuestion)) {
            throw new Error('无法关闭 Staff Question 弹窗');
        }

        if (!(await waitForStaffQuestionToClose(isAttemptActive))) {
            return false;
        }

        setStatus('Staff Question 已完成，正在恢复自动抛竿');
        setNextDelay('—');

        return true;
    }

    function cancelCaptchaBypass() {
        captchaBypassAttemptId += 1;
        captchaBypassInProgress = false;
    }

    function stopForHumanVerification() {
        const verificationName = activeStaffQuestion
            ? STAFF_QUESTION_TEXT
            : '人机验证';

        setEnabled(false);
        setStatus(`检测到 ${verificationName}，已停止`);
        setNextDelay('请手动完成验证');

        console.warn(`[自动抛竿] 检测到 ${verificationName}，自动操作已停止。`);

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

            if (bypassSucceeded) {
                reportVerificationResult(true);
            }
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

            reportVerificationResult(false);
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

    async function autoBypassStaffQuestion(question) {
        const { captchaBypassEnabled } = getState();

        if (!captchaBypassEnabled || captchaBypassInProgress) {
            return;
        }

        const attemptId = captchaBypassAttemptId + 1;

        captchaBypassAttemptId = attemptId;
        captchaBypassInProgress = true;
        let bypassSucceeded = false;
        console.warn('[自动抛竿] 捕获到 Staff Question，尝试自动回答。');

        try {
            bypassSucceeded = await runStaffQuestionBypass(question, () => {
                const state = getState();

                return (
                    state.enabled &&
                    state.captchaBypassEnabled &&
                    attemptId === captchaBypassAttemptId
                );
            });

            if (bypassSucceeded) {
                reportVerificationResult(true);
            }
        } catch (error) {
            const state = getState();

            if (
                !state.enabled ||
                !state.captchaBypassEnabled ||
                attemptId !== captchaBypassAttemptId
            ) {
                return;
            }

            if (String(activeStaffQuestion?.id) === String(question?.id)) {
                activeStaffQuestion = null;
            }

            reportVerificationResult(false);
            setEnabled(false);
            setStatus('Staff Question 自动处理失败，已停止');
            setNextDelay('请手动完成验证');
            console.warn('[自动抛竿] Staff Question 自动处理失败：', error);

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

    function stopIfVerificationFound() {
        syncVisibleStaffQuestion();

        if (activeStaffQuestion) {
            if (getState().captchaBypassEnabled) {
                void autoBypassStaffQuestion(activeStaffQuestion);
            } else {
                stopForHumanVerification();
            }

            return true;
        }

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

    function handleStaffQuestion(question) {
        if (!question) {
            activeStaffQuestion = null;
            return;
        }

        activeStaffQuestion = question;

        const state = getState();

        if (!state.enabled) {
            return;
        }

        if (state.captchaBypassEnabled) {
            void autoBypassStaffQuestion(question);
        } else {
            stopForHumanVerification();
        }
    }

    function handleBypassSettingChanged() {
        const state = getState();

        if (!state.captchaBypassEnabled) {
            cancelCaptchaBypass();
        }

        if (!state.enabled) {
            return;
        }

        syncVisibleStaffQuestion();

        if (activeStaffQuestion) {
            if (state.captchaBypassEnabled) {
                void autoBypassStaffQuestion(activeStaffQuestion);
            } else {
                stopForHumanVerification();
            }

            return;
        }

        if (!activeCaptchaChallenge) {
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
        clearStaffQuestion() {
            activeStaffQuestion = null;
        },
        handleBypassSettingChanged,
        handleChallenge,
        handleStaffQuestion,
        hasActiveVerification() {
            return Boolean(activeCaptchaChallenge || activeStaffQuestion);
        },
        isBypassInProgress() {
            return captchaBypassInProgress;
        },
        stopIfVerificationFound,
    };
}
