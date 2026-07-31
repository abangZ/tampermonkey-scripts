import {
    AUTO_BAIT_SETTINGS_STORAGE_KEY,
    AUTO_BIOME_SETTINGS_STORAGE_KEY,
    AUTO_BOSS_SETTINGS_STORAGE_KEY,
    CAPTCHA_BYPASS_STORAGE_KEY,
    CLICK_DELAY_SETTINGS_STORAGE_KEY,
    GAME_AUTO_FISHING_SETTINGS_STORAGE_KEY,
    IDLE_RELOAD_SETTINGS_STORAGE_KEY,
    NOTIFICATION_MODE_STORAGE_KEY,
    PANEL_COLLAPSED_STORAGE_KEY,
    PUSH_KEY_STORAGE_KEY,
    SCHEDULE_RUNTIME_STORAGE_KEY,
    SCHEDULE_SETTINGS_STORAGE_KEY,
    STORAGE_KEY,
    VERIFICATION_HISTORY_STORAGE_KEY,
} from './config.js';
import {
    DEFAULT_CLICK_DELAY_SETTINGS,
    normalizeClickDelaySettings,
} from './click-delay.js';
import {
    AUTO_BIOME_PRIORITY_IDS,
    DEFAULT_AUTO_BIOME_PRIORITY_ORDER,
    normalizeAutoBiomePriorityOrder,
} from './auto-biome-priority.js';

export const AUTO_BIOME_WEIGHTS = [0, 5, 10];
export const AUTO_BAIT_GRADES = ['default', 'low', 'medium', 'high', 'super'];
export const GAME_AUTO_FISHING_BAIT_GRADES = ['auto', ...AUTO_BAIT_GRADES];
export const AUTO_BAIT_PURCHASE_QUANTITIES = [100, 1000];
export const VERIFICATION_HISTORY_LIMIT = 5;

export function loadClickDelaySettings() {
    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(CLICK_DELAY_SETTINGS_STORAGE_KEY),
        );

        return normalizeClickDelaySettings(
            savedSettings,
            DEFAULT_CLICK_DELAY_SETTINGS,
        );
    } catch (error) {
        console.warn('[自动抛竿] 无法读取点击间隔设置：', error);
        return { ...DEFAULT_CLICK_DELAY_SETTINGS };
    }
}

export function saveClickDelaySettings(clickDelaySettings) {
    try {
        localStorage.setItem(
            CLICK_DELAY_SETTINGS_STORAGE_KEY,
            JSON.stringify(clickDelaySettings),
        );
    } catch (error) {
        console.warn('[自动抛竿] 无法保存点击间隔设置：', error);
    }
}

export function loadEnabled() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function saveEnabled(value) {
    try {
        localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch (error) {
        console.warn('[自动抛竿] 无法保存设置：', error);
    }
}

export function loadGameAutoFishingSettings() {
    const defaults = {
        baitGrade: 'auto',
        enabled: false,
    };

    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(GAME_AUTO_FISHING_SETTINGS_STORAGE_KEY),
        );

        if (!savedSettings || typeof savedSettings !== 'object') {
            return defaults;
        }

        return {
            baitGrade: normalizeGameAutoFishingBaitGrade(
                savedSettings.baitGrade,
                defaults.baitGrade,
            ),
            enabled: savedSettings.enabled === true,
        };
    } catch (error) {
        console.warn('[游戏内置自动钓鱼] 无法读取设置：', error);
        return defaults;
    }
}

export function saveGameAutoFishingSettings(gameAutoFishingSettings) {
    try {
        localStorage.setItem(
            GAME_AUTO_FISHING_SETTINGS_STORAGE_KEY,
            JSON.stringify(gameAutoFishingSettings),
        );
    } catch (error) {
        console.warn('[游戏内置自动钓鱼] 无法保存设置：', error);
    }
}

export function loadCaptchaBypassEnabled() {
    try {
        const savedValue = localStorage.getItem(CAPTCHA_BYPASS_STORAGE_KEY);

        return savedValue === null ? true : savedValue === '1';
    } catch {
        return true;
    }
}

