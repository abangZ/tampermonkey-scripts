# Tampermonkey Scripts

个人使用的 Tampermonkey 脚本合集。

## Arcane Angler 自动抛竿

为 [Arcane Angler](https://arcaneangler.com/) 提供自动抛竿、验证码检测和消息通知功能。

### 功能

- 自动查找并点击“抛竿线”按钮。
- 使用随机操作间隔，并以较低概率加入更长等待。
- 在抛竿请求发出前将 payload 中的 `isTrusted` 修改为 `true`。
- 检测到页面出现“人机验证”时默认自动尝试完成验证，并随机模拟观察题面、操作滑块和确认结果的耗时；可在控制面板中关闭。
- 自动过验证失败或该功能关闭时，会停止自动操作并支持通过 Server酱推送提醒。
- 在收益面板中统计鱼获、金币等收益，收获分类使用中文名称和稀有度颜色展示。
- 支持收起控制面板，移动端首次使用时默认折叠。
- 自动保存启停状态、自动过验证设置、Server酱 SendKey 和面板折叠状态。
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
- 自动过验证成功后页面会刷新，并恢复上次保存的自动抛竿启停状态。
- 自动过验证关闭或执行失败时，脚本会停止，需要手动完成验证后重新启动。

### 配置 Server酱通知

1. 打开 [Server酱官网](https://sct.ftqq.com/)并登录。
2. 按照网站页面提示获取 SendKey。
3. 展开脚本控制面板，将 SendKey 填入“消息推送 Key”输入框。
4. 输入内容会自动保存在当前网站的 `localStorage` 中；清空输入框即可关闭推送。

未配置 SendKey 时，控制面板会显示获取链接。通知发送结果也会记录在浏览器开发者工具的控制台中。

### 自动更新

脚本通过以下地址检查和下载更新：

```text
https://raw.githubusercontent.com/abangZ/tampermonkey-scripts/main/arcaneangler/arcane-angler-auto-cast.user.js
```

发布新版本时，需要递增脚本元数据中的 `@version`，Tampermonkey 才会识别为可用更新。

## 免责声明

本项目仅供学习与个人研究使用。使用者应自行遵守目标网站的服务条款、使用规则及所在地法律法规。因使用本项目产生的账号限制、数据损失或其他直接、间接后果，均由使用者自行承担，项目作者不承担相关责任。

## License

[MIT License](./LICENSE)
