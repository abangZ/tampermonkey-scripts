import { CONFIG } from './config.js';

export const BOSS_STAT_LABELS = {
    strength: '力量',
    intelligence: '智力',
    luck: '幸运',
    stamina: '耐力',
};

const BOSS_STATS = Object.keys(BOSS_STAT_LABELS);

function normalizeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : 0;
}

function getStatMultiplier(anomaly, stat) {
    if (stat === anomaly?.primaryWeakness) {
        return 3.75;
    }

    if (stat === anomaly?.secondaryWeakness) {
        return 2;
    }

    if (stat === anomaly?.resistantStat) {
        return 0.375;
    }

    return 1.125;
}

export function getPlayerBossStats(player) {
    let totalStats = null;

    try {
        totalStats = window.GameHelpers?.getTotalStats?.(player, null) ?? null;
    } catch (error) {
        console.warn('[自动打 Boss] 无法计算装备后的角色属性：', error);
    }

    const source = totalStats ?? player?.stats ?? player ?? {};

    return Object.fromEntries(
        BOSS_STATS.map((stat) => [stat, normalizeNumber(source[stat])]),
    );
}

export function selectBestBossStat(anomaly, stats) {
    const fallback = BOSS_STATS.includes(anomaly?.primaryWeakness)
        ? anomaly.primaryWeakness
        : 'strength';
    let bestStat = fallback;
    let bestDamage = -1;

    for (const stat of BOSS_STATS) {
        const damage =
            normalizeNumber(stats?.[stat]) * getStatMultiplier(anomaly, stat);

        if (damage > bestDamage) {
            bestStat = stat;
            bestDamage = damage;
        }
    }

    return bestDamage > 0 ? bestStat : fallback;
}

function getErrorMessage(error) {
    return String(error?.message ?? error ?? '未知错误');
}

export function createAutoBossController({
    getPlayer,
    getState,
    onStateChange,
}) {
    let timer = null;
    let checking = false;
    let started = false;
    let status = '未启用';
    let lastAttackAt = 0;
    let lastDamage = 0;
    let lastStat = null;
    let reevaluateAfterCurrent = false;
    let revision = 0;

    function notifyStateChanged() {
        onStateChange?.();
    }

    function setStatus(nextStatus) {
        status = nextStatus;
        notifyStateChanged();
    }

    function schedule(delay) {
        window.clearTimeout(timer);
        timer = null;

        if (!started) {
            return;
        }

        timer = window.setTimeout(() => {
            evaluate().catch((error) => {
                checking = false;
                reevaluateAfterCurrent = false;
                console.error('[自动打 Boss] 未处理的运行异常：', error);

                try {
                    setStatus(`运行异常：${getErrorMessage(error)}`);
                } finally {
                    schedule(CONFIG.autoBossPollInterval);
                }
            });
        }, delay);
    }

    function getSnapshot() {
        return {
            autoBossChecking: checking,
            autoBossLastAttackAt: lastAttackAt,
            autoBossLastDamage: lastDamage,
            autoBossLastStat: lastStat,
            autoBossStatus: status,
        };
    }

    async function evaluate() {
        if (checking) {
            reevaluateAfterCurrent = true;
            return;
        }

        const currentRevision = ++revision;

        const { autoBossSettings, enabled } = getState();

        if (!autoBossSettings.enabled) {
            setStatus('未启用');
            return;
        }

        if (!enabled) {
            setStatus('脚本启动后自动攻击');
            return;
        }

        const api = window.ApiService;

        if (
            typeof api?.getCurrentAnomaly !== 'function' ||
            typeof api?.attackAnomaly !== 'function'
        ) {
            setStatus('等待游戏 Boss 接口');
            schedule(CONFIG.autoBossPollInterval);
            return;
        }

        checking = true;
        setStatus('正在检查世界 Boss');

        try {
            const current = await api.getCurrentAnomaly();
            const event = current?.event;

            if (
                currentRevision !== revision ||
                !getState().enabled ||
                !getState().autoBossSettings.enabled
            ) {
                return;
            }

            if (
                current?.active !== true ||
                !event?.anomaly ||
                normalizeNumber(event.currentHp) === 0
            ) {
                setStatus('暂无活动 Boss');
                schedule(CONFIG.autoBossPollInterval);
                return;
            }

            const lastServerAttackAt = Date.parse(
                current.playerParticipation?.lastAttackTime ?? '',
            );
            const cooldownRemaining = Number.isFinite(lastServerAttackAt)
                ? lastServerAttackAt +
                  CONFIG.autoBossAttackInterval -
                  Date.now()
                : 0;

            if (cooldownRemaining > 0) {
                setStatus(
                    `冷却中，${Math.ceil(cooldownRemaining / 1000)} 秒后攻击`,
                );
                schedule(cooldownRemaining);
                return;
            }

            const stat = selectBestBossStat(
                event.anomaly,
                getPlayerBossStats(getPlayer?.()),
            );
            const statLabel = BOSS_STAT_LABELS[stat];

            setStatus(`正在使用${statLabel}攻击`);

            const result = await api.attackAnomaly(stat);

            if (!result?.attack) {
                throw new Error(result?.message ?? '游戏未返回攻击结果');
            }

            lastAttackAt = Date.now();
            lastDamage = normalizeNumber(result.attack.finalDamage);
            lastStat = stat;

            setStatus(
                result.anomaly?.defeated
                    ? `已击败 ${result.anomaly.name ?? '世界 Boss'}`
                    : `${statLabel}造成 ${lastDamage.toLocaleString()} 伤害`,
            );
            schedule(CONFIG.autoBossAttackInterval);
        } catch (error) {
            console.error('[自动打 Boss] 攻击失败：', error);
            setStatus(`攻击失败：${getErrorMessage(error)}`);
            schedule(CONFIG.autoBossAttackInterval);
        } finally {
            checking = false;

            if (reevaluateAfterCurrent) {
                reevaluateAfterCurrent = false;
                schedule(0);
            }
        }
    }

    function handleStateChanged() {
        revision += 1;
        window.clearTimeout(timer);
        timer = null;

        if (!started) {
            return;
        }

        const { autoBossSettings, enabled } = getState();

        if (!autoBossSettings.enabled) {
            reevaluateAfterCurrent = false;
            setStatus('未启用');
            return;
        }

        if (!enabled) {
            reevaluateAfterCurrent = false;
            setStatus('脚本启动后自动攻击');
            return;
        }

        if (checking) {
            reevaluateAfterCurrent = true;
            return;
        }

        schedule(0);
    }

    function start() {
        started = true;
        handleStateChanged();
    }

    return {
        checkNow: evaluate,
        getSnapshot,
        handleStateChanged,
        start,
    };
}
