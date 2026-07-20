/**
 * 包装页面的 fetch：处理抛竿请求/收益，并复用页面验证码 challenge。
 */
export function installFetchInterceptor({
    onCaptchaChallenge,
    onCaptchaVerified,
    onCastResult,
    onCompetitionResponse,
    onGameStateResponse,
    onQuestResponse,
    onStaffQuestion,
    onStaffQuestionResolved,
    onWeatherResponse,
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

        const requestPayloadPromise =
            method === 'POST' &&
            isGameStateResponsePath(method, url?.pathname) &&
            !isCastResultResponsePath(method, url?.pathname)
                ? readRequestPayload(request, init).catch((error) => {
                      console.warn('[游戏状态] 无法读取请求参数：', error);
                      return undefined;
                  })
                : Promise.resolve(undefined);

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
                void collectCastResponse(
                    response.clone(),
                    url.pathname,
                    onCastResult,
                    onGameStateResponse,
                );
            } catch (error) {
                console.warn('[收益统计] 无法复制抛竿响应：', error);
            }

            return response;
        }

        if (method === 'POST' && url?.pathname === '/api/game/auto-cast') {
            const response = await originalFetch.apply(this, arguments);

            try {
                void collectCastResponse(
                    response.clone(),
                    url.pathname,
                    onCastResult,
                    onGameStateResponse,
                );
            } catch (error) {
                console.warn('[收益统计] 无法复制内置自动钓鱼响应：', error);
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
        } else if (
            method === 'GET' &&
            url?.pathname === '/api/moderation/pending-toast-question'
        ) {
            try {
                void collectStaffQuestionResponse(
                    response.clone(),
                    onStaffQuestion,
                );
            } catch (error) {
                console.warn(
                    '[自动过验证] 无法复制 Staff Question 响应：',
                    error,
                );
            }
        } else if (
            isStaffQuestionResolutionPath(method, url?.pathname) &&
            response.ok
        ) {
            onStaffQuestionResolved?.();
        } else if (
            method === 'GET' &&
            isCompetitionResponsePath(url?.pathname)
        ) {
            try {
                void collectCompetitionResponse(
                    response.clone(),
                    url.pathname,
                    onCompetitionResponse,
                );
            } catch (error) {
                console.warn('[自动换图] 无法复制游戏比赛轮询响应：', error);
            }
        }

        if (method === 'GET' && isWeatherResponsePath(url?.pathname)) {
            try {
                void collectJsonResponse(
                    response.clone(),
                    {
                        method,
                        pathname: url.pathname,
                    },
                    onWeatherResponse,
                    '[自动换图] 无法读取游戏天气响应：',
                );
            } catch (error) {
                console.warn('[自动换图] 无法复制游戏天气响应：', error);
            }
        }

        if (method === 'GET' && isQuestResponsePath(url?.pathname)) {
            try {
                void collectJsonResponse(
                    response.clone(),
                    {
                        method,
                        pathname: url.pathname,
                    },
                    onQuestResponse,
                    '[自动换图] 无法读取游戏每日任务响应：',
                );
            } catch (error) {
                console.warn('[自动换图] 无法复制游戏每日任务响应：', error);
            }
        }

        if (isGameStateResponsePath(method, url?.pathname)) {
            try {
                void collectGameStateResponse(
                    response.clone(),
                    {
                        method,
                        pathname: url.pathname,
                        requestPayloadPromise,
                    },
                    onGameStateResponse,
                );
            } catch (error) {
                console.warn('[游戏状态] 无法复制游戏状态响应：', error);
            }
        }

        return response;
    };
}

export function isGameStateResponsePath(method, pathname) {
    if (method === 'GET') {
        return (
            pathname === '/api/player/data' || pathname === '/api/boats/my-boat'
        );
    }

    return (
        method === 'POST' &&
        [
            '/api/game/cast',
            '/api/game/auto-cast',
            '/api/game/buy-bait',
            '/api/game/change-biome',
            '/api/game/equip-bait',
            '/api/game/equip-rod',
        ].includes(pathname)
    );
}