export function saveCaptchaBypassEnabled(value) {
    try {
        localStorage.setItem(CAPTCHA_BYPASS_STORAGE_KEY, value ? '1' : '0');
    } catch (error) {
        console.warn('[自动抛竿] 无法保存自动过验证设置：', error);
    }
}

export function normalizeVerificationHistory(history) {
    if (!Array.isArray(history)) {
        return [];
    }

    return history
        .map((entry) => {
            const timestamp = Number(entry?.timestamp);

            if (
                !Number.isFinite(timestamp) ||
                timestamp <= 0 ||
                typeof entry?.success !== 'boolean'
            ) {
                return null;
            }

            return {
                success: entry.success,
                timestamp: Math.floor(timestamp),
            };
        })
        .filter(Boolean)
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, VERIFICATION_HISTORY_LIMIT);
}

export function addVerificationHistoryEntry(history, entry) {
    return normalizeVerificationHistory([
        entry,
        ...normalizeVerificationHistory(history),
    ]);
}

export function loadVerificationHistory() {
    try {
        return normalizeVerificationHistory(
            JSON.parse(localStorage.getItem(VERIFICATION_HISTORY_STORAGE_KEY)),
        );
    } catch (error) {
        console.warn('[自动过验证] 无法读取验证记录：', error);
        return [];
    }
}

export function saveVerificationHistory(history) {
    try {
        localStorage.setItem(
            VERIFICATION_HISTORY_STORAGE_KEY,
            JSON.stringify(normalizeVerificationHistory(history)),
        );
    } catch (error) {
        console.warn('[自动过验证] 无法保存验证记录：', error);
    }
}

export function loadPushKey() {
    try {
        return localStorage.getItem(PUSH_KEY_STORAGE_KEY)?.trim() ?? '';
    } catch {
        return '';
    }
}

export function savePushKey(value) {
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

export function loadNotificationMode() {
    try {
        return localStorage.getItem(NOTIFICATION_MODE_STORAGE_KEY) === 'browser'
            ? 'browser'
            : 'server';
    } catch {
        return 'server';
    }
}

export function saveNotificationMode(value) {
    try {
        localStorage.setItem(NOTIFICATION_MODE_STORAGE_KEY, value);
    } catch (error) {
        console.warn('[自动抛竿] 无法保存通知方式：', error);
    }
}

export function normalizeAutoBiomeWeight(value, fallback = 5) {
    const weight = Number(value);

    return AUTO_BIOME_WEIGHTS.includes(weight) ? weight : fallback;
}

function migrateLegacyAutoBiomePriorityOrder(savedSettings) {
    const enabledPriorities = [];

    if (savedSettings.preferCompetitionBiomes !== false) {
        enabledPriorities.push(
            AUTO_BIOME_PRIORITY_IDS.guildCompetition,
            AUTO_BIOME_PRIORITY_IDS.personalCompetition,
        );
    }

    enabledPriorities.push(AUTO_BIOME_PRIORITY_IDS.arcaneSurge);

    if (savedSettings.chaseGoldBreeze === true) {
        enabledPriorities.push(AUTO_BIOME_PRIORITY_IDS.goldBreeze);
    }

    if (savedSettings.preferDailyQuests === true) {
        enabledPriorities.push(AUTO_BIOME_PRIORITY_IDS.dailyQuest);
    }

    return [
        ...enabledPriorities,
        AUTO_BIOME_PRIORITY_IDS.weightedExperience,
        ...DEFAULT_AUTO_BIOME_PRIORITY_ORDER.filter(
            (priorityId) =>
                priorityId !== AUTO_BIOME_PRIORITY_IDS.weightedExperience &&
                !enabledPriorities.includes(priorityId),
        ),
    ];
}

export function loadAutoBiomeSettings() {
    const defaults = {
        biomeWeight: 5,
        enabled: false,
        priorityOrder: [...DEFAULT_AUTO_BIOME_PRIORITY_ORDER],
    };

    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(AUTO_BIOME_SETTINGS_STORAGE_KEY),
        );

        if (!savedSettings || typeof savedSettings !== 'object') {
            return defaults;
        }

        return {
            biomeWeight: normalizeAutoBiomeWeight(
                savedSettings.biomeWeight,
                defaults.biomeWeight,
            ),
            enabled: savedSettings.enabled === true,
            priorityOrder: Array.isArray(savedSettings.priorityOrder)
                ? normalizeAutoBiomePriorityOrder(savedSettings.priorityOrder)
                : migrateLegacyAutoBiomePriorityOrder(savedSettings),
        };
    } catch (error) {
        console.warn('[自动换图] 无法读取设置：', error);
        return defaults;
    }
}

