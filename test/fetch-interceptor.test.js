import assert from 'node:assert/strict';
import test from 'node:test';

import {
    installFetchInterceptor,
    isCompetitionResponsePath,
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
