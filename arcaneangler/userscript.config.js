export const userscriptFileName = 'arcane-angler-auto-cast.user.js';
export const userscriptVersion = '3.0.0';

const installUrl =
    'https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/' +
    `arcaneangler/${userscriptFileName}`;

export const userscriptMetadata = {
    name: 'Arcane Angler 自动抛竿',
    namespace: 'arcane-angler-auto-cast',
    version: userscriptVersion,
    author: 'Codex',
    description: '支持脚本和游戏内置自动钓鱼、自动打 Boss 与定时休息',
    homepageURL: 'https://github.com/abangZ/tampermonkey-scripts',
    updateURL: installUrl,
    downloadURL: installUrl,
    match: [
        'https://arcaneangler.com/*',
        'https://www.arcaneangler.com/*',
        'http://103.217.186.170:3000/*',
    ],
    'run-at': 'document-start',
    grant: 'none',
};
