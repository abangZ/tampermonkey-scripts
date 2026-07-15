import { HUMAN_VERIFICATION_MESSAGE } from './config.js';

export async function sendHumanVerificationNotification({
    notificationMode,
    pushKey,
}) {
    if (notificationMode === 'browser') {
        sendBrowserHumanVerificationNotification();
        return;
    }

    await sendServerHumanVerificationNotification(pushKey);
}

async function sendServerHumanVerificationNotification(pushKey) {
    const currentPushKey = pushKey.trim();

    if (!currentPushKey) {
        console.info(
            '[自动抛竿] 未设置消息推送 Key，跳过验证码通知。' +
                '可前往 https://sct.ftqq.com/ 获取 SendKey。',
        );
        return;
    }

    const url =
        `https://sctapi.ftqq.com/${encodeURIComponent(currentPushKey)}` +
        `.send?title=${encodeURIComponent(HUMAN_VERIFICATION_MESSAGE)}`;

    try {
        const response = await window.fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.info('[自动抛竿] 验证码通知已发送。');
    } catch (error) {
        console.warn('[自动抛竿] 验证码通知发送失败：', error);
    }
}

function sendBrowserHumanVerificationNotification() {
    if (typeof window.Notification !== 'function') {
        console.warn('[自动抛竿] 当前浏览器不支持系统通知。');
        return;
    }

    if (window.Notification.permission !== 'granted') {
        console.warn('[自动抛竿] 浏览器通知尚未授权，跳过验证码通知。');
        return;
    }

    try {
        const notification = new window.Notification('Arcane Angler 人机验证', {
            body: HUMAN_VERIFICATION_MESSAGE,
            tag: 'arcane-angler-human-verification',
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
        };

        console.info('[自动抛竿] 浏览器验证码通知已发送。');
    } catch (error) {
        console.warn('[自动抛竿] 浏览器验证码通知发送失败：', error);
    }
}

export async function requestBrowserNotificationPermission() {
    if (typeof window.Notification !== 'function') {
        return;
    }

    try {
        await window.Notification.requestPermission();
    } catch (error) {
        console.warn('[自动抛竿] 请求浏览器通知权限失败：', error);
    }
}
