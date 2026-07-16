function isWeatherStreamUrl(url) {
    try {
        return (
            new URL(String(url), window.location.href).pathname ===
            '/api/game/weather/stream'
        );
    } catch {
        return false;
    }
}

/**
 * 复用游戏创建的天气 SSE，不额外建立第二条连接。
 */
export function installEventSourceInterceptor({ onWeatherUpdate } = {}) {
    const OriginalEventSource = window.EventSource;

    if (typeof OriginalEventSource !== 'function') {
        return false;
    }

    window.EventSource = new Proxy(OriginalEventSource, {
        construct(Target, args) {
            const source = Reflect.construct(Target, args);

            if (
                isWeatherStreamUrl(args[0]) &&
                typeof source.addEventListener === 'function'
            ) {
                source.addEventListener('message', (event) => {
                    try {
                        const payload = JSON.parse(event.data);

                        if (payload?.type === 'weather_update') {
                            onWeatherUpdate?.(payload);
                        }
                    } catch (error) {
                        console.warn(
                            '[自动换图] 无法解析游戏天气推送：',
                            error,
                        );
                    }
                });
            }

            return source;
        },
    });

    return true;
}
