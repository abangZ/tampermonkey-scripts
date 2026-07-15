import {
    AUTO_BIOME_SETTINGS_STORAGE_KEY,
    CAPTCHA_BYPASS_STORAGE_KEY,
    NOTIFICATION_MODE_STORAGE_KEY,
    PANEL_COLLAPSED_STORAGE_KEY,
    PUSH_KEY_STORAGE_KEY,
    SCHEDULE_SETTINGS_STORAGE_KEY,
    STORAGE_KEY,
} from './config.js';

export const AUTO_BIOME_WEIGHTS = [0, 5, 10];

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
        enabled: false,
        biomeWeight: 5,
    };

    try {
        const savedSettings = JSON.parse(
            localStorage.getItem(AUTO_BIOME_SETTINGS_STORAGE_KEY),
        );

        if (!savedSettings || typeof savedSettings !== 'object') {
            return defaults;
        }

        return {
            enabled: savedSettings.enabled === true,
            biomeWeight: normalizeAutoBiomeWeight(
                savedSettings.biomeWeight,
                defaults.biomeWeight,
            ),
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
