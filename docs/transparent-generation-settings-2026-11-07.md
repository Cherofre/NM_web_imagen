# 透明通道与生成设置弹层

日期：2026-11-07；分支：`codex/gif-output-parameters`，接续 GIF 与参数扩展功能。

## 用户可见变化

- 生成设置新增「背景：自动 / 不透明 / 透明通道」。透明选择自动使用 PNG，已选 WebP 则保留；切换 JPEG/GIF 时恢复自动背景。工具栏摘要显示透明状态。
- 后端向 Images 正文、编辑 multipart 或 Responses 图片工具传递 `background`。默认自动保持原请求，不新增参数；透明参数不能被未知参数兼容降级删除。
- 透明结果检查实际 PNG/WebP Alpha；不透明、全透明空图、格式错误或无法解码均保留原始结果并报告失败。原移除背景工具仍固定 PNG，不改变其调用方式。
- 弹层改为 384px 宽的分段控件，质量放为一行，数量用可输入的加减步进器。GIF 参数按需显示并显示循环时长；无长说明框和重复数量选项。
- 标题和关闭按钮固定在内容外。根据按钮位置、视口和实际缩放计算固定定位及可用高度，横向限位，较矮窗口只滚动内容；支持 Escape 关闭。

字段依据：[官方 API 透明背景说明](https://developers.openai.com/api/reference/resources/images/methods/generate)，明确透明背景使用 PNG/WebP。模型和渠道的实际可用性仍需分别确认。

## 已完成验证

- 后端全量 345 项、前端全量 316 项通过；Python 编译和生产构建通过。
- 新增验证覆盖 PNG/WebP 实际 Alpha、生成/编辑/Responses 请求位置、历史状态、无效格式、全透明空图和不透明误返回、背景参数拒绝不重试，以及两种运行模式下的实际 JSX 控件联动。
- Playwright 在隔离数据目录和本机模拟渠道实际点击透明并提交，观察到 `output_format=png` 与 `background=transparent`，历史保存参数且真实 Alpha 校验通过。0 付费请求。
- 浏览器实际验收 1280×900、820×800、760×640、400×740：弹层四边在视口内，标题和关闭按钮可见。200% 缩放也通过。数量上下限、加减与 Escape 通过；默认内容区域 `clientHeight=scrollHeight=292`，无滚动条。
- 视觉记录：`.runtime/generation-settings-final.png`；行为记录 `.runtime/alpha-ui-result.log`、`.runtime/alpha-controls-result.log`。第一次矮窗口发现顶部裁切，已修正为测量锚点可用空间，复验通过。
- 最终资源：`index-BdTDiO3x.js`、`index-DX79-LSW.css`；Tauri/PyInstaller 最终构建完成。

## 交付与边界

试用包目标：`_release/alpha-preview/NM-Image-Studio-Alpha-preview-Portable-x64.zip`，完整解压后运行其中 `NM Image Studio/nm-image-studio-desktop.exe`。退出已有桌面实例后再试用，便携版使用自己的 data。

实际 ZIP 解压验收通过：793 文件逐一匹配清单大小/SHA256，包内 UI 入口与当前构建逐字匹配，无用户配置/历史。对解压出的冻结后端执行生成、编辑、Responses 三接口 × PNG/WebP 六项本机 mock，实际 Alpha 极值均为0–255，下载与保存字节一致；不透明误返回保留且报告失败，GIF 回归通过。证据 `.runtime/alpha-frozen-result.json`。

ZIP：48,435,858 字节，SHA256 `a559a0e8c4cf89b5fb7a8f2274d50c30c1f26580c7fe61e14e4276ea7f0c3297`。保留既有 GIF 试用包；本地试用内部版本仍为 1.1.6，不表示正式发布。未覆盖已安装程序或用户配置、未重启旧 7861 服务、未发布 GitHub 或同步 G 盘。真实渠道付费请求、原生 GUI 和保存对话框未验。
