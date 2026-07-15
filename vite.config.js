import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

import {
    userscriptFileName,
    userscriptMetadata,
} from './arcaneangler/userscript.config.js';

const generatedNotice =
    '/* 此文件由 pnpm build 自动生成，请修改 arcaneangler/src 下的源码。 */';
const disclaimer = `/**
 * 免责声明：
 * 本脚本仅供学习与个人研究使用。使用者应自行遵守目标网站的服务条款、
 * 使用规则及所在地法律法规。因使用本脚本产生的账号限制、数据损失或
 * 其他直接、间接后果，均由使用者自行承担，脚本作者不承担相关责任。
 */`;

export default defineConfig({
    build: {
        outDir: 'arcaneangler/.dist',
        emptyOutDir: true,
        minify: false,
        sourcemap: false,
    },
    plugins: [
        monkey({
            entry: 'arcaneangler/src/main.js',
            userscript: userscriptMetadata,
            generate({ userscript }) {
                return `${userscript}\n\n${generatedNotice}\n${disclaimer}`;
            },
            server: {
                open: false,
            },
            build: {
                fileName: userscriptFileName,
                autoGrant: false,
            },
        }),
    ],
});
