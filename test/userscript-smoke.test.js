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

        window.localStorage.setItem(
            'arcane-angler-verification-history-v1',
            JSON.stringify([
                { success: true, timestamp: Date.UTC(2026, 6, 19, 12, 0, 0) },
                {
                    success: false,
                    timestamp: Date.UTC(2026, 6, 19, 11, 30, 0),
                },
            ]),
        );
        window.document.body.remove();
        Function(userscript)();

        assert.notEqual(window.fetch, originalFetch);
        assert.equal(
            window.document.getElementById(
                'arcane-angler-auto-cast-panel-host',
            ),
            null,
        );

        window.document.documentElement.appendChild(
            window.document.createElement('body'),
        );
        window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

        const host = window.document.getElementById(
            'arcane-angler-auto-cast-panel-host',
        );

        assert.ok(host);
        assert.ok(host.shadowRoot);
        assert.match(host.shadowRoot.textContent, /自动抛竿/);
        assert.equal(
            host.shadowRoot.querySelector('.hint-version')?.textContent,
            'v2.18.0',
        );
        assert.ok(host.shadowRoot.querySelector('#auto-biome-toggle'));
        const autoBiomePriorityList = host.shadowRoot.querySelector(
            '#auto-biome-priority-list',
        );
        const getAutoBiomePriorityOrder = () =>
            Array.from(autoBiomePriorityList.children, (item) =>
                item.getAttribute('data-priority-id'),
            );

        assert.deepEqual(getAutoBiomePriorityOrder(), [
            'guildCompetition',
            'personalCompetition',
            'arcaneSurge',
            'goldBreeze',
            'dailyQuest',
            'weightedExperience',
        ]);
        assert.ok(
            Array.from(autoBiomePriorityList.children).every(
                (item) => item.getAttribute('draggable') === 'true',
            ),
        );
        const goldBreezePriorityItem = autoBiomePriorityList.querySelector(
            '[data-priority-id="goldBreeze"]',
        );
        const arcaneSurgePriorityItem = autoBiomePriorityList.querySelector(
            '[data-priority-id="arcaneSurge"]',
        );
        const dragOverEvent = new window.Event('dragover', {
            bubbles: true,
            cancelable: true,
        });

        Object.defineProperty(dragOverEvent, 'clientY', { value: -1 });
        goldBreezePriorityItem.dispatchEvent(
            new window.Event('dragstart', { bubbles: true }),
        );
        arcaneSurgePriorityItem.dispatchEvent(dragOverEvent);
        goldBreezePriorityItem.dispatchEvent(
            new window.Event('dragend', { bubbles: true }),
        );
        assert.deepEqual(getAutoBiomePriorityOrder(), [
            'guildCompetition',
            'personalCompetition',
            'goldBreeze',
            'arcaneSurge',
            'dailyQuest',
            'weightedExperience',
        ]);
        goldBreezePriorityItem.querySelector('[data-direction="1"]').click();
        autoBiomePriorityList
            .querySelector(
                '[data-priority-id="dailyQuest"] [data-direction="-1"]',
            )
            .click();
        assert.deepEqual(
            JSON.parse(
                window.localStorage.getItem(
                    'arcane-angler-auto-biome-settings-v1',
                ),
            ).priorityOrder,
            [
                'guildCompetition',
                'personalCompetition',
                'arcaneSurge',
                'dailyQuest',
                'goldBreeze',
                'weightedExperience',
            ],
        );
        autoBiomePriorityList
            .querySelector(
                '[data-priority-id="weightedExperience"] [data-direction="-1"]',
            )
            .click();
        assert.equal(
            autoBiomePriorityList
                .querySelector('[data-priority-id="goldBreeze"]')
                .getAttribute('data-enabled'),
            'false',
        );
        assert.deepEqual(
            JSON.parse(
                window.localStorage.getItem(
                    'arcane-angler-auto-biome-settings-v1',
                ),
            ).priorityOrder,
            [
                'guildCompetition',
                'personalCompetition',
                'arcaneSurge',
                'dailyQuest',
                'weightedExperience',
                'goldBreeze',
            ],
        );
        assert.ok(host.shadowRoot.querySelector('#auto-bait-toggle'));
        assert.ok(host.shadowRoot.querySelector('#auto-boss-toggle'));
        assert.ok(host.shadowRoot.querySelector('#game-auto-fishing-toggle'));
        assert.equal(
            host.shadowRoot.querySelector('#game-auto-fishing-bait-grade')
                .value,
            'auto',
        );
        assert.equal(
            host.shadowRoot.querySelector('#game-auto-fishing-status')
                .textContent,
            '已停止',
        );
        assert.equal(
            host.shadowRoot.querySelector('#schedule-game-auto-fishing-toggle')
                .checked,
            false,
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-boss-status').textContent,
            '未启用',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-status').textContent,
            '未启用',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-regular-grade').value,
            'low',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-personal-grade').value,
            'low',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-guild-grade').value,
            'low',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-gold-breeze-grade').value,
            'default',
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-minimum-quantity').value,
            '100',
        );
        assert.equal(
            host.shadowRoot.querySelector('#idle-reload-minutes').value,
            '5',
        );
        assert.equal(
            host.shadowRoot.querySelector('#short-delay-min-seconds').value,
            '0.5',
        );
        assert.equal(
            host.shadowRoot.querySelector('#short-delay-max-seconds').value,
            '2',
        );
        assert.equal(
            host.shadowRoot.querySelector('#long-delay-min-seconds').value,
            '5',
        );
        assert.equal(
            host.shadowRoot.querySelector('#long-delay-max-seconds').value,
            '10',
        );
        assert.equal(
            host.shadowRoot.querySelector('#long-delay-chance-percent').value,
            '8',
        );

        const longDelayChanceInput = host.shadowRoot.querySelector(
            '#long-delay-chance-percent',
        );

        longDelayChanceInput.value = '12.5';
        longDelayChanceInput.dispatchEvent(
            new window.Event('change', { bubbles: true }),
        );
        assert.equal(
            JSON.parse(
                window.localStorage.getItem(
                    'arcane-angler-click-delay-settings-v1',
                ),
            ).longDelayChancePercent,
            12.5,
        );
        assert.equal(
            host.shadowRoot.querySelectorAll('details.settings-section').length,
            8,
        );
        const verificationHistoryItems = host.shadowRoot.querySelectorAll(
            '.verification-history-item',
        );

        assert.equal(verificationHistoryItems.length, 2);
        assert.equal(
            verificationHistoryItems[0].querySelector(
                '.verification-history-status',
            ).textContent,
            '成功',
        );
        assert.equal(
            verificationHistoryItems[1].querySelector(
                '.verification-history-status',
            ).textContent,
            '失败',
        );
        assert.equal(
            host.shadowRoot.querySelector('details.settings-section').open,
            false,
        );
        assert.equal(
            host.shadowRoot.querySelector('#auto-bait-purchase-quantity').value,
            '100',
        );

        const gameAutoFishingToggle = host.shadowRoot.querySelector(
            '#game-auto-fishing-toggle',
        );
        const gameAutoFishingBaitGrade = host.shadowRoot.querySelector(
            '#game-auto-fishing-bait-grade',
        );

        assert.equal(gameAutoFishingBaitGrade.value, 'auto');
        assert.equal(
            gameAutoFishingBaitGrade.querySelector('option[value="auto"]')
                ?.textContent,
            '自动选择（使用自动鱼饵设置）',
        );

        gameAutoFishingBaitGrade.value = 'high';
        gameAutoFishingBaitGrade.dispatchEvent(
            new window.Event('change', { bubbles: true }),
        );

        gameAutoFishingToggle.click();
        assert.deepEqual(
            JSON.parse(
                window.localStorage.getItem(
                    'arcane-angler-game-auto-fishing-settings-v1',
                ),
            ),
            { baitGrade: 'high', enabled: true },
        );
        gameAutoFishingToggle.click();

        const autoBaitPurchaseSettings = host.shadowRoot.querySelector(
            '#auto-bait-purchase-settings',
        );
        const scheduleGameAutoFishingToggle = host.shadowRoot.querySelector(
            '#schedule-game-auto-fishing-toggle',
        );
        const setBaitGrade = (selector, value) => {
            const input = host.shadowRoot.querySelector(selector);

            input.value = value;
            input.dispatchEvent(new window.Event('change', { bubbles: true }));
        };

        for (const selector of [
            '#auto-bait-regular-grade',
            '#auto-bait-personal-grade',
            '#auto-bait-guild-grade',
        ]) {
            setBaitGrade(selector, 'default');
        }

        assert.equal(autoBaitPurchaseSettings.hidden, true);
        gameAutoFishingToggle.click();
        assert.equal(autoBaitPurchaseSettings.hidden, false);
        gameAutoFishingToggle.click();
        assert.equal(autoBaitPurchaseSettings.hidden, true);
        scheduleGameAutoFishingToggle.click();
        assert.equal(autoBaitPurchaseSettings.hidden, false);
        scheduleGameAutoFishingToggle.click();
        assert.equal(autoBaitPurchaseSettings.hidden, true);

        for (const selector of [
            '#auto-bait-regular-grade',
            '#auto-bait-personal-grade',
            '#auto-bait-guild-grade',
        ]) {
            setBaitGrade(selector, 'low');
        }
        assert.equal(autoBaitPurchaseSettings.hidden, false);

        const autoBaitMinimumQuantity = host.shadowRoot.querySelector(
            '#auto-bait-minimum-quantity',
        );
        const autoBaitPurchaseQuantity = host.shadowRoot.querySelector(
            '#auto-bait-purchase-quantity',
        );
        const autoBaitToggle =
            host.shadowRoot.querySelector('#auto-bait-toggle');

        autoBaitMinimumQuantity.value = '';
        autoBaitMinimumQuantity.dispatchEvent(
            new window.Event('input', { bubbles: true }),
        );
        autoBaitToggle.click();
        autoBaitToggle.click();
        await Promise.resolve();
        assert.equal(autoBaitMinimumQuantity.value, '');

        autoBaitMinimumQuantity.value = '75';
        autoBaitMinimumQuantity.dispatchEvent(
            new window.Event('input', { bubbles: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 350));
        assert.equal(
            JSON.parse(
                window.localStorage.getItem(
                    'arcane-angler-auto-bait-settings-v1',
                ),
            ).minimumQuantity,
            75,
        );
        autoBaitPurchaseQuantity.value = '1000';
        autoBaitPurchaseQuantity.dispatchEvent(
            new window.Event('change', { bubbles: true }),
        );

        assert.deepEqual(
            JSON.parse(
                window.localStorage.getItem(
                    'arcane-angler-auto-bait-settings-v1',
                ),
            ),
            {
                enabled: false,
                goldBreezeBaitGrade: 'default',
                guildCompetitionBaitGrade: 'low',
                minimumQuantity: 75,
                personalCompetitionBaitGrade: 'low',
                purchaseQuantity: 1000,
                regularBaitGrade: 'low',
            },
        );

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