export function saveAutoBiomeSettings(autoBiomeSettings) {
    try {
        localStorage.setItem(
            AUTO_BIOME_SETTINGS_STORAGE_KEY,
            JSON.stringify(autoBiomeSettings),
        );
    } catch (error) {
        console.warn('[自动换图] 无法保存设置：', error);
    }
}

export function normalizeAutoBaitGrade(value, fallback = 'low') {
    return AUTO_BAIT_GRADES.includes(value) ? value : fallback;
}

export function normalizeGameAutoFishingBaitGrade(value, fallback = 'auto') {
    return GAME_AUTO_FISHING_BAIT_GRADES.includes(value) ? value : fallback;
}

export function normalizeAutoBaitMinimumQuantity(value, fallback = 100) {
    const quantity = Number(value);

    if (!Number.isFinite(quantity) || quantity < 1) {
        return fallback;
    }

    return Math.min(100000, Math.round(quantity));
}

export function normalizeAutoBaitPurchaseQuantity(value, fallback = 100) {
    const quantity = Number(value);

    return AUTO_BAIT_PURCHASE_QUANTITIES.includes(quantity)
        ? quantity
        : fallback;
}

export function loadAutoBaitSettings() {
    const defaults = {
        enabled: false,
        goldBreezeBaitGrade: 'default',
        guildCompetitionBaitGrade: 'low',
        minimumQuantity: 100,
        personalCompetitionBaitGrade: 'low',
        purchaseQuantity: 100,
        regularBaitGrade: 'low',
    };

    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(AUTO_BAIT_SETTINGS_STORAGE_KEY),
        );

        if (!savedSettings || typeof savedSettings !== 'object') {
            return defaults;
        }

        const legacyBaitGrade = normalizeAutoBaitGrade(
            savedSettings.baitGrade,
            defaults.regularBaitGrade,
        );

        return {
            enabled: savedSettings.enabled === true,
            goldBreezeBaitGrade: normalizeAutoBaitGrade(
                savedSettings.goldBreezeBaitGrade,
                defaults.goldBreezeBaitGrade,
            ),
            guildCompetitionBaitGrade: normalizeAutoBaitGrade(
                savedSettings.guildCompetitionBaitGrade,
                legacyBaitGrade,
            ),
            minimumQuantity: normalizeAutoBaitMinimumQuantity(
                savedSettings.minimumQuantity,
                defaults.minimumQuantity,
            ),
            personalCompetitionBaitGrade: normalizeAutoBaitGrade(
                savedSettings.personalCompetitionBaitGrade,
                legacyBaitGrade,
            ),
            purchaseQuantity: normalizeAutoBaitPurchaseQuantity(
                savedSettings.purchaseQuantity,
                defaults.purchaseQuantity,
            ),
            regularBaitGrade: normalizeAutoBaitGrade(
                savedSettings.regularBaitGrade,
                legacyBaitGrade,
            ),
        };
    } catch (error) {
        console.warn('[自动买鱼饵] 无法读取设置：', error);
        return defaults;
    }
}

export function normalizeIdleReloadMinutes(value, fallback = 5) {
    const minutes = Number(value);

    if (!Number.isFinite(minutes) || minutes < 1) {
        return fallback;
    }

    return Math.min(1440, Math.round(minutes));
}

export function loadIdleReloadSettings() {
    const defaults = {
        minutes: 5,
    };

    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(IDLE_RELOAD_SETTINGS_STORAGE_KEY),
        );

        if (!savedSettings || typeof savedSettings !== 'object') {
            return defaults;
        }

        return {
            minutes: normalizeIdleReloadMinutes(
                savedSettings.minutes,
                defaults.minutes,
            ),
        };
    } catch (error) {
        console.warn('[自动抛竿] 无法读取无钓鱼刷新设置：', error);
        return defaults;
    }
}

