import { normalizeText } from './utils/dom.js';

export function isCooldownButton(button, buttonText) {
    const text = normalizeText(button?.textContent);
    const disabled =
        Boolean(button?.disabled) ||
        button?.getAttribute?.('aria-disabled') === 'true';

    return disabled && text.includes(buttonText);
}

export function createCooldownWatchdog(timeoutMilliseconds) {
    let startedAt = null;
    let timedOut = false;

    return {
        observe(isCoolingDown, now = Date.now()) {
            if (!isCoolingDown) {
                startedAt = null;
                return false;
            }

            if (timedOut) {
                return false;
            }

            if (startedAt === null) {
                startedAt = now;
                return false;
            }

            if (now - startedAt < timeoutMilliseconds) {
                return false;
            }

            timedOut = true;
            return true;
        },
    };
}

export function createFishingActivityWatchdog(now = Date.now()) {
    let lastFishingAt = now;
    let timedOut = false;

    return {
        markFishing(nextNow = Date.now()) {
            lastFishingAt = nextNow;
            timedOut = false;
        },
        observe(timeoutMilliseconds, nextNow = Date.now()) {
            if (timedOut || nextNow - lastFishingAt < timeoutMilliseconds) {
                return false;
            }

            timedOut = true;
            return true;
        },
    };
}
