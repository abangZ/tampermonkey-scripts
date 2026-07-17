export const userscriptFileName = 'arcane-angler-auto-cast.user.js';
export const userscriptVersion = '2.8.0';

const installUrl =
    'https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/' +
    `arcaneangler/${userscriptFileName}`;

export const userscriptMetadata = {
    name: 'Arcane Angler 自动抛竿',
    namespace: 'arcane-angler-auto-cast',
    version: userscriptVersion,
    author: 'Codex',
    description: '自动抛竿和自动打 Boss，带随机等待和启停控制',
    homepageURL: 'https://github.com/abangZ/tampermonkey-scripts',
    updateURL: installUrl,
    downloadURL: installUrl,
    match: ['https://arcaneangler.com/*', 'https://www.arcaneangler.com/*'],
    'run-at': 'document-start',
    grant: 'none',
};
