// ==UserScript==
// @name         Arcane Angler 自动抛竿
// @namespace    arcane-angler-auto-cast
// @version      1.8.1
// @author       Codex
// @description  自动点击“抛竿线”按钮，带随机等待和启停控制
// @downloadURL  https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js
// @updateURL    https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js
// @match        https://arcaneangler.com/*
// @match        https://www.arcaneangler.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* 此文件由 pnpm build 自动生成，请修改 arcaneangler/src 下的源码。 */
/**
 * 免责声明：
 * 本脚本仅供学习与个人研究使用。使用者应自行遵守目标网站的服务条款、
 * 使用规则及所在地法律法规。因使用本脚本产生的账号限制、数据损失或
 * 其他直接、间接后果，均由使用者自行承担，脚本作者不承担相关责任。
 */

(function() {
	"use strict";
	var CONFIG = {
		buttonText: "抛竿线",
		normalDelayMin: 500,
		normalDelayMax: 2e3,
		longDelayMin: 5e3,
		longDelayMax: 1e4,
		longDelayChance: .08,
		buttonPollInterval: 250,
		mouseDownMin: 35,
		mouseDownMax: 90,
		captchaObserveDelayMin: 2200,
		captchaObserveDelayMax: 4200,
		captchaDragDelayMin: 900,
		captchaDragDelayMax: 1800,
		captchaConfirmDelayMin: 1400,
		captchaConfirmDelayMax: 2600,
		scheduleRandomExtraRatioMin: -.05,
		scheduleRandomExtraRatioMax: .1
	};
	var STORAGE_KEY = "arcane-angler-auto-cast-enabled-v1";
	var CAPTCHA_BYPASS_STORAGE_KEY = "arcane-angler-captcha-bypass-enabled-v1";
	var PUSH_KEY_STORAGE_KEY = "arcane-angler-push-key-v1";
	var NOTIFICATION_MODE_STORAGE_KEY = "arcane-angler-notification-mode-v1";
	var SCHEDULE_SETTINGS_STORAGE_KEY = "arcane-angler-schedule-settings-v1";
	var PANEL_COLLAPSED_STORAGE_KEY = "arcane-angler-panel-collapsed-v1";
	var EARNINGS_STORAGE_KEY = "arcane-angler-earnings-v1";
	var PANEL_ID = "arcane-angler-auto-cast-panel-host";
	var HUMAN_VERIFICATION_MESSAGE = "Arcane Angler 出现验证码了，自动抛竿已停止";
	var EARNINGS_CATEGORY_DISPLAY = {
		unknown: {
			label: "未知",
			tone: "unknown"
		},
		common: {
			label: "普通",
			tone: "common"
		},
		uncommon: {
			label: "罕见",
			tone: "uncommon"
		},
		fine: {
			label: "精良",
			tone: "fine"
		},
		rare: {
			label: "稀有",
			tone: "rare"
		},
		epic: {
			label: "史诗",
			tone: "epic"
		},
		legendary: {
			label: "传说",
			tone: "legendary"
		},
		mythic: {
			label: "神话",
			tone: "mythic"
		},
		exotic: {
			label: "奇异",
			tone: "exotic"
		},
		arcane: {
			label: "奥术",
			tone: "arcane"
		},
		relic: {
			label: "遗物",
			tone: "relic"
		},
		"treasure chest": {
			label: "宝箱",
			tone: "treasure"
		},
		gears: {
			label: "装备",
			tone: "gear"
		}
	};
	function normalizeText(text) {
		return String(text ?? "").replace(/\s+/g, " ").trim();
	}
	function isVisible(element) {
		if (!(element instanceof HTMLElement)) return false;
		const style = window.getComputedStyle(element);
		const rect = element.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && Number.parseFloat(style.opacity || "1") > 0;
	}
	function isDisplayed(element) {
		return isVisible(element) && window.getComputedStyle(element).pointerEvents !== "none";
	}
	function randomInt(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
	function sleep(milliseconds) {
		return new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}
	function createCaptchaController({ getState, notify, setEnabled, setNextDelay, setStatus }) {
		let activeCaptchaChallenge = null;
		let captchaBypassAttemptId = 0;
		let captchaBypassInProgress = false;
		function findHumanVerification() {
			const headings = document.querySelectorAll("h1, h2, h3, h4, [role=\"heading\"]");
			for (const heading of headings) if (normalizeText(heading.textContent).includes("人机验证") && isVisible(heading)) return heading;
			return null;
		}
		function closeHumanVerification(verification) {
			const fiberKey = Object.keys(verification).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
			let fiber = fiberKey ? verification[fiberKey] : null;
			while (fiber) {
				const props = fiber.memoizedProps;
				if (props?.isOpen === true && typeof props.onClose === "function") {
					props.onClose();
					return true;
				}
				fiber = fiber.return;
			}
			return false;
		}
		async function waitForCaptchaStep(minDelay, maxDelay, status, nextAction, isAttemptActive) {
			const endTime = Date.now() + randomInt(minDelay, maxDelay);
			while (isAttemptActive()) {
				const remaining = endTime - Date.now();
				if (remaining <= 0) return true;
				setStatus(status);
				setNextDelay(`${(remaining / 1e3).toFixed(1)} 秒后${nextAction}`);
				await sleep(Math.min(100, remaining));
			}
			return false;
		}
		async function waitForHumanVerificationToClose(isAttemptActive) {
			const deadline = Date.now() + 1500;
			while (findHumanVerification()) {
				if (!isAttemptActive()) return false;
				if (Date.now() >= deadline) throw new Error("人机验证弹窗关闭超时");
				await sleep(50);
			}
			return true;
		}
		function parseSvgNumber(value, fieldName) {
			const number = Number.parseFloat(value);
			if (!Number.isFinite(number)) throw new Error(`无法读取验证码的 ${fieldName}`);
			return number;
		}
		function readExposedCaptchaAnswer(source) {
			if (typeof source !== "string" || !source.includes("<svg")) throw new Error("服务端未返回有效的验证码 SVG");
			const svg = new DOMParser().parseFromString(source, "image/svg+xml");
			if (svg.querySelector("parsererror")) throw new Error("验证码背景 SVG 解析失败");
			const root = svg.documentElement;
			const gap = Array.from(svg.querySelectorAll("rect")).find((rect) => rect.hasAttribute("stroke-dasharray"));
			if (!gap) throw new Error("未找到验证码缺口标记");
			const viewBox = root.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
			const canvasWidth = viewBox?.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : parseSvgNumber(root.getAttribute("width"), "画布宽度");
			const gapX = parseSvgNumber(gap.getAttribute("x"), "缺口横坐标");
			const gapWidth = parseSvgNumber(gap.getAttribute("width"), "拼图宽度");
			const travelWidth = canvasWidth - gapWidth;
			if (travelWidth <= 0 || gapX < 0 || gapX > travelWidth) throw new Error("验证码缺口坐标超出可移动范围");
			return {
				canvasWidth,
				gapX,
				gapWidth,
				ratio: gapX / travelWidth
			};
		}
		async function runCaptchaBypass(challenge, isAttemptActive) {
			const api = window.ApiService;
			if (typeof api?.notifyCaptchaVerified !== "function") throw new Error("页面验证码 API 不可用");
			if (!isAttemptActive()) return false;
			if (!challenge?.token || typeof challenge.bgSvg !== "string") throw new Error("验证码 challenge 数据不完整");
			const answer = readExposedCaptchaAnswer(challenge.bgSvg);
			const rangeValue = Math.round(answer.ratio * 100);
			console.warn("[自动过验证] 客户端已暴露验证码答案：", {
				...answer,
				rangeValue
			});
			if (!await waitForCaptchaStep(CONFIG.captchaObserveDelayMin, CONFIG.captchaObserveDelayMax, "正在观察验证题面", "操作滑块", isAttemptActive)) return false;
			if (!await waitForCaptchaStep(CONFIG.captchaDragDelayMin, CONFIG.captchaDragDelayMax, "正在模拟滑块操作", "提交验证", isAttemptActive)) return false;
			await api.notifyCaptchaVerified(challenge.token, String(rangeValue));
			if (activeCaptchaChallenge?.token === challenge.token) activeCaptchaChallenge = null;
			if (!isAttemptActive()) return false;
			const verifiedAt = Date.now();
			const nextInterval = randomInt(9e5, 12e5);
			localStorage.setItem("fishingCaptchaLastVerified", String(verifiedAt));
			localStorage.setItem("fishingCaptchaInterval", String(nextInterval));
			console.warn("[自动过验证] 服务端接受了由客户端题面计算出的答案。");
			if (!await waitForCaptchaStep(CONFIG.captchaConfirmDelayMin, CONFIG.captchaConfirmDelayMax, "验证通过，等待页面确认", "关闭验证弹窗", isAttemptActive)) return false;
			const verification = findHumanVerification();
			if (verification && !closeHumanVerification(verification)) throw new Error("无法关闭人机验证弹窗");
			if (!await waitForHumanVerificationToClose(isAttemptActive)) return false;
			setStatus("人机验证已完成，正在恢复自动抛竿");
			setNextDelay("—");
			return true;
		}
		function cancelCaptchaBypass() {
			captchaBypassAttemptId += 1;
			captchaBypassInProgress = false;
		}
		function stopForHumanVerification() {
			setEnabled(false);
			setStatus("检测到人机验证，已停止");
			setNextDelay("请手动完成验证");
			console.warn("[自动抛竿] 检测到人机验证，自动操作已停止。");
			notify();
		}
		async function autoBypassCaptcha(challenge) {
			const { captchaBypassEnabled } = getState();
			if (!captchaBypassEnabled || captchaBypassInProgress) return;
			const attemptId = captchaBypassAttemptId + 1;
			captchaBypassAttemptId = attemptId;
			captchaBypassInProgress = true;
			let bypassSucceeded = false;
			console.warn("[自动抛竿] 捕获到验证码 challenge，尝试自动验证。");
			try {
				bypassSucceeded = await runCaptchaBypass(challenge, () => {
					const state = getState();
					return state.enabled && state.captchaBypassEnabled && attemptId === captchaBypassAttemptId;
				});
			} catch (error) {
				const state = getState();
				if (!state.enabled || !state.captchaBypassEnabled || attemptId !== captchaBypassAttemptId) return;
				if (activeCaptchaChallenge?.token === challenge?.token) activeCaptchaChallenge = null;
				setEnabled(false);
				setStatus("人机验证绕过失败，已停止");
				setNextDelay("请手动完成验证");
				console.warn("[自动抛竿] 人机验证自动绕过失败：", error);
				notify();
			} finally {
				if (attemptId === captchaBypassAttemptId) captchaBypassInProgress = false;
			}
			const state = getState();
			if (bypassSucceeded && state.enabled && state.captchaBypassEnabled && attemptId === captchaBypassAttemptId) setEnabled(true);
		}
		function stopIfCaptchaChallengeFound() {
			if (!activeCaptchaChallenge) return false;
			if (getState().captchaBypassEnabled) autoBypassCaptcha(activeCaptchaChallenge);
			else stopForHumanVerification();
			return true;
		}
		function handleChallenge(challenge) {
			activeCaptchaChallenge = challenge;
			const state = getState();
			if (!state.enabled) return;
			if (state.captchaBypassEnabled) autoBypassCaptcha(challenge);
			else stopForHumanVerification();
		}
		function handleBypassSettingChanged() {
			const state = getState();
			if (!state.captchaBypassEnabled) cancelCaptchaBypass();
			if (!state.enabled || !activeCaptchaChallenge) return;
			if (state.captchaBypassEnabled) autoBypassCaptcha(activeCaptchaChallenge);
			else stopForHumanVerification();
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
			stopIfChallengeFound: stopIfCaptchaChallengeFound
		};
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
			rarityCounts: {}
		};
	}
	function toNonNegativeNumber(value) {
		const number = Number(value);
		return Number.isFinite(number) && number > 0 ? number : 0;
	}
	function loadEarningsStats() {
		const emptyStats = createEmptyEarningsStats();
		try {
			const savedStats = JSON.parse(localStorage.getItem(EARNINGS_STORAGE_KEY));
			if (!savedStats || typeof savedStats !== "object") return emptyStats;
			return {
				...emptyStats,
				startedAt: toNonNegativeNumber(savedStats.startedAt) || emptyStats.startedAt,
				updatedAt: toNonNegativeNumber(savedStats.updatedAt) || null,
				casts: toNonNegativeNumber(savedStats.casts),
				fish: toNonNegativeNumber(savedStats.fish),
				gold: toNonNegativeNumber(savedStats.gold),
				xp: toNonNegativeNumber(savedStats.xp),
				relics: toNonNegativeNumber(savedStats.relics),
				treasureChests: toNonNegativeNumber(savedStats.treasureChests),
				gears: toNonNegativeNumber(savedStats.gears),
				rarityCounts: savedStats.rarityCounts && typeof savedStats.rarityCounts === "object" ? savedStats.rarityCounts : {}
			};
		} catch (error) {
			console.warn("[收益统计] 无法读取本地统计：", error);
			return emptyStats;
		}
	}
	function saveEarningsStats(earningsStats) {
		try {
			localStorage.setItem(EARNINGS_STORAGE_KEY, JSON.stringify(earningsStats));
		} catch (error) {
			console.warn("[收益统计] 无法保存本地统计：", error);
		}
	}
	function updateEarningsStats(earningsStats, result) {
		const rarity = String(result.rarity ?? "").trim();
		const count = Math.max(1, toNonNegativeNumber(result.count));
		const isTreasure = Boolean(result.treasureChest) || rarity === "Treasure Chest";
		const isRelic = rarity === "Relic";
		const isGear = rarity === "Gears" && Boolean(result.gear) && !result.inventoryFull;
		const isFish = Boolean(result.fish?.name) && !isTreasure && !isRelic && rarity !== "Gears";
		const gold = toNonNegativeNumber(result.goldGained);
		const xp = toNonNegativeNumber(result.xpGained);
		const relics = toNonNegativeNumber(result.relicsGained);
		const category = isTreasure ? "Treasure Chest" : isRelic ? "Relic" : rarity === "Gears" ? "Gears" : rarity || "Unknown";
		const earnedCount = isFish ? count : 1;
		return {
			...earningsStats,
			updatedAt: Date.now(),
			casts: earningsStats.casts + 1,
			fish: earningsStats.fish + (isFish ? count : 0),
			gold: earningsStats.gold + gold,
			xp: earningsStats.xp + xp,
			relics: earningsStats.relics + relics,
			treasureChests: earningsStats.treasureChests + (isTreasure ? 1 : 0),
			gears: earningsStats.gears + (isGear ? 1 : 0),
			rarityCounts: {
				...earningsStats.rarityCounts,
				[category]: toNonNegativeNumber(earningsStats.rarityCounts[category]) + earnedCount
			}
		};
	}
	function installFetchInterceptor({ onCaptchaChallenge, onCaptchaVerified, onCastResult }) {
		const originalFetch = window.fetch;
		window.fetch = async function(input, init) {
			const request = input instanceof Request ? input : null;
			const method = String(init?.method ?? request?.method ?? "GET").toUpperCase();
			let url = null;
			try {
				url = new URL(request?.url ?? String(input), window.location.href);
			} catch {}
			if (method === "POST" && url?.pathname === "/api/game/cast") {
				const modifiedRequest = await modifyCastRequest(input, request, init);
				const response = modifiedRequest ? await originalFetch.call(this, modifiedRequest.input, modifiedRequest.init) : await originalFetch.apply(this, arguments);
				try {
					collectCastResponse(response.clone(), onCastResult);
				} catch (error) {
					console.warn("[收益统计] 无法复制抛竿响应：", error);
				}
				return response;
			}
			const response = await originalFetch.apply(this, arguments);
			if (method === "GET" && url?.pathname === "/api/game/captcha-challenge") try {
				collectCaptchaChallengeResponse(response.clone(), onCaptchaChallenge);
			} catch (error) {
				console.warn("[自动过验证] 无法复制验证码 challenge 响应：", error);
			}
			else if (method === "POST" && url?.pathname === "/api/game/captcha-verified" && response.ok) onCaptchaVerified();
			return response;
		};
	}
	async function modifyCastRequest(input, request, init) {
		try {
			let body = init?.body;
			if (body === void 0 && request) body = await request.clone().text();
			const originalPayload = await normalizeRequestBody(body);
			if (!originalPayload || typeof originalPayload !== "object" || Array.isArray(originalPayload)) throw new TypeError("payload 不是可修改的对象");
			const payload = {
				...originalPayload,
				isTrusted: true
			};
			console.info("[自动抛竿] POST /api/game/cast payload:", payload);
			const modifiedBody = JSON.stringify(payload);
			if (init?.body !== void 0 || !request) return {
				input,
				init: {
					...init,
					body: modifiedBody
				}
			};
			return {
				input: new Request(request, { body: modifiedBody }),
				init
			};
		} catch (error) {
			console.warn("[自动抛竿] 无法修改 POST /api/game/cast payload，保留原请求：", error);
			return null;
		}
	}
	async function normalizeRequestBody(body) {
		if (body == null) return body;
		if (typeof body === "string") try {
			return JSON.parse(body);
		} catch {
			return body;
		}
		if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
		if (body instanceof FormData) return Object.fromEntries(body.entries());
		if (body instanceof Blob) return normalizeRequestBody(await body.text());
		return body;
	}
	async function collectCastResponse(response, onCastResult) {
		if (!response.ok) return;
		try {
			const payload = await response.json();
			if (payload?.success !== true || !payload.result || typeof payload.result !== "object") return;
			onCastResult(payload.result);
		} catch (error) {
			console.warn("[收益统计] 无法读取抛竿响应：", error);
		}
	}
	async function collectCaptchaChallengeResponse(response, onCaptchaChallenge) {
		if (!response.ok) return;
		try {
			const payload = await response.json();
			const challenge = payload?.result ?? payload;
			if (!challenge?.token || typeof challenge.bgSvg !== "string") return;
			onCaptchaChallenge(challenge);
		} catch (error) {
			console.warn("[自动过验证] 无法读取验证码 challenge 响应：", error);
		}
	}
	async function sendHumanVerificationNotification({ notificationMode, pushKey }) {
		if (notificationMode === "browser") {
			sendBrowserHumanVerificationNotification();
			return;
		}
		await sendServerHumanVerificationNotification(pushKey);
	}
	async function sendServerHumanVerificationNotification(pushKey) {
		const currentPushKey = pushKey.trim();
		if (!currentPushKey) {
			console.info("[自动抛竿] 未设置消息推送 Key，跳过验证码通知。可前往 https://sct.ftqq.com/ 获取 SendKey。");
			return;
		}
		const url = `https://sctapi.ftqq.com/${encodeURIComponent(currentPushKey)}.send?title=${encodeURIComponent(HUMAN_VERIFICATION_MESSAGE)}`;
		try {
			const response = await window.fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			console.info("[自动抛竿] 验证码通知已发送。");
		} catch (error) {
			console.warn("[自动抛竿] 验证码通知发送失败：", error);
		}
	}
	function sendBrowserHumanVerificationNotification() {
		if (typeof window.Notification !== "function") {
			console.warn("[自动抛竿] 当前浏览器不支持系统通知。");
			return;
		}
		if (window.Notification.permission !== "granted") {
			console.warn("[自动抛竿] 浏览器通知尚未授权，跳过验证码通知。");
			return;
		}
		try {
			const notification = new window.Notification("Arcane Angler 人机验证", {
				body: HUMAN_VERIFICATION_MESSAGE,
				tag: "arcane-angler-human-verification"
			});
			notification.onclick = () => {
				window.focus();
				notification.close();
			};
			console.info("[自动抛竿] 浏览器验证码通知已发送。");
		} catch (error) {
			console.warn("[自动抛竿] 浏览器验证码通知发送失败：", error);
		}
	}
	async function requestBrowserNotificationPermission$1() {
		if (typeof window.Notification !== "function") return;
		try {
			await window.Notification.requestPermission();
		} catch (error) {
			console.warn("[自动抛竿] 请求浏览器通知权限失败：", error);
		}
	}
	function formatScheduleDuration(milliseconds) {
		const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1e3));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		if (minutes === 0) return `${seconds} 秒`;
		return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
	}
	function createScheduleController({ getCaptcha, getState, renderSettings, renderStatus, setNextDelay, setStatus }) {
		let phase = "work";
		let endsAt = 0;
		let duration = 0;
		function getRandomizedDuration(baseMinutes) {
			const extraRatio = CONFIG.scheduleRandomExtraRatioMin + Math.random() * (CONFIG.scheduleRandomExtraRatioMax - CONFIG.scheduleRandomExtraRatioMin);
			return Math.round(baseMinutes * (1 + extraRatio) * 6e4);
		}
		function reset() {
			phase = "work";
			endsAt = 0;
			duration = 0;
			renderSettings();
		}
		function startPhase(nextPhase) {
			const { scheduleSettings } = getState();
			const baseMinutes = nextPhase === "rest" ? scheduleSettings.restMinutes : scheduleSettings.workMinutes;
			phase = nextPhase;
			duration = getRandomizedDuration(baseMinutes);
			endsAt = Date.now() + duration;
			renderSettings();
			console.info(`[自动抛竿] 本轮${nextPhase === "rest" ? "休息" : "运行"}时长：` + formatScheduleDuration(duration));
		}
		function isWorkExpired() {
			const { scheduleSettings } = getState();
			return scheduleSettings.enabled && phase === "work" && endsAt > 0 && Date.now() >= endsAt;
		}
		function shouldEnterRest(currentLoopId) {
			const { enabled, loopId } = getState();
			const captcha = getCaptcha();
			return enabled && currentLoopId === loopId && !captcha.isBypassInProgress() && !captcha.hasActiveChallenge() && isWorkExpired();
		}
		async function waitForWork(currentLoopId) {
			if (!getState().scheduleSettings.enabled) return true;
			if (endsAt === 0) startPhase("work");
			while (true) {
				const { enabled, loopId, scheduleSettings } = getState();
				if (!enabled || currentLoopId !== loopId) return false;
				if (!scheduleSettings.enabled) {
					reset();
					return true;
				}
				if (phase === "work") {
					if (!isWorkExpired()) return true;
					startPhase("rest");
				}
				if (getCaptcha().stopIfChallengeFound()) return false;
				const remaining = endsAt - Date.now();
				if (remaining <= 0) {
					startPhase("work");
					return true;
				}
				setStatus("定时休息中");
				setNextDelay(`剩余 ${formatScheduleDuration(remaining)}`);
				renderStatus(remaining);
				await sleep(Math.min(1e3, remaining));
			}
		}
		return {
			getSnapshot() {
				return {
					scheduleDuration: duration,
					scheduleEndsAt: endsAt,
					schedulePhase: phase
				};
			},
			isWorkExpired,
			reset,
			shouldEnterRest,
			startWork() {
				startPhase("work");
			},
			waitForWork
		};
	}
	function loadEnabled() {
		try {
			return localStorage.getItem(STORAGE_KEY) === "1";
		} catch {
			return false;
		}
	}
	function saveEnabled(value) {
		try {
			localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
		} catch (error) {
			console.warn("[自动抛竿] 无法保存设置：", error);
		}
	}
	function loadCaptchaBypassEnabled() {
		try {
			const savedValue = localStorage.getItem(CAPTCHA_BYPASS_STORAGE_KEY);
			return savedValue === null ? true : savedValue === "1";
		} catch {
			return true;
		}
	}
	function saveCaptchaBypassEnabled(value) {
		try {
			localStorage.setItem(CAPTCHA_BYPASS_STORAGE_KEY, value ? "1" : "0");
		} catch (error) {
			console.warn("[自动抛竿] 无法保存自动过验证设置：", error);
		}
	}
	function loadPushKey() {
		try {
			return localStorage.getItem("arcane-angler-push-key-v1")?.trim() ?? "";
		} catch {
			return "";
		}
	}
	function savePushKey(value) {
		try {
			if (value) localStorage.setItem(PUSH_KEY_STORAGE_KEY, value);
			else localStorage.removeItem(PUSH_KEY_STORAGE_KEY);
		} catch (error) {
			console.warn("[自动抛竿] 无法保存消息推送 Key：", error);
		}
	}
	function loadNotificationMode() {
		try {
			return localStorage.getItem("arcane-angler-notification-mode-v1") === "browser" ? "browser" : "server";
		} catch {
			return "server";
		}
	}
	function saveNotificationMode(value) {
		try {
			localStorage.setItem(NOTIFICATION_MODE_STORAGE_KEY, value);
		} catch (error) {
			console.warn("[自动抛竿] 无法保存通知方式：", error);
		}
	}
	function normalizeScheduleMinutes(value, fallback) {
		const minutes = Number(value);
		if (!Number.isFinite(minutes) || minutes < 1) return fallback;
		return Math.min(1440, Math.round(minutes));
	}
	function loadScheduleSettings() {
		const defaults = {
			enabled: false,
			workMinutes: 60,
			restMinutes: 10
		};
		try {
			const savedSettings = JSON.parse(localStorage.getItem(SCHEDULE_SETTINGS_STORAGE_KEY));
			if (!savedSettings || typeof savedSettings !== "object") return defaults;
			return {
				enabled: savedSettings.enabled === true,
				workMinutes: normalizeScheduleMinutes(savedSettings.workMinutes, defaults.workMinutes),
				restMinutes: normalizeScheduleMinutes(savedSettings.restMinutes, defaults.restMinutes)
			};
		} catch (error) {
			console.warn("[自动抛竿] 无法读取定时休息设置：", error);
			return defaults;
		}
	}
	function saveScheduleSettings(scheduleSettings) {
		try {
			localStorage.setItem(SCHEDULE_SETTINGS_STORAGE_KEY, JSON.stringify(scheduleSettings));
		} catch (error) {
			console.warn("[自动抛竿] 无法保存定时休息设置：", error);
		}
	}
	function loadPanelCollapsed() {
		const collapseByDefault = window.matchMedia("(max-width: 767px)").matches;
		try {
			const savedValue = localStorage.getItem(PANEL_COLLAPSED_STORAGE_KEY);
			return savedValue === null ? collapseByDefault : savedValue === "1";
		} catch {
			return collapseByDefault;
		}
	}
	function savePanelCollapsed(value) {
		try {
			localStorage.setItem(PANEL_COLLAPSED_STORAGE_KEY, value ? "1" : "0");
		} catch (error) {
			console.warn("[自动抛竿] 无法保存面板折叠状态：", error);
		}
	}
	var panel_default = "* {\n    box-sizing: border-box;\n}\n\n.panel {\n    width: 250px;\n    max-width: calc(100vw - 32px);\n    padding: 14px;\n    border: 1px solid rgba(255, 255, 255, 0.18);\n    border-radius: 12px;\n    background: rgba(18, 18, 24, 0.94);\n    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.42);\n    color: #ffffff;\n    backdrop-filter: blur(12px);\n}\n\n.panel[data-collapsed='true'] {\n    width: auto;\n    padding: 7px;\n}\n\n.panel[data-collapsed='true'] .panel-content,\n.panel[data-collapsed='true'] .title-text {\n    display: none;\n}\n\n.header {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    gap: 10px;\n}\n\n.title {\n    display: flex;\n    align-items: center;\n    gap: 5px;\n    font-size: 15px;\n    font-weight: 700;\n}\n\n.collapse-toggle {\n    display: inline-flex;\n    align-items: center;\n    justify-content: center;\n    width: 26px;\n    height: 26px;\n    flex-shrink: 0;\n    padding: 0;\n    border: 1px solid rgba(255, 255, 255, 0.16);\n    border-radius: 7px;\n    background: rgba(255, 255, 255, 0.08);\n    color: rgba(255, 255, 255, 0.88);\n    font-size: 16px;\n    line-height: 1;\n    cursor: pointer;\n}\n\n.collapse-toggle:hover {\n    background: rgba(255, 255, 255, 0.14);\n}\n\n.panel-content {\n    margin-top: 10px;\n}\n\n.tabs {\n    display: grid;\n    grid-template-columns: repeat(3, minmax(0, 1fr));\n    gap: 4px;\n    margin-bottom: 10px;\n    padding: 3px;\n    border-radius: 8px;\n    background: rgba(255, 255, 255, 0.07);\n}\n\n.panel-tab {\n    padding: 6px 8px;\n    border: 0;\n    border-radius: 6px;\n    background: transparent;\n    color: rgba(255, 255, 255, 0.56);\n    font-size: 12px;\n    font-weight: 700;\n    cursor: pointer;\n}\n\n.panel-tab[data-active='true'] {\n    background: #6d5dfc;\n    color: #ffffff;\n}\n\n.panel-view[hidden] {\n    display: none;\n}\n\n.row {\n    display: flex;\n    justify-content: space-between;\n    gap: 10px;\n    margin-top: 7px;\n    font-size: 12px;\n    line-height: 1.4;\n}\n\n.label {\n    flex-shrink: 0;\n    color: rgba(255, 255, 255, 0.58);\n}\n\n.value {\n    min-width: 0;\n    overflow-wrap: anywhere;\n    text-align: right;\n    color: rgba(255, 255, 255, 0.92);\n}\n\n.field {\n    display: block;\n    margin-top: 12px;\n}\n\n.field-label {\n    display: block;\n    margin-bottom: 5px;\n    color: rgba(255, 255, 255, 0.58);\n    font-size: 12px;\n}\n\n.input {\n    width: 100%;\n    padding: 8px 9px;\n    border: 1px solid rgba(255, 255, 255, 0.18);\n    border-radius: 7px;\n    outline: none;\n    background: rgba(255, 255, 255, 0.08);\n    color: rgba(255, 255, 255, 0.92);\n    font-size: 12px;\n}\n\n.input:focus {\n    border-color: #6d5dfc;\n}\n\n.input::placeholder {\n    color: rgba(255, 255, 255, 0.32);\n}\n\n.field-help {\n    margin-top: 6px;\n    color: rgba(255, 255, 255, 0.5);\n    font-size: 11px;\n    line-height: 1.45;\n}\n\n.field-help[hidden] {\n    display: none;\n}\n\n.field-help a {\n    color: #9ea5ff;\n    text-decoration: underline;\n}\n\n.settings-section + .settings-section {\n    margin-top: 14px;\n    padding-top: 14px;\n    border-top: 1px solid rgba(255, 255, 255, 0.1);\n}\n\n.settings-title {\n    color: rgba(255, 255, 255, 0.88);\n    font-size: 12px;\n    font-weight: 700;\n}\n\n.choice-list {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 6px;\n    margin-top: 8px;\n}\n\n.choice-option {\n    display: flex;\n    align-items: center;\n    gap: 6px;\n    padding: 7px 8px;\n    border: 1px solid rgba(255, 255, 255, 0.12);\n    border-radius: 7px;\n    color: rgba(255, 255, 255, 0.78);\n    font-size: 11px;\n    cursor: pointer;\n}\n\n.choice-option:has(input:checked) {\n    border-color: rgba(109, 93, 252, 0.72);\n    background: rgba(109, 93, 252, 0.14);\n    color: #ffffff;\n}\n\n.choice-option input {\n    margin: 0;\n    accent-color: #6d5dfc;\n}\n\n.settings-group[hidden] {\n    display: none;\n}\n\n.number-grid {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 8px;\n}\n\n.secondary-button {\n    width: 100%;\n    margin-top: 9px;\n    padding: 7px 10px;\n    border: 1px solid rgba(109, 93, 252, 0.55);\n    border-radius: 7px;\n    background: rgba(109, 93, 252, 0.12);\n    color: #b9b5ff;\n    font-size: 11px;\n    font-weight: 700;\n    cursor: pointer;\n}\n\n.secondary-button:hover {\n    background: rgba(109, 93, 252, 0.22);\n}\n\n.secondary-button:disabled {\n    cursor: default;\n    opacity: 0.48;\n}\n\n.toggle {\n    width: 100%;\n    margin-top: 12px;\n    padding: 9px 12px;\n    border: 0;\n    border-radius: 8px;\n    background: #6d5dfc;\n    color: #ffffff;\n    font-size: 13px;\n    font-weight: 700;\n    cursor: pointer;\n}\n\n.toggle:hover {\n    filter: brightness(1.08);\n}\n\n.toggle[data-enabled='true'] {\n    background: #d34848;\n}\n\n.option-row {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    gap: 10px;\n    margin-top: 10px;\n    color: rgba(255, 255, 255, 0.88);\n    font-size: 12px;\n    cursor: pointer;\n}\n\n.switch {\n    position: relative;\n    width: 38px;\n    height: 22px;\n    flex-shrink: 0;\n}\n\n.switch input {\n    position: absolute;\n    width: 1px;\n    height: 1px;\n    opacity: 0;\n}\n\n.switch-track {\n    display: block;\n    width: 100%;\n    height: 100%;\n    border-radius: 999px;\n    background: rgba(255, 255, 255, 0.2);\n    transition: background 0.15s ease;\n}\n\n.switch-track::after {\n    position: absolute;\n    top: 3px;\n    left: 3px;\n    width: 16px;\n    height: 16px;\n    border-radius: 50%;\n    background: #ffffff;\n    content: '';\n    transition: transform 0.15s ease;\n}\n\n.switch input:checked + .switch-track {\n    background: #6d5dfc;\n}\n\n.switch input:checked + .switch-track::after {\n    transform: translateX(16px);\n}\n\n.switch input:focus-visible + .switch-track {\n    outline: 2px solid #9ea5ff;\n    outline-offset: 2px;\n}\n\n.hint {\n    margin-top: 9px;\n    text-align: center;\n    color: rgba(255, 255, 255, 0.42);\n    font-size: 11px;\n}\n\n.stats-start {\n    margin-bottom: 9px;\n    color: rgba(255, 255, 255, 0.48);\n    font-size: 10px;\n    text-align: center;\n}\n\n.stats-grid {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 6px;\n}\n\n.stat-card {\n    min-width: 0;\n    padding: 8px;\n    border: 1px solid rgba(255, 255, 255, 0.1);\n    border-radius: 8px;\n    background: rgba(255, 255, 255, 0.055);\n}\n\n.stat-card-label {\n    display: block;\n    margin-bottom: 3px;\n    color: rgba(255, 255, 255, 0.5);\n    font-size: 10px;\n}\n\n.stat-card-value {\n    display: block;\n    overflow: hidden;\n    color: rgba(255, 255, 255, 0.94);\n    font-size: 13px;\n    line-height: 1.25;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n}\n\n.stats-section-title {\n    margin: 12px 0 6px;\n    color: rgba(255, 255, 255, 0.62);\n    font-size: 11px;\n    font-weight: 700;\n}\n\n.stats-list {\n    display: flex;\n    flex-wrap: wrap;\n    gap: 5px;\n}\n\n.stat-chip {\n    max-width: 100%;\n    overflow: hidden;\n    padding: 4px 6px;\n    border-radius: 6px;\n    background: rgba(109, 93, 252, 0.16);\n    color: #d8d8df;\n    font-size: 10px;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n}\n\n.stat-chip[data-tone='uncommon'] {\n    background: rgba(132, 204, 22, 0.14);\n    color: #84cc16;\n}\n\n.stat-chip[data-tone='common'] {\n    background: rgba(156, 163, 175, 0.14);\n    color: #9ca3af;\n}\n\n.stat-chip[data-tone='fine'] {\n    background: rgba(59, 130, 246, 0.14);\n    color: #3b82f6;\n}\n\n.stat-chip[data-tone='rare'] {\n    background: rgba(168, 85, 247, 0.14);\n    color: #a855f7;\n}\n\n.stat-chip[data-tone='epic'] {\n    background: rgba(236, 72, 153, 0.14);\n    color: #ec4899;\n}\n\n.stat-chip[data-tone='legendary'] {\n    background: rgba(245, 158, 11, 0.14);\n    color: #f59e0b;\n}\n\n.stat-chip[data-tone='mythic'] {\n    background: rgba(239, 68, 68, 0.14);\n    color: #ef4444;\n}\n\n.stat-chip[data-tone='exotic'] {\n    background: rgba(6, 182, 212, 0.14);\n    color: #06b6d4;\n}\n\n.stat-chip[data-tone='arcane'] {\n    background: rgba(168, 85, 247, 0.14);\n    color: #a855f7;\n}\n\n.stat-chip[data-tone='relic'],\n.stat-chip[data-tone='treasure'] {\n    background: rgba(242, 204, 96, 0.14);\n    color: #f2cc60;\n}\n\n.stat-chip[data-tone='gear'] {\n    background: rgba(86, 212, 221, 0.14);\n    color: #7ce7ee;\n}\n\n.empty-stat {\n    color: rgba(255, 255, 255, 0.42);\n    font-size: 10px;\n    line-height: 1.45;\n}\n\n.reset-stats {\n    width: 100%;\n    margin-top: 12px;\n    padding: 7px 10px;\n    border: 1px solid rgba(211, 72, 72, 0.52);\n    border-radius: 7px;\n    background: rgba(211, 72, 72, 0.12);\n    color: #ff9d9d;\n    font-size: 11px;\n    font-weight: 700;\n    cursor: pointer;\n}\n\n.reset-stats:hover {\n    background: rgba(211, 72, 72, 0.22);\n}\n";
	function createPanelController({ actions, formatScheduleDuration, getState }) {
		let panelCollapsed = loadPanelCollapsed();
		let panelView = "control";
		let ui = null;
		const { requestBrowserNotificationPermission, resetEarningsStats, setCaptchaBypassEnabled, setEnabled, setNotificationMode, setPushKey, setScheduleEnabled, setScheduleMinutes } = actions;
		function normalizeText(text) {
			return String(text ?? "").replace(/\s+/g, " ").trim();
		}
		function toNonNegativeNumber(value) {
			const number = Number(value);
			return Number.isFinite(number) && number > 0 ? number : 0;
		}
		function createPanel() {
			if (document.getElementById("arcane-angler-auto-cast-panel-host")) return;
			const host = document.createElement("div");
			host.id = PANEL_ID;
			host.style.cssText = [
				"position: fixed",
				"right: 16px",
				"bottom: 16px",
				"z-index: 2147483647",
				"font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
			].join(";");
			const shadowRoot = host.attachShadow({ mode: "open" });
			shadowRoot.innerHTML = `
  <style>${panel_default}</style>

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
				panel: shadowRoot.querySelector(".panel"),
				status: shadowRoot.querySelector("#status"),
				nextDelay: shadowRoot.querySelector("#next-delay"),
				clickCount: shadowRoot.querySelector("#click-count"),
				pushKeyInput: shadowRoot.querySelector("#push-key"),
				pushKeyHelp: shadowRoot.querySelector("#push-key-help"),
				captchaBypassToggle: shadowRoot.querySelector("#captcha-bypass-toggle"),
				controlTab: shadowRoot.querySelector("#control-tab"),
				earningsTab: shadowRoot.querySelector("#earnings-tab"),
				settingsTab: shadowRoot.querySelector("#settings-tab"),
				controlView: shadowRoot.querySelector("#control-view"),
				earningsView: shadowRoot.querySelector("#earnings-view"),
				settingsView: shadowRoot.querySelector("#settings-view"),
				notificationModeInputs: shadowRoot.querySelectorAll("input[name=\"notification-mode\"]"),
				serverNotificationSettings: shadowRoot.querySelector("#server-notification-settings"),
				browserNotificationSettings: shadowRoot.querySelector("#browser-notification-settings"),
				browserNotificationPermission: shadowRoot.querySelector("#browser-notification-permission"),
				browserNotificationPermissionButton: shadowRoot.querySelector("#browser-notification-permission-button"),
				scheduleEnabledToggle: shadowRoot.querySelector("#schedule-enabled-toggle"),
				scheduleSettings: shadowRoot.querySelector("#schedule-settings"),
				scheduleWorkMinutes: shadowRoot.querySelector("#schedule-work-minutes"),
				scheduleRestMinutes: shadowRoot.querySelector("#schedule-rest-minutes"),
				scheduleStatus: shadowRoot.querySelector("#schedule-status"),
				statsStart: shadowRoot.querySelector("#stats-start"),
				statsCasts: shadowRoot.querySelector("#stats-casts"),
				statsFish: shadowRoot.querySelector("#stats-fish"),
				statsGold: shadowRoot.querySelector("#stats-gold"),
				statsXp: shadowRoot.querySelector("#stats-xp"),
				statsRelics: shadowRoot.querySelector("#stats-relics"),
				statsTreasures: shadowRoot.querySelector("#stats-treasures"),
				statsGears: shadowRoot.querySelector("#stats-gears"),
				statsGoldAverage: shadowRoot.querySelector("#stats-gold-average"),
				rarityStats: shadowRoot.querySelector("#rarity-stats"),
				resetStats: shadowRoot.querySelector("#reset-stats"),
				collapseToggle: shadowRoot.querySelector("#collapse-toggle"),
				toggle: shadowRoot.querySelector("#toggle")
			};
			ui.pushKeyInput.value = getState().pushKey;
			ui.pushKeyInput.addEventListener("input", (event) => {
				setPushKey(event.currentTarget.value);
				renderPushKeyHelp();
			});
			ui.collapseToggle.addEventListener("click", () => {
				setPanelCollapsed(!panelCollapsed);
			});
			ui.toggle.addEventListener("click", () => {
				setEnabled(!getState().enabled);
			});
			ui.captchaBypassToggle.addEventListener("change", (event) => {
				setCaptchaBypassEnabled(event.currentTarget.checked);
			});
			ui.controlTab.addEventListener("click", () => {
				setPanelView("control");
			});
			ui.earningsTab.addEventListener("click", () => {
				setPanelView("earnings");
			});
			ui.settingsTab.addEventListener("click", () => {
				setPanelView("settings");
			});
			for (const input of ui.notificationModeInputs) input.addEventListener("change", (event) => {
				if (event.currentTarget.checked) setNotificationMode(event.currentTarget.value);
			});
			ui.browserNotificationPermissionButton.addEventListener("click", () => {
				requestBrowserNotificationPermission();
			});
			ui.scheduleEnabledToggle.addEventListener("change", (event) => {
				setScheduleEnabled(event.currentTarget.checked);
			});
			ui.scheduleWorkMinutes.addEventListener("change", (event) => {
				setScheduleMinutes("workMinutes", event.currentTarget.value);
			});
			ui.scheduleRestMinutes.addEventListener("change", (event) => {
				setScheduleMinutes("restMinutes", event.currentTarget.value);
			});
			ui.resetStats.addEventListener("click", () => {
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
			if (ui?.status) ui.status.textContent = text;
		}
		function setNextDelay(text) {
			if (ui?.nextDelay) ui.nextDelay.textContent = text;
		}
		function updateClickCount() {
			if (ui?.clickCount) ui.clickCount.textContent = String(getState().clickCount);
		}
		function setPanelView(nextView) {
			panelView = nextView === "earnings" || nextView === "settings" ? nextView : "control";
			if (!ui?.controlTab || !ui?.earningsTab || !ui?.settingsTab || !ui?.controlView || !ui?.earningsView || !ui?.settingsView) return;
			const panelItems = [
				[
					"control",
					ui.controlTab,
					ui.controlView
				],
				[
					"earnings",
					ui.earningsTab,
					ui.earningsView
				],
				[
					"settings",
					ui.settingsTab,
					ui.settingsView
				]
			];
			for (const [view, tab, panel] of panelItems) {
				const active = panelView === view;
				tab.dataset.active = active ? "true" : "false";
				tab.setAttribute("aria-selected", active ? "true" : "false");
				panel.hidden = !active;
			}
			if (panelView === "earnings") renderEarningsStats();
			else if (panelView === "settings") {
				renderNotificationSettings();
				renderScheduleSettings();
			}
		}
		function formatStatNumber(value, maximumFractionDigits = 0) {
			return new Intl.NumberFormat("zh-CN", { maximumFractionDigits }).format(toNonNegativeNumber(value));
		}
		function getEarningsCategoryDisplay(category) {
			const originalLabel = normalizeText(category) || "Unknown";
			return EARNINGS_CATEGORY_DISPLAY[originalLabel.toLowerCase()] ?? {
				label: originalLabel,
				tone: "unknown"
			};
		}
		function renderStatsList(container, entries, emptyText) {
			if (!container) return;
			container.replaceChildren();
			if (entries.length === 0) {
				const empty = document.createElement("span");
				empty.className = "empty-stat";
				empty.textContent = emptyText;
				container.appendChild(empty);
				return;
			}
			for (const [category, count] of entries) {
				const chip = document.createElement("span");
				const display = getEarningsCategoryDisplay(category);
				chip.className = "stat-chip";
				chip.dataset.tone = display.tone;
				chip.textContent = `${display.label} ×${formatStatNumber(count)}`;
				chip.title = chip.textContent;
				container.appendChild(chip);
			}
		}
		function renderEarningsStats() {
			if (!ui?.statsCasts) return;
			const { earningsStats } = getState();
			const averageGold = earningsStats.casts > 0 ? earningsStats.gold / earningsStats.casts : 0;
			ui.statsStart.textContent = `统计起点：${new Date(earningsStats.startedAt).toLocaleString()}`;
			ui.statsCasts.textContent = formatStatNumber(earningsStats.casts);
			ui.statsFish.textContent = formatStatNumber(earningsStats.fish);
			ui.statsGold.textContent = formatStatNumber(earningsStats.gold, 2);
			ui.statsXp.textContent = formatStatNumber(earningsStats.xp, 2);
			ui.statsRelics.textContent = formatStatNumber(earningsStats.relics, 2);
			ui.statsTreasures.textContent = formatStatNumber(earningsStats.treasureChests);
			ui.statsGears.textContent = formatStatNumber(earningsStats.gears);
			ui.statsGoldAverage.textContent = formatStatNumber(averageGold, 1);
			const rarityEntries = Object.entries(earningsStats.rarityCounts).sort((left, right) => right[1] - left[1]);
			renderStatsList(ui.rarityStats, rarityEntries, "暂无收获");
		}
		function setPanelCollapsed(nextCollapsed) {
			panelCollapsed = Boolean(nextCollapsed);
			savePanelCollapsed(panelCollapsed);
			renderPanelCollapsed();
		}
		function renderPanelCollapsed() {
			if (!ui?.panel || !ui?.collapseToggle) return;
			const action = panelCollapsed ? "展开" : "收起";
			ui.panel.dataset.collapsed = panelCollapsed ? "true" : "false";
			ui.collapseToggle.textContent = panelCollapsed ? "＋" : "−";
			ui.collapseToggle.title = `${action}控制面板`;
			ui.collapseToggle.setAttribute("aria-label", `${action}控制面板`);
			ui.collapseToggle.setAttribute("aria-expanded", panelCollapsed ? "false" : "true");
		}
		function renderPushKeyHelp() {
			if (ui?.pushKeyHelp) ui.pushKeyHelp.hidden = Boolean(getState().pushKey);
		}
		function renderNotificationSettings() {
			if (!ui?.notificationModeInputs?.length) return;
			const { notificationMode } = getState();
			for (const input of ui.notificationModeInputs) input.checked = input.value === notificationMode;
			const showBrowserSettings = notificationMode === "browser";
			ui.serverNotificationSettings.hidden = showBrowserSettings;
			ui.browserNotificationSettings.hidden = !showBrowserSettings;
			renderPushKeyHelp();
			if (!showBrowserSettings) return;
			const permission = typeof window.Notification === "function" ? window.Notification.permission : "unsupported";
			const permissionLabels = {
				granted: "已授权",
				denied: "已拒绝",
				default: "未授权",
				unsupported: "当前浏览器不支持"
			};
			ui.browserNotificationPermission.textContent = permissionLabels[permission] ?? "未知";
			ui.browserNotificationPermissionButton.disabled = permission === "granted" || permission === "denied" || permission === "unsupported";
			ui.browserNotificationPermissionButton.textContent = permission === "granted" ? "浏览器通知已授权" : permission === "denied" ? "请在浏览器设置中重新授权" : permission === "unsupported" ? "当前浏览器不支持通知" : "授权浏览器通知";
		}
		function renderScheduleStatus(remaining = null) {
			if (!ui?.scheduleStatus) return;
			const { enabled, scheduleDuration, scheduleEndsAt, schedulePhase, scheduleSettings } = getState();
			if (!scheduleSettings.enabled) {
				ui.scheduleStatus.textContent = "未启用";
				return;
			}
			if (scheduleEndsAt === 0 || scheduleDuration === 0) {
				ui.scheduleStatus.textContent = enabled ? "等待开始本轮运行" : "脚本启动后开始";
				return;
			}
			if (schedulePhase === "rest") {
				const restRemaining = remaining ?? scheduleEndsAt - Date.now();
				ui.scheduleStatus.textContent = `休息中，剩余 ${formatScheduleDuration(restRemaining)}`;
				return;
			}
			ui.scheduleStatus.textContent = `本轮运行 ${formatScheduleDuration(scheduleDuration)}`;
		}
		function renderScheduleSettings() {
			if (!ui?.scheduleEnabledToggle) return;
			const { scheduleSettings } = getState();
			ui.scheduleEnabledToggle.checked = scheduleSettings.enabled;
			ui.scheduleEnabledToggle.setAttribute("aria-checked", scheduleSettings.enabled ? "true" : "false");
			ui.scheduleSettings.hidden = !scheduleSettings.enabled;
			ui.scheduleWorkMinutes.value = String(scheduleSettings.workMinutes);
			ui.scheduleRestMinutes.value = String(scheduleSettings.restMinutes);
			renderScheduleStatus();
		}
		function renderToggle() {
			if (!ui?.toggle) return;
			const { enabled } = getState();
			ui.toggle.textContent = enabled ? "停止" : "启动";
			ui.toggle.dataset.enabled = enabled ? "true" : "false";
		}
		function renderCaptchaBypassToggle() {
			if (!ui?.captchaBypassToggle) return;
			const { captchaBypassEnabled } = getState();
			ui.captchaBypassToggle.checked = captchaBypassEnabled;
			ui.captchaBypassToggle.setAttribute("aria-checked", captchaBypassEnabled ? "true" : "false");
		}
		createPanel();
		return {
			renderCaptchaBypassToggle,
			renderEarningsStats,
			renderNotificationSettings,
			renderScheduleSettings,
			renderScheduleStatus,
			renderToggle,
			setNextDelay,
			setStatus,
			updateClickCount
		};
	}
	var enabled = loadEnabled();
	var captchaBypassEnabled = loadCaptchaBypassEnabled();
	var pushKey = loadPushKey();
	var notificationMode = loadNotificationMode();
	var scheduleSettings = loadScheduleSettings();
	var earningsStats = loadEarningsStats();
	var loopId = 0;
	var clickCount = 0;
	var captcha = null;
	var panel = null;
	var schedule = null;
	function recordCastResult(result) {
		earningsStats = updateEarningsStats(earningsStats, result);
		saveEarningsStats(earningsStats);
		panel.renderEarningsStats();
	}
	function setPushKey(nextPushKey) {
		pushKey = String(nextPushKey ?? "").trim();
		savePushKey(pushKey);
	}
	async function requestBrowserNotificationPermission() {
		await requestBrowserNotificationPermission$1();
		panel.renderNotificationSettings();
	}
	function resetEarningsStats() {
		if (!window.confirm("确定重置全部收益统计吗？此操作无法撤销。")) return;
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
			...schedule.getSnapshot()
		};
	}
	function findCastButton() {
		const buttons = document.querySelectorAll("button");
		for (const button of buttons) {
			if (!normalizeText(button.textContent).includes(CONFIG.buttonText)) continue;
			if (button.disabled) continue;
			if (button.getAttribute("aria-disabled") === "true") continue;
			if (!isDisplayed(button)) continue;
			return button;
		}
		return null;
	}
	function getRandomDelay() {
		if (Math.random() < CONFIG.longDelayChance) return {
			milliseconds: randomInt(CONFIG.longDelayMin, CONFIG.longDelayMax),
			isLongDelay: true
		};
		return {
			milliseconds: randomInt(CONFIG.normalDelayMin, CONFIG.normalDelayMax),
			isLongDelay: false
		};
	}
	function dispatchPointerEvent(target, type, options) {
		if (typeof window.PointerEvent !== "function") return;
		target.dispatchEvent(new window.PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			pointerId: 1,
			pointerType: "mouse",
			isPrimary: true,
			width: 1,
			height: 1,
			pressure: options.buttons === 1 ? .5 : 0,
			button: 0,
			...options
		}));
	}
	function dispatchMouseEvent(target, type, options) {
		target.dispatchEvent(new window.MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			view: window,
			button: 0,
			...options
		}));
	}
	async function simulateClick(button, currentLoopId) {
		if (!button?.isConnected) return false;
		button.scrollIntoView({
			block: "center",
			inline: "center",
			behavior: "auto"
		});
		await sleep(60);
		if (!enabled || currentLoopId !== loopId || !button.isConnected || schedule.isWorkExpired()) return false;
		if (captcha.stopIfChallengeFound()) return false;
		const rect = button.getBoundingClientRect();
		const clientX = rect.left + rect.width * (.42 + Math.random() * .16);
		const clientY = rect.top + rect.height * (.38 + Math.random() * .24);
		const hitElement = document.elementFromPoint(clientX, clientY);
		if (!hitElement || hitElement !== button && !button.contains(hitElement)) {
			console.warn("[自动抛竿] 按钮可能被其他元素遮挡：", hitElement);
			return false;
		}
		const eventTarget = hitElement;
		try {
			button.focus({ preventScroll: true });
		} catch {
			button.focus();
		}
		const baseOptions = {
			clientX,
			clientY,
			screenX: window.screenX + clientX,
			screenY: window.screenY + clientY
		};
		dispatchPointerEvent(eventTarget, "pointerover", {
			...baseOptions,
			buttons: 0
		});
		dispatchMouseEvent(eventTarget, "mouseover", {
			...baseOptions,
			buttons: 0,
			detail: 0
		});
		dispatchPointerEvent(eventTarget, "pointermove", {
			...baseOptions,
			buttons: 0
		});
		dispatchMouseEvent(eventTarget, "mousemove", {
			...baseOptions,
			buttons: 0,
			detail: 0
		});
		dispatchPointerEvent(eventTarget, "pointerdown", {
			...baseOptions,
			buttons: 1
		});
		dispatchMouseEvent(eventTarget, "mousedown", {
			...baseOptions,
			buttons: 1,
			detail: 1
		});
		await sleep(randomInt(CONFIG.mouseDownMin, CONFIG.mouseDownMax));
		const wasCancelled = !enabled || currentLoopId !== loopId;
		dispatchPointerEvent(eventTarget, "pointerup", {
			...baseOptions,
			buttons: 0
		});
		dispatchMouseEvent(eventTarget, "mouseup", {
			...baseOptions,
			buttons: 0,
			detail: 1
		});
		if (wasCancelled) return false;
		dispatchMouseEvent(eventTarget, "click", {
			...baseOptions,
			buttons: 0,
			detail: 1
		});
		return true;
	}
	async function waitForButton(currentLoopId) {
		while (enabled && currentLoopId === loopId) {
			if (captcha.stopIfChallengeFound()) return null;
			if (schedule.isWorkExpired()) return null;
			const button = findCastButton();
			if (button) return button;
			panel.setStatus("等待“抛竿线”按钮出现");
			panel.setNextDelay("—");
			await sleep(CONFIG.buttonPollInterval);
		}
		return null;
	}
	async function waitWithCountdown(milliseconds, isLongDelay, currentLoopId) {
		const endTime = Date.now() + milliseconds;
		while (enabled && currentLoopId === loopId) {
			if (captcha.stopIfChallengeFound()) return false;
			if (schedule.isWorkExpired()) return false;
			const remaining = endTime - Date.now();
			if (remaining <= 0) {
				panel.setNextDelay("准备点击");
				return true;
			}
			const seconds = (remaining / 1e3).toFixed(1);
			panel.setStatus(isLongDelay ? "随机长等待中" : "等待下一次操作");
			panel.setNextDelay(isLongDelay ? `${seconds} 秒（长等待）` : `${seconds} 秒`);
			await sleep(Math.min(100, remaining));
		}
		return false;
	}
	async function runLoop(currentLoopId) {
		while (enabled && currentLoopId === loopId) {
			if (!await schedule.waitForWork(currentLoopId)) return;
			if (!await waitForButton(currentLoopId)) {
				if (schedule.shouldEnterRest(currentLoopId)) continue;
				return;
			}
			const delay = getRandomDelay();
			if (!await waitWithCountdown(delay.milliseconds, delay.isLongDelay, currentLoopId)) {
				if (schedule.shouldEnterRest(currentLoopId)) continue;
				return;
			}
			const latestButton = findCastButton();
			if (!latestButton) continue;
			if (schedule.isWorkExpired()) continue;
			panel.setStatus("正在模拟点击");
			panel.setNextDelay("—");
			const clicked = await simulateClick(latestButton, currentLoopId);
			if (!enabled || currentLoopId !== loopId) return;
			if (clicked) {
				clickCount += 1;
				panel.updateClickCount();
				const time = new Date().toLocaleTimeString();
				panel.setStatus(`已点击，时间：${time}`);
				console.info(`[自动抛竿] 第 ${clickCount} 次点击`, latestButton);
				await sleep(150);
			} else {
				if (captcha.isBypassInProgress() || captcha.stopIfChallengeFound()) return;
				if (schedule.isWorkExpired()) continue;
				panel.setStatus("本次未点击，重新等待");
				await sleep(500);
			}
		}
	}
	function setEnabled(nextEnabled) {
		enabled = Boolean(nextEnabled);
		saveEnabled(enabled);
		schedule.reset();
		if (!enabled) captcha.cancel();
		loopId += 1;
		panel.renderToggle();
		if (enabled) {
			const currentLoopId = loopId;
			panel.setStatus("已启动，正在查找按钮");
			panel.setNextDelay("—");
			runLoop(currentLoopId).catch((error) => {
				console.error("[自动抛竿] 运行异常：", error);
				if (currentLoopId === loopId) panel.setStatus(`运行异常：${error.message}`);
			});
		} else {
			panel.setStatus("已停止");
			panel.setNextDelay("—");
		}
	}
	function setCaptchaBypassEnabled(nextEnabled) {
		captchaBypassEnabled = Boolean(nextEnabled);
		saveCaptchaBypassEnabled(captchaBypassEnabled);
		panel.renderCaptchaBypassToggle();
		captcha.handleBypassSettingChanged();
	}
	function setNotificationMode(nextMode) {
		notificationMode = nextMode === "browser" ? "browser" : "server";
		saveNotificationMode(notificationMode);
		panel.renderNotificationSettings();
		if (notificationMode === "browser" && typeof window.Notification === "function" && window.Notification.permission === "default") requestBrowserNotificationPermission();
	}
	function setScheduleEnabled(nextEnabled) {
		scheduleSettings = {
			...scheduleSettings,
			enabled: Boolean(nextEnabled)
		};
		saveScheduleSettings(scheduleSettings);
		schedule.reset();
		if (enabled && scheduleSettings.enabled) schedule.startWork();
	}
	function setScheduleMinutes(field, value) {
		const nextValue = normalizeScheduleMinutes(value, scheduleSettings[field]);
		scheduleSettings = {
			...scheduleSettings,
			[field]: nextValue
		};
		saveScheduleSettings(scheduleSettings);
		schedule.reset();
		if (enabled && scheduleSettings.enabled) schedule.startWork();
	}
	document.addEventListener("keydown", (event) => {
		const target = event.target;
		if (target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))) return;
		if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === "KeyA") {
			event.preventDefault();
			event.stopPropagation();
			setEnabled(!enabled);
		}
	}, true);
	schedule = createScheduleController({
		getCaptcha() {
			return captcha;
		},
		getState() {
			return {
				enabled,
				loopId,
				scheduleSettings
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
		}
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
			setScheduleMinutes
		},
		formatScheduleDuration,
		getState: getPanelState
	});
	captcha = createCaptchaController({
		getState() {
			return {
				captchaBypassEnabled,
				enabled
			};
		},
		notify() {
			return sendHumanVerificationNotification({
				notificationMode,
				pushKey
			});
		},
		setEnabled,
		setNextDelay: panel.setNextDelay,
		setStatus: panel.setStatus
	});
	installFetchInterceptor({
		onCastResult: recordCastResult,
		onCaptchaChallenge(challenge) {
			captcha.handleChallenge(challenge);
		},
		onCaptchaVerified() {
			captcha.clearChallenge();
		}
	});
	setEnabled(enabled);
	console.info("[自动抛竿] 脚本已加载，使用右下角按钮或 Alt + A 控制。");
})();