export function isCastResultResponsePath(method, pathname) {
    return (
        method === 'POST' &&
        (pathname === '/api/game/cast' || pathname === '/api/game/auto-cast')
    );
}

export function isWeatherResponsePath(pathname) {
    return (
        pathname === '/api/game/weather' ||
        /^\/api\/game\/weather\/\d+$/.test(pathname ?? '')
    );
}

export function isQuestResponsePath(pathname) {
    return pathname === '/api/quests';
}

export function isStaffQuestionResolutionPath(method, pathname) {
    return (
        method === 'POST' &&
        /^\/api\/moderation\/(?:answer|dismiss)-toast-question\/[^/]+$/.test(
            pathname ?? '',
        )
    );
}

export function isCompetitionResponsePath(pathname) {
    return (
        pathname === '/api/guild/tournaments/current' ||
        pathname === '/api/derby/current' ||
        pathname === '/api/guild/my-guild' ||
        /^\/api\/guild\/tournaments\/[^/]+\/standings$/.test(pathname ?? '')
    );
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

async function readRequestPayload(request, init) {
    let body = init?.body;

    if (body === undefined && request) {
        body = await request.clone().text();
    }

    return normalizeRequestBody(body);
}

async function collectStaffQuestionResponse(response, onStaffQuestion) {
    if (!response.ok || typeof onStaffQuestion !== 'function') {
        return;
    }

    try {
        const payload = await response.json();
        const pending = payload?.pending;

        onStaffQuestion(
            pending?.id != null && typeof pending.question === 'string'
                ? pending
                : null,
        );
    } catch (error) {
        console.warn('[自动过验证] 无法读取 Staff Question 响应：', error);
    }
}

async function collectCastResponse(
    response,
    pathname,
    onCastResult,
    onGameStateResponse,
) {
    if (!response.ok) {
        return;
    }

    try {
        const payload = await response.json();

        const result = payload?.result ?? payload;

        if (
            payload?.success !== true ||
            !result ||
            typeof result !== 'object'
        ) {
            return;
        }

        onGameStateResponse?.({
            method: 'POST',
            pathname,
            payload,
        });
        onCastResult?.(result);
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

        const hasLegacySvg = typeof challenge?.bgSvg === 'string';
        const hasImagePuzzle =
            typeof challenge?.bgImage === 'string' &&
            typeof challenge?.pieceSvg === 'string';

        if (!challenge?.token || (!hasLegacySvg && !hasImagePuzzle)) {
            return;
        }

        onCaptchaChallenge(challenge);
    } catch (error) {
        console.warn('[自动过验证] 无法读取验证码 challenge 响应：', error);
    }
}

async function collectCompetitionResponse(response, pathname, callback) {
    if (!response.ok || typeof callback !== 'function') {
        return;
    }

    try {
        const payload = await response.json();

        callback({ pathname, payload });
    } catch (error) {
        console.warn('[自动换图] 无法读取游戏比赛轮询响应：', error);
    }
}

async function collectJsonResponse(response, context, callback, warning) {
    if (!response.ok || typeof callback !== 'function') {
        return;
    }

    try {
        const payload = await response.json();

        callback({ ...context, payload });
    } catch (error) {
        console.warn(warning, error);
    }
}

async function collectGameStateResponse(response, context, callback) {
    if (!response.ok || typeof callback !== 'function') {
        return;
    }

    try {
        const [payload, requestPayload] = await Promise.all([
            response.json(),
            context.requestPayloadPromise,
        ]);

        callback({
            method: context.method,
            pathname: context.pathname,
            payload,
            requestPayload,
        });
    } catch (error) {
        console.warn('[游戏状态] 无法读取游戏状态响应：', error);
    }
}
