# Tampermonkey Scripts

个人使用的 Tampermonkey 脚本合集。

## Arcane Angler 自动抛竿

为 [Arcane Angler](https://arcaneangler.com/) 提供自动抛竿、验证码检测和消息通知功能。

### 功能

- 自动查找并点击“抛竿线”按钮。
- 使用随机操作间隔，并以较低概率加入更长等待。
- 在抛竿请求发出前将 payload 中的 `isTrusted` 修改为 `true`。
- 检测到页面出现“人机验证”时默认自动尝试完成验证，并随机模拟观察题面、操作滑块和确认结果的耗时；可在控制面板中关闭。
- 自动过验证失败或该功能关闭时，会停止自动操作，并支持通过 Server酱或浏览器通知提醒。
- 在收益面板中统计鱼获、金币等收益，收获分类使用中文名称和稀有度颜色展示。
- 提供独立设置页，可配置通知方式、Server酱 SendKey 和定时休息。
- 定时休息支持设置每轮运行和休息分钟数，实际时长会加入 -5%～+10% 的随机时间。
- 支持收起控制面板，移动端首次使用时默认折叠。
- 自动保存启停状态、自动过验证设置、通知方式、定时休息设置和面板折叠状态。
- 支持通过 `@updateURL` 自动检查脚本更新。

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展。
2. 点击 [安装 Arcane Angler 自动抛竿脚本](https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js)。
3. 在 Tampermonkey 打开的安装页面中确认安装。
4. 访问 [arcaneangler.com](https://arcaneangler.com/)。

### 使用

- 点击页面右下角控制面板中的“启动”或“停止”。
- “自动过验证”默认开启，可通过控制面板中的开关随时切换。
- 使用快捷键 `Alt + A` 可快速切换运行状态。
- 点击面板右上角的 `−` 可收起面板，点击 `＋` 可重新展开。
- 自动过验证成功后会关闭验证弹窗并恢复自动抛竿。
- 自动过验证关闭或执行失败时，脚本会停止，需要手动完成验证后重新启动。
- 在“设置”页中可以选择 Server酱或浏览器通知；浏览器通知需要先完成站点权限授权。
- 在“设置”页中开启定时休息后，可分别设置运行分钟数和休息分钟数。

### 配置 Server酱通知

1. 打开 [Server酱官网](https://sct.ftqq.com/)并登录。
2. 按照网站页面提示获取 SendKey。
3. 展开脚本控制面板，进入“设置”，选择 Server酱并将 SendKey 填入“消息推送 Key”输入框。
4. 输入内容会自动保存在当前网站的 `localStorage` 中；清空输入框即可关闭推送。

未配置 SendKey 时，控制面板会显示获取链接。通知发送结果也会记录在浏览器开发者工具的控制台中。

Server酱每日免费额度仅 5 条，推荐优先选择浏览器通知。

### 自动更新

脚本通过以下地址检查和下载更新：

```text
https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js
```

发布新版本时，需要递增脚本元数据中的 `@version`，Tampermonkey 才会识别为可用更新。

### 开发与构建

项目使用 Vite 和 `vite-plugin-monkey` 维护模块化源码，最终仍生成可直接安装的单文件 userscript。

```bash
pnpm install
pnpm dev
pnpm build
pnpm check
```

- `arcaneangler/src/` 是 Arcane Angler 脚本的源码目录。
- `arcaneangler/arcane-angler-auto-cast.user.js` 是构建产物，也是 Tampermonkey 的稳定发布文件，请勿直接修改。
- `pnpm build` 会打包模块、生成 userscript metadata，并将产物写入稳定发布路径。
- `pnpm check` 会执行单元测试、重新构建、检查生成文件语法和 metadata。
- 发布代码前需要提交源码、构建配置、锁文件以及最新生成的 `.user.js` 文件。

## 免责声明

本项目仅供学习与个人研究使用。使用者应自行遵守目标网站的服务条款、使用规则及所在地法律法规。因使用本项目产生的账号限制、数据损失或其他直接、间接后果，均由使用者自行承担，项目作者不承担相关责任。

## License

[MIT License](./LICENSE)
