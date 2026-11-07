# GIF 输出与可扩展图片参数

日期：2026-11-07；分支：`codex/gif-output-parameters`。

## 使用方式

- GPT Image「生成设置 → 输出格式」选择 GIF，可调 2–16 帧及每帧 20–2000 毫秒；自动格式不增加输出参数，保留旧请求行为。
- 格式和动画参数随生成任务快照、队列、历史套用和重试传递。套用旧历史时格式恢复自动，避免继承当前 GIF 状态。
- 「高级参数 → 图片扩展参数（JSON）」填写如 `{"complexity":"low"}`，随连接配置保存和导入导出，切换到无扩展参数的配置会清空它。
- 扩展对象合并到 Images 请求正文，或 Responses 图片工具；编辑接口的 multipart 对象、数组、布尔及空值按 JSON 文本编码。
- 界面字段、凭证、输入内容及流式传输控制不能通过扩展对象覆盖；非法 JSON、超出 16 KiB、冲突参数在发请求前拒绝。显式扩展或动画参数被渠道拒绝时，不会删参数重试。
- GIF 返回需是可读取的多帧动画。收到 PNG、单帧 GIF 或损坏 GIF 时保留原始结果并报告失败。静态图片编辑工具仍沿用原请求模式。

## 扩展边界

普通新增图片参数通常可直接填入扩展对象，无须新增专用表单或发版；高频参数再按实际使用需要加友好界面。新结果格式（SVG 等）、流式或异步协议、文件上传结构变化仍需适配。此入口目前仅用于 GPT 图片接口，未扩展 Banana 或聊天接口，也不根据提示词猜测输出格式。

字段依据：[官方图片生成文档](https://developers.openai.com/api/docs/guides/image-generation#generate-animated-gif-output)，本轮查阅的 GIF 说明支持生成与参考图编辑接口。

## 验证证据

- 后端全量 339 项通过；最后空值/返回错误码调整后新增 GIF 测试 8 项再次通过。模型与安全边界定向 112 项通过。
- Node 全量 315 项通过，包含实际生产 JSX 在 desktopMode=true/false 下的 GIF 按钮及帧数处理器执行；生产构建通过。
- PyInstaller 后端与 Tauri release 构建通过。最后资源为 `index-BmPLisoT.js`、`index-BDDCcp1O.css`。
- 隔离数据目录、仅本机 mock 渠道完成实际浏览器点击：GIF、12 帧、150 毫秒、`complexity` 和嵌套 `future_setting` 均准确出现在上游正文，历史保留参数。
- 独立 Playwright CLI 打开实际结果；五张浏览器元素截图中心像素分别出现 RGB(218,88,47) 与 RGB(37,123,203)，证明动画在页面实际播放，非仅校验文件后缀。截图位于 `.runtime/gif-animation-{0..4}.png`。
- 820×800 窗口下实际检查 GIF 设置弹层，截图 `.runtime/gif-settings-final.png`。
- 对从试用 ZIP 实际解压出的冻结后端执行 `/v1/images/generations` 与 `/v1/responses` 本机 mock：动画帧有效、扩展嵌套类型正确、历史参数保留、下载与保存文件字节一致。证据 `.runtime/gif-frozen-result.json`，脚本 `.runtime/verify_gif_frozen.py`。
- ZIP 的 793 个文件逐一与清单大小/SHA256 匹配，不含用户配置、历史或会话数据。

## 交付范围

本地试用包：`_release/gif-preview/NM-Image-Studio-GIF-preview-Portable-x64.zip`，48,425,928 字节，SHA256 `ef50f8f9f4dc4aecbcb1e4e38405d293232a30ff6c26ec5a8e9b9296bd3598f6`。该包为本地试用构建，内部版本仍为 1.1.6，不代表已发布的新正式版本。

完整解压后运行 `NM Image Studio/nm-image-studio-desktop.exe`。便携模式使用自己的 `data`；不会自动读取或替换已安装版的配置。试用前退出其他桌面实例以满足单实例规则。

本轮零付费调用；未验证真实 YQ 渠道 GIF 生成、原生桌面 GUI 播放和保存对话框，未覆盖现有安装、重启既有 7861 服务、发布 GitHub 或同步 G 盘。已有 7861 服务仍需重启后才能使用新的后端参数。
