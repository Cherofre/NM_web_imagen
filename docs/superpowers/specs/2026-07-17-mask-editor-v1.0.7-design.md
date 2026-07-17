# v1.0.7 遮罩编辑设计

## 1. 目标

在不改变现有 Studio 主布局、不引入大型前端库或 Pillow、不破坏 GPT/Banana 正常生图、队列、会话、历史和 Windows 离线包的前提下，为 GPT Image 2 增加真实可用的局部遮罩编辑。

完成后，用户可以把第一张 GPT 参考图作为编辑底图，在专注式画布中涂出允许修改的区域，并通过 `/v1/images/edits` 把同尺寸 PNG 底图和带 Alpha 通道的 PNG 遮罩发送给上游。

## 2. 官方接口边界

依据 OpenAI 图像生成指南：

- 遮罩用于指示应编辑的区域，但 GPT Image 把它作为提示指导，不能保证像素级完全贴合。
- 多张输入图时，遮罩只作用于第一张图片。
- 编辑底图和遮罩必须具有相同格式与尺寸，且遮罩必须包含 Alpha 通道。
- 当前实现仅接入 Image API `/v1/images/edits`。Responses API 的 `input_image_mask` 依赖 Files API 文件 ID，不纳入第一版。

官方参考：<https://developers.openai.com/api/docs/guides/image-generation#edit-an-image-using-a-mask>

## 3. 用户流程

1. 用户在 GPT 生图模式添加至少一张参考图。
2. 第一张参考图显示“底图”标记和“编辑遮罩”入口。
3. 打开遮罩编辑器后，底图保持居中，半透明红色区域表示允许模型修改。
4. 工具栏提供画笔、橡皮、移动、粗细、撤销、重做、清空、全选、缩放和适配。
5. 用户点击“应用遮罩”后，浏览器把第一张底图和遮罩统一输出为相同尺寸的 PNG。
6. 当前参考图条显示“已遮罩”；提交时，任务快照固定底图、其他参考图和遮罩。
7. 替换、删除或移动第一张底图后，旧遮罩自动失效并给出中文提示。

核心文案：

- “涂红区域允许修改，未涂区域尽量保留。”
- “遮罩只作用于第一张底图。”
- “GPT Image 会把遮罩作为提示指导，边界可能不会完全精确。”

## 4. 前端设计

### 4.1 组件与状态

- 新增 `studio-web/src/MaskEditor.tsx`，使用原生 Canvas 和 Pointer Events。
- 新增 `studio-web/src/maskEditorModel.ts`，存放可测试的底图指纹、端点能力和遮罩状态辅助函数。
- App 只保存当前 `MaskAttachment`：转换后的 PNG 底图、PNG 遮罩、底图指纹和覆盖率摘要。
- 遮罩二进制只保存在内存和队列任务快照，不写入 localStorage，不在第一版跨刷新恢复。

### 4.2 画布

- 底层 Canvas 只绘制转换后的底图。
- 上层 Canvas 绘制半透明红色选择区域。
- 笔画以矢量命令保存，撤销/重做不保存整张 4K ImageData，避免大量内存占用。
- 导出时生成 RGBA PNG：未选区域保持不透明，选中编辑区域写入透明 Alpha。
- 第一版限制可编辑像素总量，避免异常超大图片导致浏览器 Canvas 内存崩溃；正常 4K 图片应可使用。

### 4.3 交互位置

- 入口位于第一张参考图 chip 内，不在高级参数中重复增加入口。
- 编辑器使用现有 lightbox 的固定层级和视觉语言，但采用更宽的工作区。
- 只有 GPT、生图模式且存在参考图时显示；Banana 和聊天模式不显示。

## 5. 提交与队列

- `createFormData` 新增可选 `maskFile`。
- 存在遮罩时追加 multipart 字段 `mask_file`。
- `GenerationQueuePayload` 保存遮罩文件快照，排队后的任务不受当前画布继续修改影响。
- Turn metadata 只保存 `mask_used: true`，不把遮罩 Base64 写入会话。
- 第一版从历史“重试”时不恢复旧遮罩，并显示遮罩仅本次提交有效的说明。

## 6. 后端契约

- `/api/generate/gpt-image-2` 新增可选 `mask_file: UploadFile`。
- 有遮罩但没有参考图时返回 400。
- 有遮罩时，`api_endpoint` 只允许 `auto` 或 `/v1/images/edits`；`auto` 强制解析为 edits。
- 第一张参考图和遮罩必须都是 PNG、尺寸一致、大小受限。
- 遮罩 PNG 必须包含 Alpha 通道；浏览器 Canvas 输出固定使用 RGBA PNG。
- 转发时 multipart 顺序为第一张 `image[]`、其余 `image[]`、`mask`。
- 历史 metadata 记录 `mask_used`，不记录遮罩字节或本地绝对路径。

## 7. 兼容性

- 没有遮罩时，现有 GPT generations、edits、responses 和自定义网关行为保持不变。
- Banana 不受影响。
- 旧配置、旧历史、旧会话和旧参考图继续读取。
- 对不支持 `mask` 的 OpenAI 兼容网关，返回脱敏后的上游错误，不自动退回无遮罩请求，避免用户误以为遮罩生效。
- 不增加 Python 运行依赖，不改变 PowerShell 5.1 和便携 Python 结构。

## 8. 明确不包含

- 不做自动抠图、套索、魔棒、图层、复杂笔刷或多张图片分别绘制遮罩。
- 不在第一版持久化遮罩文件或支持跨刷新恢复。
- 不接入 Responses API Files 上传链路。
- 不把遮罩加入 Banana。
- 不恢复无上游契约的“参考强度”滑块。

## 9. 验收标准

- 第一张参考图可打开遮罩编辑器，画笔、橡皮、移动、撤销、重做、清空、全选和缩放可用。
- 应用后底图和遮罩均为同尺寸 PNG，遮罩包含 Alpha。
- 提交时只有 `/v1/images/edits` 收到 `mask` 字段。
- 多图情况下遮罩对应第一张底图。
- 队列任务拥有独立遮罩快照。
- 删除、替换或移动底图会使旧遮罩失效。
- 无遮罩路径和 Banana 路径回归通过。
- 不调用付费上游的本地 mock smoke 通过。
