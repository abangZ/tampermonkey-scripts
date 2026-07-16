import { CONFIG } from './config.js';
import { sleep } from './utils/time.js';

export function formatScheduleDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) {
        return `${seconds} 秒`;
    }

    return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`;
}

export function createScheduleController({
    getCaptcha,
    getState,
    onWorkStarted,
    renderSettings,
    renderStatus,
    setNextDelay,
    setStatus,
}) {
    let phase = 'work';
    let endsAt = 0;
    let duration = 0;

    function getRandomizedDuration(baseMinutes) {
        const extraRatio =
            CONFIG.scheduleRandomExtraRatioMin +
            Math.random() *
                (CONFIG.scheduleRandomExtraRatioMax -
                    CONFIG.scheduleRandomExtraRatioMin);

        return Math.round(baseMinutes * (1 + extraRatio) * 60000);
    }

    function reset() {
        phase = 'work';
        endsAt = 0;
        duration = 0;
        renderSettings();
    }

    function startPhase(nextPhase) {
        const { scheduleSettings } = getState();
        const baseMinutes =
            nextPhase === 'rest'
                ? scheduleSettings.restMinutes
                : scheduleSettings.workMinutes;

        phase = nextPhase;
        duration = getRandomizedDuration(baseMinutes);
        endsAt = Date.now() + duration;
        renderSettings();

        if (nextPhase === 'work') {
            onWorkStarted?.();
        }

        console.info(
            `[自动抛竿] 本轮${nextPhase === 'rest' ? '休息' : '运行'}时长：` +
                formatScheduleDuration(duration),
        );
    }

    function isWorkExpired() {
        const { scheduleSettings } = getState();

        return (
            scheduleSettings.enabled &&
            phase === 'work' &&
            endsAt > 0 &&
            Date.now() >= endsAt
        );
    }

    function shouldEnterRest(currentLoopId) {
        const { enabled, loopId } = getState();
        const captcha = getCaptcha();

        return (
            enabled &&
            currentLoopId === loopId &&
            !captcha.isBypassInProgress() &&
            !captcha.hasActiveChallenge() &&
            isWorkExpired()
        );
    }

    async function waitForWork(currentLoopId) {
        if (!getState().scheduleSettings.enabled) {
            return true;
        }

        if (endsAt === 0) {
            startPhase('work');
        }

        while (true) {
            const { enabled, loopId, scheduleSettings } = getState();

            if (!enabled || currentLoopId !== loopId) {
                return false;
            }

            if (!scheduleSettings.enabled) {
                reset();
                return true;
            }

            if (phase === 'work') {
                if (!isWorkExpired()) {
                    return true;
                }

                startPhase('rest');
            }

            // 休息阶段仍处理运行周期末尾遗留的验证码。
            if (getCaptcha().stopIfChallengeFound()) {
                return false;
            }

            const remaining = endsAt - Date.now();

            if (remaining <= 0) {
                startPhase('work');
                return true;
            }

            setStatus('定时休息中');
            setNextDelay(`剩余 ${formatScheduleDuration(remaining)}`);
            renderStatus(remaining);

            await sleep(Math.min(1000, remaining));
        }
    }

    return {
        getSnapshot() {
            return {
                scheduleDuration: duration,
                scheduleEndsAt: endsAt,
                schedulePhase: phase,
            };
        },
        isWorkExpired,
        reset,
        shouldEnterRest,
        startWork() {
            startPhase('work');
        },
        waitForWork,
    };
}
