import assert from 'node:assert/strict';
import test from 'node:test';

import {
    installFetchInterceptor,
    isCompetitionResponsePath,
    isGameStateResponsePath,
    isQuestResponsePath,
    isWeatherResponsePath,
    modifyCastRequest,
    normalizeRequestBody,
} from '../arcaneangler/src/network/fetch-interceptor.js';

test('抛竿 payload 会保留字段并将 isTrusted 改为 true', async () => {
    const result = await modifyCastRequest('/api/game/cast', null, {
        body: JSON.stringify({ baitId: 42, isTrusted: false }),
        method: 'POST',
    });

    assert.deepEqual(JSON.parse(result.init.body), {
        baitId: 42,
        isTrusted: true,
    });
});

test('请求体归一化支持 JSON 和 URLSearchParams', async () => {
    assert.deepEqual(await normalizeRequestBody('{"count":2}'), {
        count: 2,
    });
    assert.deepEqual(
        await normalizeRequestBody(new URLSearchParams('bait=worm')),
        { bait: 'worm' },
    );
});

test('只 hook 游戏已有的比赛与公会轮询接口', () => {
    assert.equal(
        isCompetitionResponsePath('/api/guild/tournaments/current'),
        true,
    );
    assert.equal(isCompetitionResponsePath('/api/derby/current'), true);
    assert.equal(isCompetitionResponsePath('/api/guild/my-guild'), true);
    assert.equal(
        isCompetitionResponsePath('/api/guild/tournaments/42/standings'),
        true,
    );
    assert.equal(isCompetitionResponsePath('/api/game/weather'), false);
    assert.equal(isCompetitionResponsePath('/api/game/player'), false);
});

test('会识别角色状态和天气响应路径', () => {
    assert.equal(isGameStateResponsePath('GET', '/api/player/data'), true);
    assert.equal(isGameStateResponsePath('GET', '/api/boats/my-boat'), true);
    assert.equal(isGameStateResponsePath('POST', '/api/game/buy-bait'), true);
    assert.equal(isGameStateResponsePath('GET', '/api/game/buy-bait'), false);
    assert.equal(isWeatherResponsePath('/api/game/weather'), true);
    assert.equal(isWeatherResponsePath('/api/game/weather/4'), true);
    assert.equal(isWeatherResponsePath('/api/game/weather/stream'), false);
    assert.equal(isQuestResponsePath('/api/quests'), true);
    assert.equal(isQuestResponsePath('/api/quests/daily'), false);
});

test('fetch hook 会读取比赛轮询响应且不改变原响应', async () => {
    const previousWindow = globalThis.window;
    const payload = {
        active: {
            biome_id: 5,
            id: 12,
        },
    };
    const captured = [];

    globalThis.window = {
        async fetch() {
            return new Response(JSON.stringify(payload));
        },
        location: {
            href: 'https://arcaneangler.com/',
        },
    };

    try {
        installFetchInterceptor({
            onCompetitionResponse(response) {
                captured.push(response);
            },
        });

        const response = await window.fetch(
            'https://arcaneangler.com/api/guild/tournaments/current',
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(await response.json(), payload);
        assert.deepEqual(captured, [
            {
                pathname: '/api/guild/tournaments/current',
                payload,
            },
        ]);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('fetch hook 会同时提供游戏状态响应和请求参数', async () => {
    const previousWindow = globalThis.window;
    const captured = [];
    const payload = {
        newBaitQuantity: 150,
        success: true,
    };

    globalThis.window = {
        async fetch() {
            return new Response(JSON.stringify(payload));
        },
        location: {
            href: 'https://arcaneangler.com/',
        },
    };

    try {
        installFetchInterceptor({
            onGameStateResponse(response) {
                captured.push(response);
            },
        });

        const response = await window.fetch(
            'https://arcaneangler.com/api/game/buy-bait',
            {
                body: JSON.stringify({
                    baitName: 'bait_3_medium',
                    quantity: 100,
                }),
                method: 'POST',
            },
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(await response.json(), payload);
        assert.deepEqual(captured, [
            {
                method: 'POST',
                pathname: '/api/game/buy-bait',
                payload,
                requestPayload: {
                    baitName: 'bait_3_medium',
                    quantity: 100,
                },
            },
        ]);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('fetch hook 会读取游戏自身的天气响应', async () => {
    const previousWindow = globalThis.window;
    const captured = [];
    const payload = {
        weather: 'rain',
        xpBonus: 25,
    };

    globalThis.window = {
        async fetch() {
            return new Response(JSON.stringify(payload));
        },
        location: {
            href: 'https://arcaneangler.com/',
        },
    };

    try {
        installFetchInterceptor({
            onWeatherResponse(response) {
                captured.push(response);
            },
        });

        await window.fetch('https://arcaneangler.com/api/game/weather/4');
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.deepEqual(captured, [
            {
                method: 'GET',
                pathname: '/api/game/weather/4',
                payload,
            },
        ]);
    } finally {
        globalThis.window = previousWindow;
    }
});

test('fetch hook 会读取每日任务响应且不改变原响应', async () => {
    const previousWindow = globalThis.window;
    const captured = [];
    const payload = {
        quests: {
            daily: [
                {
                    completed: 0,
                    metadata: {
                        targetBiome: 1,
                    },
                },
            ],
        },
        success: true,
    };

    globalThis.window = {
        async fetch() {
            return new Response(JSON.stringify(payload));
        },
        location: {
            href: 'https://arcaneangler.com/',
        },
    };

    try {
        installFetchInterceptor({
            onQuestResponse(response) {
                captured.push(response);
            },
        });

        const response = await window.fetch(
            'https://arcaneangler.com/api/quests',
        );

        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.deepEqual(await response.json(), payload);
        assert.deepEqual(captured, [
            {
                method: 'GET',
                pathname: '/api/quests',
                payload,
            },
        ]);
    } finally {
        globalThis.window = previousWindow;
    }
});
