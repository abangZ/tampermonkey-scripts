// ==UserScript==
// @name         Arcane Angler 自动抛竿
// @namespace    arcane-angler-auto-cast
// @version      1.8.0
// @author       Codex
// @description  自动点击“抛竿线”按钮，带随机等待和启停控制
// @updateURL    https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js
// @downloadURL  https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js
// @match        https://arcaneangler.com/*
// @match        https://www.arcaneangler.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * 免责声明：
 * 本脚本仅供学习与个人研究使用。使用者应自行遵守目标网站的服务条款、
 * 使用规则及所在地法律法规。因使用本脚本产生的账号限制、数据损失或
 * 其他直接、间接后果，均由使用者自行承担，脚本作者不承担相关责任。
 */

(() => {
    'use strict';

    /**
     * 配置
     */
    const CONFIG = {
        // 目标按钮文字，按钮实际显示为：🎣 抛竿线
        buttonText: '抛竿线',

        // 正常等待时间：1～2 秒
        normalDelayMin: 500,
        normalDelayMax: 2000,

        // 长等待时间：5～10 秒
        longDelayMin: 5000,
        longDelayMax: 10000,

        // 长等待概率：0.08 = 8%
        longDelayChance: 0.08,

        // 按钮未出现时的检查间隔
        buttonPollInterval: 250,

        // 模拟鼠标按下持续时间
        mouseDownMin: 35,
        mouseDownMax: 90,

        // 自动验证：模拟人观察题面、拖动滑块和确认结果的耗时
        captchaObserveDelayMin: 2200,
        captchaObserveDelayMax: 4200,
        captchaDragDelayMin: 900,
        captchaDragDelayMax: 1800,
        captchaConfirmDelayMin: 1400,
        captchaConfirmDelayMax: 2600,

        // 定时运行/休息会在设置值上加入 -5%～+10% 的随机量
        scheduleRandomExtraRatioMin: -0.05,
        scheduleRandomExtraRatioMax: 0.1,

    };

    const STORAGE_KEY = 'arcane-angler-auto-cast-enabled-v1';
    const CAPTCHA_BYPASS_STORAGE_KEY =
        'arcane-angler-captcha-bypass-enabled-v1';
    const PUSH_KEY_STORAGE_KEY = 'arcane-angler-push-key-v1';
    const NOTIFICATION_MODE_STORAGE_KEY =
        'arcane-angler-notification-mode-v1';
    const SCHEDULE_SETTINGS_STORAGE_KEY =
        'arcane-angler-schedule-settings-v1';
    const PANEL_COLLAPSED_STORAGE_KEY =
        'arcane-angler-panel-collapsed-v1';
    const EARNINGS_STORAGE_KEY = 'arcane-angler-earnings-v1';
    const PANEL_ID = 'arcane-angler-auto-cast-panel-host';
    const HUMAN_VERIFICATION_TEXT = '人机验证';
    const HUMAN_VERIFICATION_MESSAGE =
        'Arcane Angler 出现验证码了，自动抛竿已停止';
    const EARNINGS_CATEGORY_DISPLAY = {
        unknown: {
            label: '未知',
            tone: 'unknown',
        },
        common: {
            label: '普通',
            tone: 'common',
        },
        uncommon: {
            label: '罕见',
            tone: 'uncommon',
        },
        fine: {
            label: '精良',
            tone: 'fine',
        },
        rare: {
            label: '稀有',
            tone: 'rare',
        },
        epic: {
            label: '史诗',
            tone: 'epic',
        },
        legendary: {
            label: '传说',
            tone: 'legendary',
        },
        mythic: {
            label: '神话',
            tone: 'mythic',
        },
        exotic: {
            label: '奇异',
            tone: 'exotic',
        },
        arcane: {
            label: '奥术',
            tone: 'arcane',
        },
        relic: {
            label: '遗物',
            tone: 'relic',
        },
        'treasure chest': {
            label: '宝箱',
            tone: 'treasure',
        },
        gears: {
            label: '装备',
            tone: 'gear',
        },
    };

    let enabled = loadEnabled();
    let captchaBypassEnabled = loadCaptchaBypassEnabled();
    let pushKey = loadPushKey();
    let notificationMode = loadNotificationMode();
    let scheduleSettings = loadScheduleSettings();
    let panelCollapsed = loadPanelCollapsed();
    let earningsStats = loadEarningsStats();
    let panelView = 'control';
    let loopId = 0;
    let clickCount = 0;
    let ui = null;
    let activeCaptchaChallenge = null;
    let captchaBypassInProgress = false;
    let captchaBypassAttemptId = 0;
    let schedulePhase = 'work';
    let scheduleEndsAt = 0;
    let scheduleDuration = 0;

    /**
     * 包装页面的 fetch：处理抛竿请求/收益，并复用页面验证码 challenge。
     */
    function installFetchInterceptor() {
        const originalFetch = window.fetch;

        window.fetch = async function(input, init) {
            const request = input instanceof Request ? input : null;
            const method = String(
                init?.method ?? request?.method ?? 'GET',
            ).toUpperCase();

            let url = null;

            try {
                url = new URL(
                    request?.url ?? String(input),
                    window.location.href,
                );
            } catch {
                // URL 无法解析时保持原 fetch 行为。
            }

            if (
                method === 'POST' &&
                url?.pathname === '/api/game/cast'
            ) {
                const modifiedRequest = await modifyCastRequest(
                    input,
                    request,
                    init,
                );

                const response = modifiedRequest
                    ? await originalFetch.call(
                        this,
                        modifiedRequest.input,
                        modifiedRequest.init,
                    )
                    : await originalFetch.apply(this, arguments);

                try {
                    void collectCastResponse(response.clone());
                } catch (error) {
                    console.warn('[收益统计] 无法复制抛竿响应：', error);
                }

                return response;
            }

            const response = await originalFetch.apply(this, arguments);

            if (
                method === 'GET' &&
                url?.pathname === '/api/game/captcha-challenge'
            ) {
                try {
                    void collectCaptchaChallengeResponse(response.clone());
                } catch (error) {
                    console.warn(
                        '[自动过验证] 无法复制验证码 challenge 响应：',
                        error,
                    );
                }
            } else if (
                method === 'POST' &&
                url?.pathname === '/api/game/captcha-verified' &&
                response.ok
            ) {
                activeCaptchaChallenge = null;
            }

            return response;
        };
    }

    async function modifyCastRequest(input, request, init) {
        try {
            let body = init?.body;

            if (body === undefined && request) {
                body = await request.clone().text();
            }

            const originalPayload = await normalizeRequestBody(body);

            if (
                !originalPayload ||
                typeof originalPayload !== 'object' ||
                Array.isArray(originalPayload)
            ) {
                throw new TypeError('payload 不是可修改的对象');
            }

            const payload = {
                ...originalPayload,
                isTrusted: true,
            };

            console.info(
                '[自动抛竿] POST /api/game/cast payload:',
                payload,
            );

            const modifiedBody = JSON.stringify(payload);

            if (init?.body !== undefined || !request) {
                return {
                    input,
                    init: {
                        ...init,
                        body: modifiedBody,
                    },
                };
            }

            return {
                input: new Request(request, {
                    body: modifiedBody,
                }),
                init,
            };
        } catch (error) {
            console.warn(
                '[自动抛竿] 无法修改 POST /api/game/cast payload，保留原请求：',
                error,
            );

            return null;
        }
    }

    async function normalizeRequestBody(body) {
        if (body == null) {
            return body;
        }

        if (typeof body === 'string') {
            try {
                return JSON.parse(body);
            } catch {
                return body;
            }
        }

        if (body instanceof URLSearchParams) {
            return Object.fromEntries(body.entries());
        }

        if (body instanceof FormData) {
            return Object.fromEntries(body.entries());
        }

        if (body instanceof Blob) {
            return normalizeRequestBody(await body.text());
        }

        return body;
    }

    async function collectCastResponse(response) {
        if (!response.ok) {
            return;
        }

        try {
            const payload = await response.json();

            if (
                payload?.success !== true ||
                !payload.result ||
                typeof payload.result !== 'object'
            ) {
                return;
            }

            recordCastResult(payload.result);
        } catch (error) {
            console.warn('[收益统计] 无法读取抛竿响应：', error);
        }
    }

    async function collectCaptchaChallengeResponse(response) {
        if (!response.ok) {
            return;
        }

        try {
            const payload = await response.json();
            const challenge = payload?.result ?? payload;

            if (
                !challenge?.token ||
                typeof challenge.bgSvg !== 'string'
            ) {
                return;
            }

            activeCaptchaChallenge = challenge;

            if (!enabled) {
                return;
            }

            if (captchaBypassEnabled) {
                void autoBypassCaptcha(challenge);
            } else {
                stopForHumanVerification();
            }
        } catch (error) {
            console.warn(
                '[自动过验证] 无法读取验证码 challenge 响应：',
                error,
            );
        }
    }

    function createEmptyEarningsStats() {
        return {
            startedAt: Date.now(),
            updatedAt: null,
            casts: 0,
            fish: 0,
            gold: 0,
            xp: 0,
            relics: 0,
            treasureChests: 0,
            gears: 0,
            rarityCounts: {},
        };
    }

    function toNonNegativeNumber(value) {
        const number = Number(value);

        return Number.isFinite(number) && number > 0 ? number : 0;
    }

    function loadEarningsStats() {
        const emptyStats = createEmptyEarningsStats();

        try {
            const savedStats = JSON.parse(
                localStorage.getItem(EARNINGS_STORAGE_KEY),
            );

            if (!savedStats || typeof savedStats !== 'object') {
                return emptyStats;
            }

            return {
                ...emptyStats,
                startedAt:
                    toNonNegativeNumber(savedStats.startedAt) ||
                    emptyStats.startedAt,
                updatedAt:
                    toNonNegativeNumber(savedStats.updatedAt) || null,
                casts: toNonNegativeNumber(savedStats.casts),
                fish: toNonNegativeNumber(savedStats.fish),
                gold: toNonNegativeNumber(savedStats.gold),
                xp: toNonNegativeNumber(savedStats.xp),
                relics: toNonNegativeNumber(savedStats.relics),
                treasureChests: toNonNegativeNumber(
                    savedStats.treasureChests,
                ),
                gears: toNonNegativeNumber(savedStats.gears),
                rarityCounts:
                    savedStats.rarityCounts &&
                    typeof savedStats.rarityCounts === 'object'
                        ? savedStats.rarityCounts
                        : {},
            };
        } catch (error) {
            console.warn('[收益统计] 无法读取本地统计：', error);
            return emptyStats;
        }
    }

    function saveEarningsStats() {
        try {
            localStorage.setItem(
                EARNINGS_STORAGE_KEY,
                JSON.stringify(earningsStats),
            );
        } catch (error) {
            console.warn('[收益统计] 无法保存本地统计：', error);
        }
    }

    function recordCastResult(result) {
        const rarity = String(result.rarity ?? '').trim();
        const count = Math.max(1, toNonNegativeNumber(result.count));
        const isTreasure =
            Boolean(result.treasureChest) || rarity === 'Treasure Chest';
        const isRelic = rarity === 'Relic';
        const isGear =
            rarity === 'Gears' &&
            Boolean(result.gear) &&
            !result.inventoryFull;
        const isFish =
            Boolean(result.fish?.name) &&
            !isTreasure &&
            !isRelic &&
            rarity !== 'Gears';
        const gold = toNonNegativeNumber(result.goldGained);
        const xp = toNonNegativeNumber(result.xpGained);
        const relics = toNonNegativeNumber(result.relicsGained);
        const category = isTreasure
            ? 'Treasure Chest'
            : isRelic
                ? 'Relic'
                : rarity === 'Gears'
                    ? 'Gears'
                    : rarity || 'Unknown';
        const earnedCount = isFish ? count : 1;

        earningsStats = {
            ...earningsStats,
            updatedAt: Date.now(),
            casts: earningsStats.casts + 1,
            fish: earningsStats.fish + (isFish ? count : 0),
            gold: earningsStats.gold + gold,
            xp: earningsStats.xp + xp,
            relics: earningsStats.relics + relics,
            treasureChests:
                earningsStats.treasureChests + (isTreasure ? 1 : 0),
            gears: earningsStats.gears + (isGear ? 1 : 0),
            rarityCounts: {
                ...earningsStats.rarityCounts,
                [category]:
                    toNonNegativeNumber(
                        earningsStats.rarityCounts[category],
                    ) + earnedCount,
            },
        };

        saveEarningsStats();
        renderEarningsStats();
    }

    /**
     * 工具函数
     */

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function sleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    function loadEnabled() {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch {
            return false;
        }
    }

    function saveEnabled(value) {
        try {
            localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
        } catch (error) {
            console.warn('[自动抛竿] 无法保存设置：', error);
        }
    }

    function loadCaptchaBypassEnabled() {
        try {
            const savedValue = localStorage.getItem(
                CAPTCHA_BYPASS_STORAGE_KEY,
            );

            return savedValue === null ? true : savedValue === '1';
        } catch {
            return true;
        }
    }

    function saveCaptchaBypassEnabled(value) {
        try {
            localStorage.setItem(
                CAPTCHA_BYPASS_STORAGE_KEY,
                value ? '1' : '0',
            );
        } catch (error) {
            console.warn('[自动抛竿] 无法保存自动过验证设置：', error);
        }
    }

    function loadPushKey() {
        try {
            return localStorage.getItem(PUSH_KEY_STORAGE_KEY)?.trim() ?? '';
        } catch {
            return '';
        }
    }

    function savePushKey(value) {
        try {
            if (value) {
                localStorage.setItem(PUSH_KEY_STORAGE_KEY, value);
            } else {
                localStorage.removeItem(PUSH_KEY_STORAGE_KEY);
            }
        } catch (error) {
            console.warn('[自动抛竿] 无法保存消息推送 Key：', error);
        }
    }

    function loadNotificationMode() {
        try {
            return localStorage.getItem(NOTIFICATION_MODE_STORAGE_KEY) ===
                'browser'
                ? 'browser'
                : 'server';
        } catch {
            return 'server';
        }
    }

    function saveNotificationMode(value) {
        try {
            localStorage.setItem(NOTIFICATION_MODE_STORAGE_KEY, value);
        } catch (error) {
            console.warn('[自动抛竿] 无法保存通知方式：', error);
        }
    }

    function normalizeScheduleMinutes(value, fallback) {
        const minutes = Number(value);

        if (!Number.isFinite(minutes) || minutes < 1) {
            return fallback;
        }

        return Math.min(1440, Math.round(minutes));
    }

    function loadScheduleSettings() {
        const defaults = {
            enabled: false,
            workMinutes: 60,
            restMinutes: 10,
        };

        try {
            const savedSettings = JSON.parse(
                localStorage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY),
            );

            if (!savedSettings || typeof savedSettings !== 'object') {
                return defaults;
            }

            return {
                enabled: savedSettings.enabled === true,
                workMinutes: normalizeScheduleMinutes(
                    savedSettings.workMinutes,
                    defaults.workMinutes,
                ),
                restMinutes: normalizeScheduleMinutes(
                    savedSettings.restMinutes,
                    defaults.restMinutes,
                ),
            };
        } catch (error) {
            console.warn('[自动抛竿] 无法读取定时休息设置：', error);
            return defaults;
        }
    }

    function saveScheduleSettings() {
        try {
            localStorage.setItem(
                SCHEDULE_SETTINGS_STORAGE_KEY,
                JSON.stringify(scheduleSettings),
            );
        } catch (error) {
            console.warn('[自动抛竿] 无法保存定时休息设置：', error);
        }
    }

    function loadPanelCollapsed() {
        const collapseByDefault = window.matchMedia(
            '(max-width: 767px)',
        ).matches;

        try {
            const savedValue = localStorage.getItem(
                PANEL_COLLAPSED_STORAGE_KEY,
            );

            return savedValue === null
                ? collapseByDefault
                : savedValue === '1';
        } catch {
            return collapseByDefault;
        }
    }

    function savePanelCollapsed(value) {
        try {
            localStorage.setItem(
                PANEL_COLLAPSED_STORAGE_KEY,
                value ? '1' : '0',
            );
        } catch (error) {
            console.warn('[自动抛竿] 无法保存面板折叠状态：', error);
        }
    }

    function normalizeText(text) {
        return String(text ?? '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isVisible(element) {
        if (!(element instanceof HTMLElement)) {
            return false;
        }

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.visibility !== 'collapse' &&
            Number.parseFloat(style.opacity || '1') > 0
        );
    }

    function isDisplayed(element) {
        return (
            isVisible(element) &&
            window.getComputedStyle(element).pointerEvents !== 'none'
        );
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

    /**
     * 调用页面传给验证弹窗的 onClose，保持 React 内部状态同步。
     */
    function closeHumanVerification(verification) {
        const fiberKey = Object.keys(verification).find(key =>
            key.startsWith('__reactFiber$') ||
            key.startsWith('__reactInternalInstance$'),
        );
        let fiber = fiberKey ? verification[fiberKey] : null;

        while (fiber) {
            const props = fiber.memoizedProps;

            if (
                props?.isOpen === true &&
                typeof props.onClose === 'function'
            ) {
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
            setNextDelay(
                `${(remaining / 1000).toFixed(1)} 秒后${nextAction}`,
            );

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

        const svg = new DOMParser().parseFromString(
            source,
            'image/svg+xml',
        );
        const parserError = svg.querySelector('parsererror');

        if (parserError) {
            throw new Error('验证码背景 SVG 解析失败');
        }

        const root = svg.documentElement;
        const gap = Array.from(svg.querySelectorAll('rect')).find(rect =>
            rect.hasAttribute('stroke-dasharray'),
        );

        if (!gap) {
            throw new Error('未找到验证码缺口标记');
        }

        const viewBox = root.getAttribute('viewBox')
            ?.trim()
            .split(/\s+/)
            .map(Number);
        const canvasWidth =
            viewBox?.length === 4 && Number.isFinite(viewBox[2])
                ? viewBox[2]
                : parseSvgNumber(root.getAttribute('width'), '画布宽度');
        const gapX = parseSvgNumber(gap.getAttribute('x'), '缺口横坐标');
        const gapWidth = parseSvgNumber(
            gap.getAttribute('width'),
            '拼图宽度',
        );
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

        if (!(
            await waitForCaptchaStep(
                CONFIG.captchaObserveDelayMin,
                CONFIG.captchaObserveDelayMax,
                '正在观察验证题面',
                '操作滑块',
                isAttemptActive,
            )
        )) {
            return false;
        }

        if (!(
            await waitForCaptchaStep(
                CONFIG.captchaDragDelayMin,
                CONFIG.captchaDragDelayMax,
                '正在模拟滑块操作',
                '提交验证',
                isAttemptActive,
            )
        )) {
            return false;
        }

        await api.notifyCaptchaVerified(
            challenge.token,
            String(rangeValue),
        );

        if (activeCaptchaChallenge?.token === challenge.token) {
            activeCaptchaChallenge = null;
        }

        if (!isAttemptActive()) {
            return false;
        }

        const verifiedAt = Date.now();
        const nextInterval = randomInt(900000, 1200000);

        localStorage.setItem(
            'fishingCaptchaLastVerified',
            String(verifiedAt),
        );
        localStorage.setItem(
            'fishingCaptchaInterval',
            String(nextInterval),
        );

        console.warn(
            '[自动过验证] 服务端接受了由客户端题面计算出的答案。',
        );

        if (!(
            await waitForCaptchaStep(
                CONFIG.captchaConfirmDelayMin,
                CONFIG.captchaConfirmDelayMax,
                '验证通过，等待页面确认',
                '关闭验证弹窗',
                isAttemptActive,
            )
        )) {
            return false;
        }

        const verification = findHumanVerification();

        if (
            verification &&
            !closeHumanVerification(verification)
        ) {
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

        void sendHumanVerificationNotification();
    }

    /**
     * 自动尝试绕过人机验证。
     *
     * 成功时关闭验证弹窗并重新启动抛竿循环。
     * 失败时停止脚本并发送消息推送通知。
     */
    async function autoBypassCaptcha(challenge) {
        if (!captchaBypassEnabled || captchaBypassInProgress) {
            return;
        }

        const attemptId = captchaBypassAttemptId + 1;

        captchaBypassAttemptId = attemptId;
        captchaBypassInProgress = true;
        let bypassSucceeded = false;
        console.warn(
            '[自动抛竿] 捕获到验证码 challenge，尝试自动验证。',
        );

        try {
            bypassSucceeded = await runCaptchaBypass(
                challenge,
                () =>
                    enabled &&
                    captchaBypassEnabled &&
                    attemptId === captchaBypassAttemptId,
            );
        } catch (error) {
            if (
                !enabled ||
                !captchaBypassEnabled ||
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
            console.warn(
                '[自动抛竿] 人机验证自动绕过失败：',
                error,
            );

            void sendHumanVerificationNotification();
        } finally {
            if (attemptId === captchaBypassAttemptId) {
                captchaBypassInProgress = false;
            }
        }

        if (
            bypassSucceeded &&
            enabled &&
            captchaBypassEnabled &&
            attemptId === captchaBypassAttemptId
        ) {
            setEnabled(true);
        }
    }

    function stopIfCaptchaChallengeFound() {
        if (!activeCaptchaChallenge) {
            return false;
        }

        if (captchaBypassEnabled) {
            // 触发自动过验证（异步，不阻塞当前循环退出）
            void autoBypassCaptcha(activeCaptchaChallenge);
        } else {
            stopForHumanVerification();
        }

        return true;
    }

    async function sendHumanVerificationNotification() {
        if (notificationMode === 'browser') {
            sendBrowserHumanVerificationNotification();
            return;
        }

        await sendServerHumanVerificationNotification();
    }

    async function sendServerHumanVerificationNotification() {
        const currentPushKey = pushKey.trim();

        if (!currentPushKey) {
            console.info(
                '[自动抛竿] 未设置消息推送 Key，跳过验证码通知。' +
                '可前往 https://sct.ftqq.com/ 获取 SendKey。',
            );
            return;
        }

        const url =
            `https://sctapi.ftqq.com/${encodeURIComponent(currentPushKey)}` +
            `.send?title=${encodeURIComponent(HUMAN_VERIFICATION_MESSAGE)}`;

        try {
            const response = await window.fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            console.info('[自动抛竿] 验证码通知已发送。');
        } catch (error) {
            console.warn('[自动抛竿] 验证码通知发送失败：', error);
        }
    }

    function sendBrowserHumanVerificationNotification() {
        if (typeof window.Notification !== 'function') {
            console.warn('[自动抛竿] 当前浏览器不支持系统通知。');
            return;
        }

        if (window.Notification.permission !== 'granted') {
            console.warn(
                '[自动抛竿] 浏览器通知尚未授权，跳过验证码通知。',
            );
            return;
        }

        try {
            const notification = new window.Notification(
                'Arcane Angler 人机验证',
                {
                    body: HUMAN_VERIFICATION_MESSAGE,
                    tag: 'arcane-angler-human-verification',
                },
            );

            notification.onclick = () => {
                window.focus();
                notification.close();
            };

            console.info('[自动抛竿] 浏览器验证码通知已发送。');
        } catch (error) {
            console.warn('[自动抛竿] 浏览器验证码通知发送失败：', error);
        }
    }

    async function requestBrowserNotificationPermission() {
        if (typeof window.Notification !== 'function') {
            renderNotificationSettings();
            return;
        }

        try {
            await window.Notification.requestPermission();
        } catch (error) {
            console.warn('[自动抛竿] 请求浏览器通知权限失败：', error);
        }

        renderNotificationSettings();
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
                milliseconds: randomInt(
                    CONFIG.longDelayMin,
                    CONFIG.longDelayMax,
                ),
                isLongDelay: true,
            };
        }

        return {
            milliseconds: randomInt(
                CONFIG.normalDelayMin,
                CONFIG.normalDelayMax,
            ),
            isLongDelay: false,
        };
    }

    function formatScheduleDuration(milliseconds) {
        const totalSeconds = Math.max(
            0,
            Math.ceil(milliseconds / 1000),
        );
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes === 0) {
            return `${seconds} 秒`;
        }

        return seconds > 0
            ? `${minutes} 分 ${seconds} 秒`
            : `${minutes} 分钟`;
    }

    function getRandomizedScheduleDuration(baseMinutes) {
        const extraRatio =
            CONFIG.scheduleRandomExtraRatioMin +
            Math.random() *
                (
                    CONFIG.scheduleRandomExtraRatioMax -
                    CONFIG.scheduleRandomExtraRatioMin
                );

        return Math.round(baseMinutes * (1 + extraRatio) * 60000);
    }

    function resetScheduleCycle() {
        schedulePhase = 'work';
        scheduleEndsAt = 0;
        scheduleDuration = 0;
        renderScheduleSettings();
    }

    function startSchedulePhase(phase) {
        const baseMinutes = phase === 'rest'
            ? scheduleSettings.restMinutes
            : scheduleSettings.workMinutes;

        schedulePhase = phase;
        scheduleDuration = getRandomizedScheduleDuration(baseMinutes);
        scheduleEndsAt = Date.now() + scheduleDuration;
        renderScheduleSettings();

        console.info(
            `[自动抛竿] 本轮${phase === 'rest' ? '休息' : '运行'}时长：` +
            formatScheduleDuration(scheduleDuration),
        );
    }

    function isScheduledWorkExpired() {
        return (
            scheduleSettings.enabled &&
            schedulePhase === 'work' &&
            scheduleEndsAt > 0 &&
            Date.now() >= scheduleEndsAt
        );
    }

    function shouldEnterScheduledRest(currentLoopId) {
        return (
            enabled &&
            currentLoopId === loopId &&
            !captchaBypassInProgress &&
            !activeCaptchaChallenge &&
            isScheduledWorkExpired()
        );
    }

    async function waitForScheduledWork(currentLoopId) {
        if (!scheduleSettings.enabled) {
            return true;
        }

        if (scheduleEndsAt === 0) {
            startSchedulePhase('work');
        }

        while (enabled && currentLoopId === loopId) {
            if (!scheduleSettings.enabled) {
                resetScheduleCycle();
                return true;
            }

            if (schedulePhase === 'work') {
                if (!isScheduledWorkExpired()) {
                    return true;
                }

                startSchedulePhase('rest');
            }

            // 休息阶段仍处理运行周期末尾遗留的验证码：自动验证成功后
            // 会重新启动循环；关闭自动验证或验证失败时则保持停止。
            if (stopIfCaptchaChallengeFound()) {
                return false;
            }

            const remaining = scheduleEndsAt - Date.now();

            if (remaining <= 0) {
                startSchedulePhase('work');
                return true;
            }

            setStatus('定时休息中');
            setNextDelay(`剩余 ${formatScheduleDuration(remaining)}`);
            renderScheduleStatus(remaining);

            await sleep(Math.min(1000, remaining));
        }

        return false;
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
            isScheduledWorkExpired()
        ) {
            return false;
        }

        if (stopIfCaptchaChallengeFound()) {
            return false;
        }

        const rect = button.getBoundingClientRect();

        // 在按钮中心附近随机选择一个位置
        const clientX =
            rect.left + rect.width * (0.42 + Math.random() * 0.16);

        const clientY =
            rect.top + rect.height * (0.38 + Math.random() * 0.24);

        // 获取该坐标实际覆盖的元素
        const hitElement = document.elementFromPoint(
            clientX,
            clientY,
        );

        // 如果按钮被其他元素遮挡，先不点击
        if (
            !hitElement ||
            (hitElement !== button && !button.contains(hitElement))
        ) {
            console.warn(
                '[自动抛竿] 按钮可能被其他元素遮挡：',
                hitElement,
            );

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
        await sleep(
            randomInt(
                CONFIG.mouseDownMin,
                CONFIG.mouseDownMax,
            ),
        );

        const wasCancelled =
            !enabled || currentLoopId !== loopId;

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
            if (stopIfCaptchaChallengeFound()) {
                return null;
            }

            if (isScheduledWorkExpired()) {
                return null;
            }

            const button = findCastButton();

            if (button) {
                return button;
            }

            setStatus('等待“抛竿线”按钮出现');
            setNextDelay('—');

            await sleep(CONFIG.buttonPollInterval);
        }

        return null;
    }

    /**
     * 带倒计时的等待。
     */
    async function waitWithCountdown(
        milliseconds,
        isLongDelay,
        currentLoopId,
    ) {
        const endTime = Date.now() + milliseconds;

        while (enabled && currentLoopId === loopId) {
            if (stopIfCaptchaChallengeFound()) {
                return false;
            }

            if (isScheduledWorkExpired()) {
                return false;
            }

            const remaining = endTime - Date.now();

            if (remaining <= 0) {
                setNextDelay('准备点击');
                return true;
            }

            const seconds = (remaining / 1000).toFixed(1);

            setStatus(
                isLongDelay
                    ? '随机长等待中'
                    : '等待下一次操作',
            );

            setNextDelay(
                isLongDelay
                    ? `${seconds} 秒（长等待）`
                    : `${seconds} 秒`,
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
            const scheduleReady = await waitForScheduledWork(
                currentLoopId,
            );

            if (!scheduleReady) {
                return;
            }

            const button = await waitForButton(currentLoopId);

            if (!button) {
                if (shouldEnterScheduledRest(currentLoopId)) {
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
                if (shouldEnterScheduledRest(currentLoopId)) {
                    continue;
                }

                return;
            }

            // 等待期间 DOM 可能发生变化，所以重新查找
            const latestButton = findCastButton();

            if (!latestButton) {
                continue;
            }

            if (isScheduledWorkExpired()) {
                continue;
            }

            setStatus('正在模拟点击');
            setNextDelay('—');

            const clicked = await simulateClick(
                latestButton,
                currentLoopId,
            );

            if (!enabled || currentLoopId !== loopId) {
                return;
            }

            if (clicked) {
                clickCount += 1;
                updateClickCount();

                const time = new Date().toLocaleTimeString();

                setStatus(`已点击，时间：${time}`);
                console.info(
                    `[自动抛竿] 第 ${clickCount} 次点击`,
                    latestButton,
                );

                // 给页面一点时间处理状态变化
                await sleep(150);
            } else {
                // 如果验证码导致未点击，按当前过验证设置处理后退出。
                if (
                    captchaBypassInProgress ||
                    stopIfCaptchaChallengeFound()
                ) {
                    return;
                }

                if (isScheduledWorkExpired()) {
                    continue;
                }

                setStatus('本次未点击，重新等待');
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
        resetScheduleCycle();

        if (!enabled) {
            cancelCaptchaBypass();
        }

        // 令旧循环失效，避免出现多个循环同时运行
        loopId += 1;

        renderToggle();

        if (enabled) {
            const currentLoopId = loopId;

            setStatus('已启动，正在查找按钮');
            setNextDelay('—');

            runLoop(currentLoopId).catch(error => {
                console.error('[自动抛竿] 运行异常：', error);

                if (currentLoopId === loopId) {
                    setStatus(`运行异常：${error.message}`);
                }
            });
        } else {
            setStatus('已停止');
            setNextDelay('—');
        }
    }

    function setCaptchaBypassEnabled(nextEnabled) {
        captchaBypassEnabled = Boolean(nextEnabled);
        saveCaptchaBypassEnabled(captchaBypassEnabled);

        if (!captchaBypassEnabled) {
            cancelCaptchaBypass();
        }

        renderCaptchaBypassToggle();

        if (!enabled || !activeCaptchaChallenge) {
            return;
        }

        if (captchaBypassEnabled) {
            void autoBypassCaptcha(activeCaptchaChallenge);
        } else {
            stopForHumanVerification();
        }
    }

    function setNotificationMode(nextMode) {
        notificationMode = nextMode === 'browser'
            ? 'browser'
            : 'server';
        saveNotificationMode(notificationMode);
        renderNotificationSettings();

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
        saveScheduleSettings();
        resetScheduleCycle();

        if (enabled && scheduleSettings.enabled) {
            startSchedulePhase('work');
        }
    }

    function setScheduleMinutes(field, value) {
        const nextValue = normalizeScheduleMinutes(
            value,
            scheduleSettings[field],
        );

        scheduleSettings = {
            ...scheduleSettings,
            [field]: nextValue,
        };
        saveScheduleSettings();
        resetScheduleCycle();

        if (enabled && scheduleSettings.enabled) {
            startSchedulePhase('work');
        }
    }

    /**
     * 创建右下角控制面板。
     */
    function createPanel() {
        if (document.getElementById(PANEL_ID)) {
            return;
        }

        const host = document.createElement('div');

        host.id = PANEL_ID;
        host.style.cssText = [
            'position: fixed',
            'right: 16px',
            'bottom: 16px',
            'z-index: 2147483647',
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        ].join(';');

        const shadowRoot = host.attachShadow({
            mode: 'open',
        });

        shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
        }

        .panel {
          width: 250px;
          max-width: calc(100vw - 32px);
          padding: 14px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          background: rgba(18, 18, 24, 0.94);
          box-shadow: 0 10px 32px rgba(0, 0, 0, 0.42);
          color: #ffffff;
          backdrop-filter: blur(12px);
        }

        .panel[data-collapsed="true"] {
          width: auto;
          padding: 7px;
        }

        .panel[data-collapsed="true"] .panel-content,
        .panel[data-collapsed="true"] .title-text {
          display: none;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .title {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 15px;
          font-weight: 700;
        }

        .collapse-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          flex-shrink: 0;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 7px;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.88);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
        }

        .collapse-toggle:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        .panel-content {
          margin-top: 10px;
        }

        .tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
          margin-bottom: 10px;
          padding: 3px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
        }

        .panel-tab {
          padding: 6px 8px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: rgba(255, 255, 255, 0.56);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .panel-tab[data-active="true"] {
          background: #6d5dfc;
          color: #ffffff;
        }

        .panel-view[hidden] {
          display: none;
        }

        .row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin-top: 7px;
          font-size: 12px;
          line-height: 1.4;
        }

        .label {
          flex-shrink: 0;
          color: rgba(255, 255, 255, 0.58);
        }

        .value {
          min-width: 0;
          overflow-wrap: anywhere;
          text-align: right;
          color: rgba(255, 255, 255, 0.92);
        }

        .field {
          display: block;
          margin-top: 12px;
        }

        .field-label {
          display: block;
          margin-bottom: 5px;
          color: rgba(255, 255, 255, 0.58);
          font-size: 12px;
        }

        .input {
          width: 100%;
          padding: 8px 9px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 7px;
          outline: none;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.92);
          font-size: 12px;
        }

        .input:focus {
          border-color: #6d5dfc;
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.32);
        }

        .field-help {
          margin-top: 6px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          line-height: 1.45;
        }

        .field-help[hidden] {
          display: none;
        }

        .field-help a {
          color: #9ea5ff;
          text-decoration: underline;
        }

        .settings-section + .settings-section {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .settings-title {
          color: rgba(255, 255, 255, 0.88);
          font-size: 12px;
          font-weight: 700;
        }

        .choice-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 8px;
        }

        .choice-option {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 7px 8px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 7px;
          color: rgba(255, 255, 255, 0.78);
          font-size: 11px;
          cursor: pointer;
        }

        .choice-option:has(input:checked) {
          border-color: rgba(109, 93, 252, 0.72);
          background: rgba(109, 93, 252, 0.14);
          color: #ffffff;
        }

        .choice-option input {
          margin: 0;
          accent-color: #6d5dfc;
        }

        .settings-group[hidden] {
          display: none;
        }

        .number-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .secondary-button {
          width: 100%;
          margin-top: 9px;
          padding: 7px 10px;
          border: 1px solid rgba(109, 93, 252, 0.55);
          border-radius: 7px;
          background: rgba(109, 93, 252, 0.12);
          color: #b9b5ff;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .secondary-button:hover {
          background: rgba(109, 93, 252, 0.22);
        }

        .secondary-button:disabled {
          cursor: default;
          opacity: 0.48;
        }

        .toggle {
          width: 100%;
          margin-top: 12px;
          padding: 9px 12px;
          border: 0;
          border-radius: 8px;
          background: #6d5dfc;
          color: #ffffff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .toggle:hover {
          filter: brightness(1.08);
        }

        .toggle[data-enabled="true"] {
          background: #d34848;
        }

        .option-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
          color: rgba(255, 255, 255, 0.88);
          font-size: 12px;
          cursor: pointer;
        }

        .switch {
          position: relative;
          width: 38px;
          height: 22px;
          flex-shrink: 0;
        }

        .switch input {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
        }

        .switch-track {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.2);
          transition: background 0.15s ease;
        }

        .switch-track::after {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          content: '';
          transition: transform 0.15s ease;
        }

        .switch input:checked + .switch-track {
          background: #6d5dfc;
        }

        .switch input:checked + .switch-track::after {
          transform: translateX(16px);
        }

        .switch input:focus-visible + .switch-track {
          outline: 2px solid #9ea5ff;
          outline-offset: 2px;
        }

        .hint {
          margin-top: 9px;
          text-align: center;
          color: rgba(255, 255, 255, 0.42);
          font-size: 11px;
        }

        .stats-start {
          margin-bottom: 9px;
          color: rgba(255, 255, 255, 0.48);
          font-size: 10px;
          text-align: center;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }

        .stat-card {
          min-width: 0;
          padding: 8px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.055);
        }

        .stat-card-label {
          display: block;
          margin-bottom: 3px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 10px;
        }

        .stat-card-value {
          display: block;
          overflow: hidden;
          color: rgba(255, 255, 255, 0.94);
          font-size: 13px;
          line-height: 1.25;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stats-section-title {
          margin: 12px 0 6px;
          color: rgba(255, 255, 255, 0.62);
          font-size: 11px;
          font-weight: 700;
        }

        .stats-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .stat-chip {
          max-width: 100%;
          overflow: hidden;
          padding: 4px 6px;
          border-radius: 6px;
          background: rgba(109, 93, 252, 0.16);
          color: #d8d8df;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stat-chip[data-tone="uncommon"] {
          background: rgba(132, 204, 22, 0.14);
          color: #84cc16;
        }

        .stat-chip[data-tone="common"] {
          background: rgba(156, 163, 175, 0.14);
          color: #9ca3af;
        }

        .stat-chip[data-tone="fine"] {
          background: rgba(59, 130, 246, 0.14);
          color: #3b82f6;
        }

        .stat-chip[data-tone="rare"] {
          background: rgba(168, 85, 247, 0.14);
          color: #a855f7;
        }

        .stat-chip[data-tone="epic"] {
          background: rgba(236, 72, 153, 0.14);
          color: #ec4899;
        }

        .stat-chip[data-tone="legendary"] {
          background: rgba(245, 158, 11, 0.14);
          color: #f59e0b;
        }

        .stat-chip[data-tone="mythic"] {
          background: rgba(239, 68, 68, 0.14);
          color: #ef4444;
        }

        .stat-chip[data-tone="exotic"] {
          background: rgba(6, 182, 212, 0.14);
          color: #06b6d4;
        }

        .stat-chip[data-tone="arcane"] {
          background: rgba(168, 85, 247, 0.14);
          color: #a855f7;
        }

        .stat-chip[data-tone="relic"],
        .stat-chip[data-tone="treasure"] {
          background: rgba(242, 204, 96, 0.14);
          color: #f2cc60;
        }

        .stat-chip[data-tone="gear"] {
          background: rgba(86, 212, 221, 0.14);
          color: #7ce7ee;
        }

        .empty-stat {
          color: rgba(255, 255, 255, 0.42);
          font-size: 10px;
          line-height: 1.45;
        }

        .reset-stats {
          width: 100%;
          margin-top: 12px;
          padding: 7px 10px;
          border: 1px solid rgba(211, 72, 72, 0.52);
          border-radius: 7px;
          background: rgba(211, 72, 72, 0.12);
          color: #ff9d9d;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .reset-stats:hover {
          background: rgba(211, 72, 72, 0.22);
        }
      </style>

      <div class="panel">
        <div class="header">
          <div class="title">
            <span aria-hidden="true">🎣</span>
            <span class="title-text">自动抛竿</span>
          </div>

          <button
            id="collapse-toggle"
            class="collapse-toggle"
            type="button"
            aria-controls="panel-content"
          >−</button>
        </div>

        <div id="panel-content" class="panel-content">
          <div class="tabs" role="tablist" aria-label="面板内容">
            <button
              id="control-tab"
              class="panel-tab"
              type="button"
              role="tab"
              aria-controls="control-view"
              aria-selected="true"
              data-active="true"
            >控制</button>
            <button
              id="earnings-tab"
              class="panel-tab"
              type="button"
              role="tab"
              aria-controls="earnings-view"
              aria-selected="false"
              data-active="false"
            >收益</button>
            <button
              id="settings-tab"
              class="panel-tab"
              type="button"
              role="tab"
              aria-controls="settings-view"
              aria-selected="false"
              data-active="false"
            >设置</button>
          </div>

          <div
            id="control-view"
            class="panel-view"
            role="tabpanel"
            aria-labelledby="control-tab"
          >

            <div class="row">
              <span class="label">状态</span>
              <span id="status" class="value">初始化中</span>
            </div>

            <div class="row">
              <span class="label">下一操作</span>
              <span id="next-delay" class="value">—</span>
            </div>

            <div class="row">
              <span class="label">点击次数</span>
              <span id="click-count" class="value">0</span>
            </div>

            <label class="option-row">
              <span>自动过验证</span>
              <span class="switch">
                <input
                  id="captcha-bypass-toggle"
                  type="checkbox"
                  role="switch"
                  aria-label="自动过验证"
                />
                <span class="switch-track" aria-hidden="true"></span>
              </span>
            </label>

            <button id="toggle" class="toggle" type="button">
              启动
            </button>

            <div class="hint">快捷键：Alt + A</div>
          </div>

          <div
            id="earnings-view"
            class="panel-view"
            role="tabpanel"
            aria-labelledby="earnings-tab"
            hidden
          >
            <div id="stats-start" class="stats-start">—</div>

            <div class="stats-grid">
              <div class="stat-card">
                <span class="stat-card-label">成功抛竿</span>
                <strong id="stats-casts" class="stat-card-value">0</strong>
              </div>
              <div class="stat-card">
                <span class="stat-card-label">鱼获</span>
                <strong id="stats-fish" class="stat-card-value">0</strong>
              </div>
              <div class="stat-card">
                <span class="stat-card-label">金币</span>
                <strong id="stats-gold" class="stat-card-value">0</strong>
              </div>
              <div class="stat-card">
                <span class="stat-card-label">经验</span>
                <strong id="stats-xp" class="stat-card-value">0</strong>
              </div>
              <div class="stat-card">
                <span class="stat-card-label">遗物</span>
                <strong id="stats-relics" class="stat-card-value">0</strong>
              </div>
              <div class="stat-card">
                <span class="stat-card-label">宝箱</span>
                <strong id="stats-treasures" class="stat-card-value">0</strong>
              </div>
              <div class="stat-card">
                <span class="stat-card-label">装备</span>
                <strong id="stats-gears" class="stat-card-value">0</strong>
              </div>
              <div class="stat-card">
                <span class="stat-card-label">每竿金币</span>
                <strong id="stats-gold-average" class="stat-card-value">0</strong>
              </div>
            </div>

            <div class="stats-section-title">收获分类</div>
            <div id="rarity-stats" class="stats-list"></div>

            <button id="reset-stats" class="reset-stats" type="button">
              重置收益统计
            </button>
          </div>

          <div
            id="settings-view"
            class="panel-view"
            role="tabpanel"
            aria-labelledby="settings-tab"
            hidden
          >
            <section class="settings-section">
              <div class="settings-title">消息通知</div>

              <div
                class="choice-list"
                role="radiogroup"
                aria-label="消息通知方式"
              >
                <label class="choice-option">
                  <input
                    type="radio"
                    name="notification-mode"
                    value="server"
                  />
                  <span>Server酱</span>
                </label>
                <label class="choice-option">
                  <input
                    type="radio"
                    name="notification-mode"
                    value="browser"
                  />
                  <span>浏览器通知</span>
                </label>
              </div>

              <div id="server-notification-settings" class="settings-group">
                <label class="field">
                  <span class="field-label">消息推送 Key</span>
                  <input
                    id="push-key"
                    class="input"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="Server酱 SendKey"
                  />
                </label>

                <div id="push-key-help" class="field-help">
                  未填写 Key。请前往
                  <a
                    href="https://sct.ftqq.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >Server酱官网</a>，登录后按页面提示获取 SendKey。
                </div>
                <div class="field-help">
                  Server酱每日免费额度仅 5 条，推荐优先使用浏览器通知。
                </div>
              </div>

              <div
                id="browser-notification-settings"
                class="settings-group"
                hidden
              >
                <div class="row">
                  <span class="label">通知权限</span>
                  <span
                    id="browser-notification-permission"
                    class="value"
                  >检查中</span>
                </div>
                <button
                  id="browser-notification-permission-button"
                  class="secondary-button"
                  type="button"
                >授权浏览器通知</button>
                <div class="field-help">
                  浏览器通知仅在当前浏览器和站点授权后可用。
                </div>
              </div>
            </section>

            <section class="settings-section">
              <div class="settings-title">定时休息</div>

              <label class="option-row">
                <span>启用运行/休息周期</span>
                <span class="switch">
                  <input
                    id="schedule-enabled-toggle"
                    type="checkbox"
                    role="switch"
                    aria-label="启用运行和休息周期"
                  />
                  <span class="switch-track" aria-hidden="true"></span>
                </span>
              </label>

              <div id="schedule-settings" class="settings-group" hidden>
                <div class="number-grid">
                  <label class="field">
                    <span class="field-label">运行分钟</span>
                    <input
                      id="schedule-work-minutes"
                      class="input"
                      type="number"
                      min="1"
                      max="1440"
                      step="1"
                      inputmode="numeric"
                    />
                  </label>
                  <label class="field">
                    <span class="field-label">休息分钟</span>
                    <input
                      id="schedule-rest-minutes"
                      class="input"
                      type="number"
                      min="1"
                      max="1440"
                      step="1"
                      inputmode="numeric"
                    />
                  </label>
                </div>

                <div class="row">
                  <span class="label">当前周期</span>
                  <span id="schedule-status" class="value">等待启动</span>
                </div>

                <div class="field-help">
                  每轮实际运行和休息时长，都会在设置值上加入 -5%～+10% 的随机时间。
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

        document.body.appendChild(host);

        ui = {
            panel: shadowRoot.querySelector('.panel'),
            status: shadowRoot.querySelector('#status'),
            nextDelay: shadowRoot.querySelector('#next-delay'),
            clickCount: shadowRoot.querySelector('#click-count'),
            pushKeyInput: shadowRoot.querySelector('#push-key'),
            pushKeyHelp: shadowRoot.querySelector('#push-key-help'),
            captchaBypassToggle: shadowRoot.querySelector(
                '#captcha-bypass-toggle',
            ),
            controlTab: shadowRoot.querySelector('#control-tab'),
            earningsTab: shadowRoot.querySelector('#earnings-tab'),
            settingsTab: shadowRoot.querySelector('#settings-tab'),
            controlView: shadowRoot.querySelector('#control-view'),
            earningsView: shadowRoot.querySelector('#earnings-view'),
            settingsView: shadowRoot.querySelector('#settings-view'),
            notificationModeInputs: shadowRoot.querySelectorAll(
                'input[name="notification-mode"]',
            ),
            serverNotificationSettings: shadowRoot.querySelector(
                '#server-notification-settings',
            ),
            browserNotificationSettings: shadowRoot.querySelector(
                '#browser-notification-settings',
            ),
            browserNotificationPermission: shadowRoot.querySelector(
                '#browser-notification-permission',
            ),
            browserNotificationPermissionButton: shadowRoot.querySelector(
                '#browser-notification-permission-button',
            ),
            scheduleEnabledToggle: shadowRoot.querySelector(
                '#schedule-enabled-toggle',
            ),
            scheduleSettings: shadowRoot.querySelector(
                '#schedule-settings',
            ),
            scheduleWorkMinutes: shadowRoot.querySelector(
                '#schedule-work-minutes',
            ),
            scheduleRestMinutes: shadowRoot.querySelector(
                '#schedule-rest-minutes',
            ),
            scheduleStatus: shadowRoot.querySelector('#schedule-status'),
            statsStart: shadowRoot.querySelector('#stats-start'),
            statsCasts: shadowRoot.querySelector('#stats-casts'),
            statsFish: shadowRoot.querySelector('#stats-fish'),
            statsGold: shadowRoot.querySelector('#stats-gold'),
            statsXp: shadowRoot.querySelector('#stats-xp'),
            statsRelics: shadowRoot.querySelector('#stats-relics'),
            statsTreasures: shadowRoot.querySelector('#stats-treasures'),
            statsGears: shadowRoot.querySelector('#stats-gears'),
            statsGoldAverage: shadowRoot.querySelector(
                '#stats-gold-average',
            ),
            rarityStats: shadowRoot.querySelector('#rarity-stats'),
            resetStats: shadowRoot.querySelector('#reset-stats'),
            collapseToggle: shadowRoot.querySelector('#collapse-toggle'),
            toggle: shadowRoot.querySelector('#toggle'),
        };

        ui.pushKeyInput.value = pushKey;

        ui.pushKeyInput.addEventListener('input', event => {
            pushKey = event.currentTarget.value.trim();
            savePushKey(pushKey);
            renderPushKeyHelp();
        });

        ui.collapseToggle.addEventListener('click', () => {
            setPanelCollapsed(!panelCollapsed);
        });

        ui.toggle.addEventListener('click', () => {
            setEnabled(!enabled);
        });

        ui.captchaBypassToggle.addEventListener('change', event => {
            setCaptchaBypassEnabled(event.currentTarget.checked);
        });

        ui.controlTab.addEventListener('click', () => {
            setPanelView('control');
        });

        ui.earningsTab.addEventListener('click', () => {
            setPanelView('earnings');
        });

        ui.settingsTab.addEventListener('click', () => {
            setPanelView('settings');
        });

        for (const input of ui.notificationModeInputs) {
            input.addEventListener('change', event => {
                if (event.currentTarget.checked) {
                    setNotificationMode(event.currentTarget.value);
                }
            });
        }

        ui.browserNotificationPermissionButton.addEventListener(
            'click',
            () => {
                void requestBrowserNotificationPermission();
            },
        );

        ui.scheduleEnabledToggle.addEventListener('change', event => {
            setScheduleEnabled(event.currentTarget.checked);
        });

        ui.scheduleWorkMinutes.addEventListener('change', event => {
            setScheduleMinutes('workMinutes', event.currentTarget.value);
        });

        ui.scheduleRestMinutes.addEventListener('change', event => {
            setScheduleMinutes('restMinutes', event.currentTarget.value);
        });

        ui.resetStats.addEventListener('click', () => {
            resetEarningsStats();
        });

        renderToggle();
        renderCaptchaBypassToggle();
        renderPanelCollapsed();
        renderNotificationSettings();
        renderScheduleSettings();
        updateClickCount();
        setPanelView(panelView);
        renderEarningsStats();
    }

    function setStatus(text) {
        if (ui?.status) {
            ui.status.textContent = text;
        }
    }

    function setNextDelay(text) {
        if (ui?.nextDelay) {
            ui.nextDelay.textContent = text;
        }
    }

    function updateClickCount() {
        if (ui?.clickCount) {
            ui.clickCount.textContent = String(clickCount);
        }
    }

    function setPanelView(nextView) {
        panelView = nextView === 'earnings' || nextView === 'settings'
            ? nextView
            : 'control';

        if (
            !ui?.controlTab ||
            !ui?.earningsTab ||
            !ui?.settingsTab ||
            !ui?.controlView ||
            !ui?.earningsView ||
            !ui?.settingsView
        ) {
            return;
        }

        const panelItems = [
            ['control', ui.controlTab, ui.controlView],
            ['earnings', ui.earningsTab, ui.earningsView],
            ['settings', ui.settingsTab, ui.settingsView],
        ];

        for (const [view, tab, panel] of panelItems) {
            const active = panelView === view;

            tab.dataset.active = active ? 'true' : 'false';
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            panel.hidden = !active;
        }

        if (panelView === 'earnings') {
            renderEarningsStats();
        } else if (panelView === 'settings') {
            renderNotificationSettings();
            renderScheduleSettings();
        }
    }

    function formatStatNumber(value, maximumFractionDigits = 0) {
        return new Intl.NumberFormat('zh-CN', {
            maximumFractionDigits,
        }).format(toNonNegativeNumber(value));
    }

    function getEarningsCategoryDisplay(category) {
        const originalLabel = normalizeText(category) || 'Unknown';
        const display = EARNINGS_CATEGORY_DISPLAY[
            originalLabel.toLowerCase()
        ];

        return display ?? {
            label: originalLabel,
            tone: 'unknown',
        };
    }

    function renderStatsList(container, entries, emptyText) {
        if (!container) {
            return;
        }

        container.replaceChildren();

        if (entries.length === 0) {
            const empty = document.createElement('span');

            empty.className = 'empty-stat';
            empty.textContent = emptyText;
            container.appendChild(empty);
            return;
        }

        for (const [category, count] of entries) {
            const chip = document.createElement('span');
            const display = getEarningsCategoryDisplay(category);

            chip.className = 'stat-chip';
            chip.dataset.tone = display.tone;
            chip.textContent =
                `${display.label} ×${formatStatNumber(count)}`;
            chip.title = chip.textContent;
            container.appendChild(chip);
        }
    }

    function renderEarningsStats() {
        if (!ui?.statsCasts) {
            return;
        }

        const averageGold = earningsStats.casts > 0
            ? earningsStats.gold / earningsStats.casts
            : 0;

        ui.statsStart.textContent =
            `统计起点：${new Date(earningsStats.startedAt).toLocaleString()}`;
        ui.statsCasts.textContent = formatStatNumber(earningsStats.casts);
        ui.statsFish.textContent = formatStatNumber(earningsStats.fish);
        ui.statsGold.textContent = formatStatNumber(earningsStats.gold, 2);
        ui.statsXp.textContent = formatStatNumber(earningsStats.xp, 2);
        ui.statsRelics.textContent = formatStatNumber(
            earningsStats.relics,
            2,
        );
        ui.statsTreasures.textContent = formatStatNumber(
            earningsStats.treasureChests,
        );
        ui.statsGears.textContent = formatStatNumber(earningsStats.gears);
        ui.statsGoldAverage.textContent = formatStatNumber(averageGold, 1);

        const rarityEntries = Object.entries(
            earningsStats.rarityCounts,
        ).sort((left, right) => right[1] - left[1]);

        renderStatsList(ui.rarityStats, rarityEntries, '暂无收获');
    }

    function resetEarningsStats() {
        if (!window.confirm('确定重置全部收益统计吗？此操作无法撤销。')) {
            return;
        }

        earningsStats = createEmptyEarningsStats();
        saveEarningsStats();
        renderEarningsStats();
    }

    function setPanelCollapsed(nextCollapsed) {
        panelCollapsed = Boolean(nextCollapsed);
        savePanelCollapsed(panelCollapsed);
        renderPanelCollapsed();
    }

    function renderPanelCollapsed() {
        if (!ui?.panel || !ui?.collapseToggle) {
            return;
        }

        const action = panelCollapsed ? '展开' : '收起';

        ui.panel.dataset.collapsed = panelCollapsed ? 'true' : 'false';
        ui.collapseToggle.textContent = panelCollapsed ? '＋' : '−';
        ui.collapseToggle.title = `${action}控制面板`;
        ui.collapseToggle.setAttribute(
            'aria-label',
            `${action}控制面板`,
        );
        ui.collapseToggle.setAttribute(
            'aria-expanded',
            panelCollapsed ? 'false' : 'true',
        );
    }

    function renderPushKeyHelp() {
        if (ui?.pushKeyHelp) {
            ui.pushKeyHelp.hidden = Boolean(pushKey);
        }
    }

    function renderNotificationSettings() {
        if (!ui?.notificationModeInputs?.length) {
            return;
        }

        for (const input of ui.notificationModeInputs) {
            input.checked = input.value === notificationMode;
        }

        const showBrowserSettings = notificationMode === 'browser';

        ui.serverNotificationSettings.hidden = showBrowserSettings;
        ui.browserNotificationSettings.hidden = !showBrowserSettings;
        renderPushKeyHelp();

        if (!showBrowserSettings) {
            return;
        }

        const supported = typeof window.Notification === 'function';
        const permission = supported
            ? window.Notification.permission
            : 'unsupported';
        const permissionLabels = {
            granted: '已授权',
            denied: '已拒绝',
            default: '未授权',
            unsupported: '当前浏览器不支持',
        };

        ui.browserNotificationPermission.textContent =
            permissionLabels[permission] ?? '未知';
        ui.browserNotificationPermissionButton.disabled =
            permission === 'granted' ||
            permission === 'denied' ||
            permission === 'unsupported';
        ui.browserNotificationPermissionButton.textContent =
            permission === 'granted'
                ? '浏览器通知已授权'
                : permission === 'denied'
                    ? '请在浏览器设置中重新授权'
                    : permission === 'unsupported'
                        ? '当前浏览器不支持通知'
                        : '授权浏览器通知';
    }

    function renderScheduleStatus(remaining = null) {
        if (!ui?.scheduleStatus) {
            return;
        }

        if (!scheduleSettings.enabled) {
            ui.scheduleStatus.textContent = '未启用';
            return;
        }

        if (scheduleEndsAt === 0 || scheduleDuration === 0) {
            ui.scheduleStatus.textContent = enabled
                ? '等待开始本轮运行'
                : '脚本启动后开始';
            return;
        }

        if (schedulePhase === 'rest') {
            const restRemaining = remaining ?? scheduleEndsAt - Date.now();

            ui.scheduleStatus.textContent =
                `休息中，剩余 ${formatScheduleDuration(restRemaining)}`;
            return;
        }

        ui.scheduleStatus.textContent =
            `本轮运行 ${formatScheduleDuration(scheduleDuration)}`;
    }

    function renderScheduleSettings() {
        if (!ui?.scheduleEnabledToggle) {
            return;
        }

        ui.scheduleEnabledToggle.checked = scheduleSettings.enabled;
        ui.scheduleEnabledToggle.setAttribute(
            'aria-checked',
            scheduleSettings.enabled ? 'true' : 'false',
        );
        ui.scheduleSettings.hidden = !scheduleSettings.enabled;
        ui.scheduleWorkMinutes.value = String(
            scheduleSettings.workMinutes,
        );
        ui.scheduleRestMinutes.value = String(
            scheduleSettings.restMinutes,
        );
        renderScheduleStatus();
    }

    function renderToggle() {
        if (!ui?.toggle) {
            return;
        }

        ui.toggle.textContent = enabled ? '停止' : '启动';
        ui.toggle.dataset.enabled = enabled ? 'true' : 'false';
    }

    function renderCaptchaBypassToggle() {
        if (!ui?.captchaBypassToggle) {
            return;
        }

        ui.captchaBypassToggle.checked = captchaBypassEnabled;
        ui.captchaBypassToggle.setAttribute(
            'aria-checked',
            captchaBypassEnabled ? 'true' : 'false',
        );
    }

    /**
     * 快捷键 Alt + A。
     */
    document.addEventListener(
        'keydown',
        event => {
            const target = event.target;

            const isTyping =
                target instanceof HTMLElement &&
                (
                    target.isContentEditable ||
                    target.matches('input, textarea, select')
                );

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

    installFetchInterceptor();
    createPanel();

    // 第一次安装默认关闭；之后恢复上次保存的状态
    setEnabled(enabled);

    console.info(
        '[自动抛竿] 脚本已加载，使用右下角按钮或 Alt + A 控制。',
    );
})();
