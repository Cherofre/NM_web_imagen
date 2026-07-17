# v1.0.7 遮罩编辑执行计划

## Task 1：分支、台账与基线

- 创建 `codex/mask-editor-v1.0.7`。
- 停止旧 v1.0.6 手动验收服务，不写 G 盘。
- 记录设计、计划、风险和基线结果。
- 基线：后端图片/上游测试、前端提交/UI 测试、四模块编译。

## Task 2：后端遮罩契约，先 RED 后 GREEN

修改：

- `image_safety.py`
- `app.py`
- `tests/test_security_boundaries.py`
- `tests/test_upstream_jobs.py`

先添加失败测试：

- 无参考图时拒绝遮罩。
- 遮罩仅允许 PNG、必须含 Alpha、必须和第一张底图同尺寸。
- 有遮罩时 auto 选择 edits，显式 generations/responses 被拒绝。
- multipart 把 `mask` 和第一张 `image[]` 一起发送。
- 无遮罩现有路径保持不变。

最小实现后运行定向测试和四模块 `py_compile`，通过后提交。

## Task 3：前端遮罩状态与提交协议，先 RED 后 GREEN

新增：

- `studio-web/src/maskEditorModel.ts`
- `studio-web/src/maskEditor.test.mjs`

修改：

- `studio-web/src/App.tsx`
- `studio-web/src/submissionPayload.test.mjs`

测试：

- 底图指纹稳定。
- 底图改变时遮罩失效。
- 遮罩仅在 GPT 生图模式可用。
- FormData 和队列 payload 保留独立遮罩快照。
- 有遮罩时客户端要求 edits。

## Task 4：Canvas 遮罩编辑器

新增 `studio-web/src/MaskEditor.tsx`，修改 `styles.css` 和 `i18n.ts`：

- 原生 Canvas 加载和 PNG 转换。
- 画笔、橡皮、移动、粗细、撤销、重做、清空、全选。
- 缩放、适配、Esc 关闭、键盘撤销/重做。
- 红色半透明编辑区、底图/已遮罩状态和准确中文说明。
- 200% 缩放、窄窗口和 `prefers-reduced-motion` 不破坏关键操作。

运行 Node 测试、TypeScript/Vite build 和 size rules，通过后提交。

## Task 5：完整回归与本地 smoke

- Python 全量测试。
- 全部 Node 测试模块。
- `npm run test:size` 和生产构建。
- 四个 Python 模块编译。
- 临时 mock 上游验证 edits multipart 中的 `image[]` 与 `mask`。
- 启动临时 Studio，验证页面、当前 JS/CSS 和健康接口。
- 不调用付费 API，不写 G 盘。

## Task 6：版本、文档与手动验收

- 评估并统一版本到 1.0.7。
- 更新 README，移除失效参考强度说明并补充遮罩用法。
- 更新台账、验证证据和剩余限制。
- 创建新的本地候选包前，先完成 Studio 真人浏览器验收。
- 未经用户确认，不同步 G 盘、不推送、不合并。
