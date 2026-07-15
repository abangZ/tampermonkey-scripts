import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { userscriptFileName } from '../arcaneangler/userscript.config.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = resolve(rootDir, 'arcaneangler/.dist', userscriptFileName);
const targetFile = resolve(rootDir, 'arcaneangler', userscriptFileName);

await mkdir(dirname(targetFile), { recursive: true });
await copyFile(sourceFile, targetFile);

console.info(`Published ${userscriptFileName}`);
