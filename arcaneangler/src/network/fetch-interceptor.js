/**
 * 包装页面的 fetch：处理抛竿请求/收益，并复用页面验证码 challenge。
 */
export function installFetchInterceptor({
    onCaptchaChallenge,
    onCaptchaVerified,
    onCastResult,
}) {
    const originalFetch = window.fetch;

    window.fetch = async function (input, init) {
        const request = input instanceof Request ? input : null;
        const method = String(
            init?.method ?? request?.method ?? 'GET',
        ).toUpperCase();

        let url = null;

        try {
            url = new URL(request?.url ?? String(input), window.location.href);
        } catch {
            // URL 无法解析时保持原 fetch 行为。
        }

        if (method === 'POST' && url?.pathname === '/api/game/cast') {
            const modifiedRequest = await modifyCastRequest(
                input,
                request,
                init,
            );

            const response = modifiedRequest
                ? await originalFetch.call(
                      this,
                      modifiedRequest.input,
                      modifiedRequest.init,
                  )
                : await originalFetch.apply(this, arguments);

            try {
                void collectCastResponse(response.clone(), onCastResult);
            } catch (error) {
                console.warn('[收益统计] 无法复制抛竿响应：', error);
            }

            return response;
        }

        const response = await originalFetch.apply(this, arguments);

        if (
            method === 'GET' &&
            url?.pathname === '/api/game/captcha-challenge'
        ) {
            try {
                void collectCaptchaChallengeResponse(
                    response.clone(),
                    onCaptchaChallenge,
                );
            } catch (error) {
                console.warn(
                    '[自动过验证] 无法复制验证码 challenge 响应：',
                    error,
                );
            }
        } else if (
            method === 'POST' &&
            url?.pathname === '/api/game/captcha-verified' &&
            response.ok
        ) {
            onCaptchaVerified();
        }

        return response;
    };
}

export async function modifyCastRequest(input, request, init) {
    try {
        let body = init?.body;

        if (body === undefined && request) {
            body = await request.clone().text();
        }

        const originalPayload = await normalizeRequestBody(body);

        if (
            !originalPayload ||
            typeof originalPayload !== 'object' ||
            Array.isArray(originalPayload)
        ) {
            throw new TypeError('payload 不是可修改的对象');
        }

        const payload = {
            ...originalPayload,
            isTrusted: true,
        };

        console.info('[自动抛竿] POST /api/game/cast payload:', payload);

        const modifiedBody = JSON.stringify(payload);

        if (init?.body !== undefined || !request) {
            return {
                input,
                init: {
                    ...init,
                    body: modifiedBody,
                },
            };
        }

        return {
            input: new Request(request, {
                body: modifiedBody,
            }),
            init,
        };
    } catch (error) {
        console.warn(
            '[自动抛竿] 无法修改 POST /api/game/cast payload，保留原请求：',
            error,
        );

        return null;
    }
}

export async function normalizeRequestBody(body) {
    if (body == null) {
        return body;
    }

    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return body;
        }
    }

    if (body instanceof URLSearchParams) {
        return Object.fromEntries(body.entries());
    }

    if (body instanceof FormData) {
        return Object.fromEntries(body.entries());
    }

    if (body instanceof Blob) {
        return normalizeRequestBody(await body.text());
    }

    return body;
}

async function collectCastResponse(response, onCastResult) {
    if (!response.ok) {
        return;
    }

    try {
        const payload = await response.json();

        if (
            payload?.success !== true ||
            !payload.result ||
            typeof payload.result !== 'object'
        ) {
            return;
        }

        onCastResult(payload.result);
    } catch (error) {
        console.warn('[收益统计] 无法读取抛竿响应：', error);
    }
}

async function collectCaptchaChallengeResponse(response, onCaptchaChallenge) {
    if (!response.ok) {
        return;
    }

    try {
        const payload = await response.json();
        const challenge = payload?.result ?? payload;

        if (!challenge?.token || typeof challenge.bgSvg !== 'string') {
            return;
        }

        onCaptchaChallenge(challenge);
    } catch (error) {
        console.warn('[自动过验证] 无法读取验证码 challenge 响应：', error);
    }
}
