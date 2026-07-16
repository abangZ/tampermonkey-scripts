import assert from 'node:assert/strict';
import test from 'node:test';

import { installEventSourceInterceptor } from '../arcaneangler/src/network/event-source-interceptor.js';

class FakeEventSource extends EventTarget {
    constructor(url) {
        super();
        this.url = url;
    }

    emit(payload) {
        const event = new Event('message');

        event.data = JSON.stringify(payload);
        this.dispatchEvent(event);
    }
}

test('EventSource hook 会复用游戏天气连接并保留原监听器', () => {
    const previousWindow = globalThis.window;
    const captured = [];
    const originalMessages = [];

    globalThis.window = {
        EventSource: FakeEventSource,
        location: {
            href: 'https://arcaneangler.com/',
        },
    };

    try {
        assert.equal(
            installEventSourceInterceptor({
                onWeatherUpdate(payload) {
                    captured.push(payload);
                },
            }),
            true,
        );

        const source = new window.EventSource(
            'https://arcaneangler.com/api/game/weather/stream',
        );

        source.addEventListener('message', (event) => {
            originalMessages.push(JSON.parse(event.data));
        });
        source.emit({
            type: 'weather_update',
            weather: {
                1: { weather: 'rain', xpBonus: 25 },
            },
        });

        assert.equal(source instanceof FakeEventSource, true);
        assert.equal(captured.length, 1);
        assert.equal(originalMessages.length, 1);
        assert.deepEqual(captured, originalMessages);
    } finally {
        globalThis.window = previousWindow;
    }
});
