export const DEFAULT_CLICK_DELAY_SETTINGS = Object.freeze({
    longDelayChancePercent: 8,
    longDelayMaxSeconds: 10,
    longDelayMinSeconds: 5,
    shortDelayMaxSeconds: 2,
    shortDelayMinSeconds: 0.5,
});

const MIN_DELAY_SECONDS = 0.1;
const MAX_DELAY_SECONDS = 3600;

function normalizeDelaySeconds(value, fallback) {
    const seconds = Number(value);

    if (!Number.isFinite(seconds)) {
        return fallback;
    }

    return Math.min(
        MAX_DELAY_SECONDS,
        Math.max(MIN_DELAY_SECONDS, Math.round(seconds * 10) / 10),
    );
}

function normalizeChancePercent(value, fallback) {
    const percent = Number(value);

    if (!Number.isFinite(percent)) {
        return fallback;
    }

    return Math.min(100, Math.max(0, Math.round(percent * 10) / 10));
}

export function normalizeClickDelaySettings(
    settings,
    fallback = DEFAULT_CLICK_DELAY_SETTINGS,
) {
    const shortDelayMinSeconds = normalizeDelaySeconds(
        settings?.shortDelayMinSeconds,
        fallback.shortDelayMinSeconds,
    );
    const shortDelayMaxSeconds = normalizeDelaySeconds(
        settings?.shortDelayMaxSeconds,
        fallback.shortDelayMaxSeconds,
    );
    const longDelayMinSeconds = normalizeDelaySeconds(
        settings?.longDelayMinSeconds,
        fallback.longDelayMinSeconds,
    );
    const longDelayMaxSeconds = normalizeDelaySeconds(
        settings?.longDelayMaxSeconds,
        fallback.longDelayMaxSeconds,
    );

    return {
        longDelayChancePercent: normalizeChancePercent(
            settings?.longDelayChancePercent,
            fallback.longDelayChancePercent,
        ),
        longDelayMaxSeconds: Math.max(longDelayMinSeconds, longDelayMaxSeconds),
        longDelayMinSeconds: Math.min(longDelayMinSeconds, longDelayMaxSeconds),
        shortDelayMaxSeconds: Math.max(
            shortDelayMinSeconds,
            shortDelayMaxSeconds,
        ),
        shortDelayMinSeconds: Math.min(
            shortDelayMinSeconds,
            shortDelayMaxSeconds,
        ),
    };
}

function secondsToMilliseconds(seconds) {
    return Math.round(seconds * 1000);
}

export function getRandomClickDelay(settings, random = Math.random) {
    const normalizedSettings = normalizeClickDelaySettings(settings);
    const isLongDelay =
        random() < normalizedSettings.longDelayChancePercent / 100;
    const minimum = secondsToMilliseconds(
        isLongDelay
            ? normalizedSettings.longDelayMinSeconds
            : normalizedSettings.shortDelayMinSeconds,
    );
    const maximum = secondsToMilliseconds(
        isLongDelay
            ? normalizedSettings.longDelayMaxSeconds
            : normalizedSettings.shortDelayMaxSeconds,
    );

    return {
        milliseconds: Math.floor(random() * (maximum - minimum + 1)) + minimum,
        isLongDelay,
    };
}
