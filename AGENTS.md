# AGENTS.md

## 项目定位

- 本仓库用于维护可直接安装到 Tampermonkey 的 userscript。
- 源码允许按模块拆分，但对外发布物必须是带完整 metadata 的单个 `.user.js` 文件。
- 当前主要脚本是 Arcane Angler 自动抛竿，目标页面依赖和 DOM/API 约定只应放在 `arcaneangler/` 范围内。

## 源码与生成文件

- `arcaneangler/src/` 是 Arcane Angler 脚本的源码目录，也是实现改动的主要入口。
- `arcaneangler/arcane-angler-auto-cast.user.js` 是自动生成的发布文件，不要直接编辑。
- 修改源码后运行 `pnpm build`，由构建流程更新发布文件。
- `arcaneangler/.dist/` 是临时构建目录，已忽略，不应提交。
- userscript 文件名、版本和 metadata 的唯一配置入口是 `arcaneangler/userscript.config.js`。
- `vite.config.js` 只维护通用构建行为，不要再复制一份脚本版本或发布 URL。

## 版本与更新日志

- 新增用户可感知功能时递增次版本号，仅修复问题时递增修订号。
- 每次修改 `arcaneangler/userscript.config.js` 中的 `userscriptVersion`，必须同时在根目录 `CHANGELOG.md` 顶部新增对应版本、发布日期和主要用户可感知变更；不得只更新脚本版本而遗漏更新日志。
- 发布相关提交应同时包含版本配置、`CHANGELOG.md` 和重新生成的 `.user.js` 文件。

## Arcane Angler 模块边界

- `src/main.js`：组装各模块，维护自动抛竿主循环和用户操作入口。
- `src/network/fetch-interceptor.js`：拦截目标请求、改写抛竿 payload、收集响应和验证码 challenge。
- `src/captcha.js`：验证码 challenge 生命周期、自动验证、失败停止逻辑。
- `src/schedule.js`：运行/休息周期和剩余时间状态。
- `src/earnings.js`：收益数据归一化和纯计算。
- `src/storage.js`：`localStorage` 读写及默认值兼容。
- `src/notifications.js`：Server酱和浏览器通知。
- `src/ui/panel.js`、`src/ui/panel.css`：Shadow DOM 控制面板和样式。
- `src/utils/`：无业务状态的通用 DOM、时间工具。

新增逻辑优先放入对应领域模块；`main.js` 主要承担编排，不要重新堆回单文件实现。

## Userscript 兼容约束

- 稳定发布文件名和 Raw URL 是：
  `https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js`。
- 不要随意更改脚本文件名、`@namespace`、`@name`、`@match`、`@updateURL` 或 `@downloadURL`，否则可能破坏已有安装和自动更新。
- 发布文件内容发生变化时，应递增 `arcaneangler/userscript.config.js` 中的版本号，再重新构建。
- 默认保留 `@grant none`。改变 grant 或注入上下文可能导致页面的 `window.fetch`、`window.ApiService` 和 React 内部对象不可访问；确需修改时必须做真实页面验证。
- fetch 包装必须同时兼容 `fetch(url, init)` 和 `fetch(Request, init)`。请求解析或重建失败时保留原请求，不能影响非目标接口。
- 已有 `localStorage` key 属于兼容数据。需要改名或调整结构时提供向后兼容读取或迁移，避免静默丢失用户设置和收益统计。
- 控制面板继续使用 Shadow DOM，避免样式污染目标页面，也避免目标页面样式反向影响面板。

## 开发命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm check
```

- `pnpm build`：打包模块并更新稳定发布文件。
- `pnpm test`：执行 Node 单元测试和生成脚本的 Happy DOM smoke test。
- `pnpm check`：执行格式检查、构建、测试、生成文件语法、metadata 和 diff 检查。
- `pnpm format`：格式化源码、测试和构建脚本；不要对生成的 `.user.js` 手工格式化。

## 验证与发布

- 修改 userscript 源码、metadata 或构建链后，交付前至少运行 `pnpm check`。
- 修改 DOM 查询、页面 API、验证码、点击或调度生命周期时，自动化检查之外还应在真实 Arcane Angler 页面验证相关流程；无法验证时明确说明未覆盖范围。
- 测试优先覆盖纯逻辑和模块接口。需要验证最终组装结果时，针对生成的 `.user.js` 增加 smoke test。
- 提交发布相关改动时，应同时包含源码、构建配置、锁文件、测试和最新生成的 `arcane-angler-auto-cast.user.js`，避免仓库中的发布文件落后于源码。
