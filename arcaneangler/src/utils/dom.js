export function normalizeText(text) {
    return String(text ?? '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function isVisible(element) {
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

export function isDisplayed(element) {
    return (
        isVisible(element) &&
        window.getComputedStyle(element).pointerEvents !== 'none'
    );
}
