import {
    AUTO_BAIT_SETTINGS_STORAGE_KEY,
    AUTO_BIOME_SETTINGS_STORAGE_KEY,
    CAPTCHA_BYPASS_STORAGE_KEY,
    CLICK_DELAY_SETTINGS_STORAGE_KEY,
    IDLE_RELOAD_SETTINGS_STORAGE_KEY,
    NOTIFICATION_MODE_STORAGE_KEY,
    PANEL_COLLAPSED_STORAGE_KEY,
    PUSH_KEY_STORAGE_KEY,
    SCHEDULE_SETTINGS_STORAGE_KEY,
    STORAGE_KEY,
} from './config.js';
import {
    DEFAULT_CLICK_DELAY_SETTINGS,
    normalizeClickDelaySettings,
} from './click-delay.js';

export const AUTO_BIOME_WEIGHTS = [0, 5, 10];
export const AUTO_BAIT_GRADES = ['default', 'low', 'medium', 'high', 'super'];
export const AUTO_BAIT_PURCHASE_QUANTITIES = [100, 1000];

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

export function loadAutoBiomeSettings() {
    const defaults = {
        chaseGoldBreeze: false,
        enabled: false,
        biomeWeight: 5,
        preferCompetitionBiomes: true,
    };

    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(AUTO_BIOME_SETTINGS_STORAGE_KEY),
        );

        if (!savedSettings || typeof savedSettings !== 'object') {
            return defaults;
        }

        return {
            chaseGoldBreeze: savedSettings.chaseGoldBreeze === true,
            enabled: savedSettings.enabled === true,
            biomeWeight: normalizeAutoBiomeWeight(
                savedSettings.biomeWeight,
                defaults.biomeWeight,
            ),
            preferCompetitionBiomes:
                savedSettings.preferCompetitionBiomes !== false,
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
