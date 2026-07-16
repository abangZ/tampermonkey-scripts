import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
    userscriptFileName,
    userscriptVersion,
} from '../arcaneangler/userscript.config.js';

const userscriptPath = resolve('arcaneangler', userscriptFileName);
const userscript = await readFile(userscriptPath, 'utf8');
const requiredMetadata = [
    '// ==UserScript==',
    `// @version      ${userscriptVersion}`,
    '// @run-at       document-start',
    '// @grant        none',
    '// ==/UserScript==',
];

for (const metadata of requiredMetadata) {
    if (!userscript.includes(metadata)) {
        throw new Error(`生成文件缺少 metadata：${metadata}`);
    }
}

if (!userscript.includes('此文件由 pnpm build 自动生成')) {
    throw new Error('生成文件缺少自动生成提示');
}

console.info('Userscript metadata verified');
