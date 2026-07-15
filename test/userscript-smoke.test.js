import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { Window } from 'happy-dom';

test('生成的 userscript 可以初始化面板和 fetch 拦截器', async () => {
    const window = new Window({
        url: 'https://arcaneangler.com/',
    });
    const castResponse = {
        result: {
            count: 5,
            currentBiome: 1,
            equippedBait: 'bait_1_medium',
            fish: {
                baseGold: 40,
                name: 'Driftstick Dace',
            },
            goldGained: 80,
            rarity: 'Common',
            xpGained: 2421,
        },
        success: true,
    };
    const originalFetch = async (input, init) =>
        String(input).includes('/api/game/cast') && init?.method === 'POST'
            ? new Response(JSON.stringify(castResponse))
            : new Response('{}');
    const globals = {
        DOMParser: window.DOMParser,
        HTMLElement: window.HTMLElement,
        document: window.document,
        localStorage: window.localStorage,
        window,
    };
    const previousGlobals = new Map();

    window.fetch = originalFetch;
    window.matchMedia ??= () => ({ matches: false });
    window.BIOMES = {
        1: {
            name: 'Tinker River',
        },
    };
    window.BAITS = [
        {
            id: 'bait_1_medium',
            name: 'Tinker Larva',
            price: 100,
        },
    ];

    for (const [name, value] of Object.entries(globals)) {
        previousGlobals.set(name, globalThis[name]);
        globalThis[name] = value;
    }

    try {
        const userscript = await readFile(
            'arcaneangler/arcane-angler-auto-cast.user.js',
            'utf8',
        );

        Function(userscript)();

        const host = window.document.getElementById(
            'arcane-angler-auto-cast-panel-host',
        );

        assert.ok(host);
        assert.ok(host.shadowRoot);
        assert.match(host.shadowRoot.textContent, /自动抛竿/);
        assert.ok(host.shadowRoot.querySelector('#auto-biome-toggle'));
        assert.ok(host.shadowRoot.querySelector('#auto-bait-toggle'));
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-status').textContent,
            '未启用',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-grade').value,
            'low',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-minimum-quantity').value,
            '100',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-purchase-quantity').value,
            '100',
        );

        const autoBaitToggle =
            host.shadowRoot.querySelector('#auto-bait-toggle');

        autoBaitToggle.click();
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(autoBaitToggle.checked, true);
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-status').textContent,
            '脚本启动后自动检查',
        );

        autoBaitToggle.click();
        await Promise.resolve();
        assert.equal(
            host.shadowRoot.querySelector('#auto-biome-status').textContent,
            '未启用',
        );
        assert.notEqual(window.fetch, originalFetch);

        await window.fetch('/api/game/cast', {
            body: '{}',
            method: 'POST',
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        host.shadowRoot.querySelector('#earnings-tab').click();

        assert.equal(
            host.shadowRoot.querySelector('#stats-fish-gold').textContent,
            '200',
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-bait-cost').textContent,
            '100',
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-net-gold').textContent,
            '180',
        );
        assert.match(
            host.shadowRoot.querySelector('#stats-scope').textContent,
            /Tinker River · Tinker Larva/,
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-gold').dataset.tone,
            'income',
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-fish-gold').dataset.tone,
            'gold',
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-bait-cost').dataset.tone,
            'cost',
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-net-gold').dataset.tone,
            'positive',
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-net-average').dataset.tone,
            'positive',
        );

        window.BAITS[0].price = 1000;
        await window.fetch('/api/game/cast', {
            body: '{}',
            method: 'POST',
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(
            host.shadowRoot.querySelector('#stats-net-gold').dataset.tone,
            'negative',
        );
        assert.equal(
            host.shadowRoot.querySelector('#stats-net-average').dataset.tone,
            'negative',
        );

        const toggle = host.shadowRoot.querySelector('#toggle');

        toggle.click();
        await Promise.resolve();
        assert.equal(toggle.textContent, '停止');

        toggle.click();
        assert.equal(toggle.textContent, '启动');
        assert.equal(
            host.shadowRoot.querySelector('#status').textContent,
            '已停止',
        );
    } finally {
        for (const [name, previousValue] of previousGlobals) {
            if (previousValue === undefined) {
                delete globalThis[name];
            } else {
                globalThis[name] = previousValue;
            }
        }

        await window.happyDOM.abort();
    }
});