export function saveIdleReloadSettings(idleReloadSettings) {
    try {
        localStorage.setItem(
            IDLE_RELOAD_SETTINGS_STORAGE_KEY,
            JSON.stringify(idleReloadSettings),
        );
    } catch (error) {
        console.warn('[自动抛竿] 无法保存无钓鱼刷新设置：', error);
    }
}

export function saveAutoBaitSettings(autoBaitSettings) {
    try {
        localStorage.setItem(
            AUTO_BAIT_SETTINGS_STORAGE_KEY,
            JSON.stringify(autoBaitSettings),
        );
    } catch (error) {
        console.warn('[自动买鱼饵] 无法保存设置：', error);
    }
}

export function loadAutoBossSettings() {
    const defaults = {
        enabled: false,
    };

    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(AUTO_BOSS_SETTINGS_STORAGE_KEY),
        );

        return {
            enabled: savedSettings?.enabled === true,
        };
    } catch (error) {
        console.warn('[自动打 Boss] 无法读取设置：', error);
        return defaults;
    }
}

export function saveAutoBossSettings(autoBossSettings) {
    try {
        localStorage.setItem(
            AUTO_BOSS_SETTINGS_STORAGE_KEY,
            JSON.stringify(autoBossSettings),
        );
    } catch (error) {
        console.warn('[自动打 Boss] 无法保存设置：', error);
    }
}

export function normalizeScheduleMinutes(value, fallback) {
    const minutes = Number(value);

    if (!Number.isFinite(minutes) || minutes < 1) {
        return fallback;
    }

    return Math.min(1440, Math.round(minutes));
}

export function loadScheduleSettings() {
    const defaults = {
        enabled: false,
        gameAutoFishingDuringRest: false,
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
            gameAutoFishingDuringRest:
                savedSettings.gameAutoFishingDuringRest === true,
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

export function saveScheduleSettings(scheduleSettings) {
    try {
        localStorage.setItem(
            SCHEDULE_SETTINGS_STORAGE_KEY,
            JSON.stringify(scheduleSettings),
        );
    } catch (error) {
        console.warn('[自动抛竿] 无法保存定时休息设置：', error);
    }
}

export function normalizeScheduleRuntime(runtime) {
    const schedulePhase = runtime?.schedulePhase;
    const scheduleDuration = Number(runtime?.scheduleDuration);
    const scheduleEndsAt = Number(runtime?.scheduleEndsAt);

    if (
        (schedulePhase !== 'work' && schedulePhase !== 'rest') ||
        !Number.isFinite(scheduleDuration) ||
        scheduleDuration <= 0 ||
        !Number.isFinite(scheduleEndsAt) ||
        scheduleEndsAt <= 0
    ) {
        return {
            scheduleDuration: 0,
            scheduleEndsAt: 0,
            schedulePhase: 'work',
        };
    }

    return {
        scheduleDuration,
        scheduleEndsAt,
        schedulePhase,
    };
}

export function loadScheduleRuntime() {
    try {
        return normalizeScheduleRuntime(
            JSON.parse(localStorage.getItem(SCHEDULE_RUNTIME_STORAGE_KEY)),
        );
    } catch (error) {
        console.warn('[自动抛竿] 无法读取定时休息进度：', error);
        return normalizeScheduleRuntime(null);
    }
}

export function saveScheduleRuntime(runtime) {
    try {
        localStorage.setItem(
            SCHEDULE_RUNTIME_STORAGE_KEY,
            JSON.stringify(normalizeScheduleRuntime(runtime)),
        );
    } catch (error) {
        console.warn('[自动抛竿] 无法保存定时休息进度：', error);
    }
}

export function loadPanelCollapsed() {
    const collapseByDefault = window.matchMedia('(max-width: 767px)').matches;

    try {
        const savedValue = localStorage.getItem(PANEL_COLLAPSED_STORAGE_KEY);

        return savedValue === null ? collapseByDefault : savedValue === '1';
    } catch {
        return collapseByDefault;
    }
}

export function savePanelCollapsed(value) {
    try {
        localStorage.setItem(PANEL_COLLAPSED_STORAGE_KEY, value ? '1' : '0');
    } catch (error) {
        console.warn('[自动抛竿] 无法保存面板折叠状态：', error);
    }
}
