/**
 * 配置
 */
export const CONFIG = {
    // 目标按钮文字，按钮实际显示为：🎣 抛竿线
    buttonText: '抛竿线',

    // 按钮未出现时的检查间隔
    buttonPollInterval: 250,

    // 冷却倒计时持续超过该时间后刷新页面
    cooldownButtonText: '冷却时间',
    cooldownReloadDelay: 10000,

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

    // 世界 Boss 成功攻击后，游戏页面会进入 6 秒冷却。
    autoBossAttackInterval: 6100,
    autoBossPollInterval: 10000,

    // 定时运行/休息会在设置值上加入 -5%～+10% 的随机量
    scheduleRandomExtraRatioMin: -0.05,
    scheduleRandomExtraRatioMax: 0.1,
};

export const STORAGE_KEY = 'arcane-angler-auto-cast-enabled-v1';
export const CLICK_DELAY_SETTINGS_STORAGE_KEY =
    'arcane-angler-click-delay-settings-v1';
export const CAPTCHA_BYPASS_STORAGE_KEY =
    'arcane-angler-captcha-bypass-enabled-v1';
export const PUSH_KEY_STORAGE_KEY = 'arcane-angler-push-key-v1';
export const NOTIFICATION_MODE_STORAGE_KEY =
    'arcane-angler-notification-mode-v1';
export const SCHEDULE_SETTINGS_STORAGE_KEY =
    'arcane-angler-schedule-settings-v1';
export const AUTO_BIOME_SETTINGS_STORAGE_KEY =
    'arcane-angler-auto-biome-settings-v1';
export const AUTO_BAIT_SETTINGS_STORAGE_KEY =
    'arcane-angler-auto-bait-settings-v1';
export const AUTO_BOSS_SETTINGS_STORAGE_KEY =
    'arcane-angler-auto-boss-settings-v1';
export const IDLE_RELOAD_SETTINGS_STORAGE_KEY =
    'arcane-angler-idle-reload-settings-v1';
export const PANEL_COLLAPSED_STORAGE_KEY = 'arcane-angler-panel-collapsed-v1';
export const EARNINGS_STORAGE_KEY = 'arcane-angler-earnings-v1';
export const PANEL_ID = 'arcane-angler-auto-cast-panel-host';
export const HUMAN_VERIFICATION_TEXT = '人机验证';
export const HUMAN_VERIFICATION_MESSAGE =
    'Arcane Angler 出现验证码了，自动抛竿已停止';
export const EARNINGS_CATEGORY_DISPLAY = {
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
