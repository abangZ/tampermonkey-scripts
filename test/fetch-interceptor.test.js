import assert from 'node:assert/strict';
import test from 'node:test';

import {
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
