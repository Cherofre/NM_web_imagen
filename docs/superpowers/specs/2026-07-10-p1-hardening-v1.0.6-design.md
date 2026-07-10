# v1.0.6 P1 Hardening Design

## 1. 目标

在不迁移现有 FastAPI + React/Vite 架构、不破坏旧配置/历史/会话和 `/classic` 回滚入口的前提下，修复 v1.0.5 审查确认的 P1 风险：本地密钥与元数据暴露、图片 SSRF/伪图片/SVG/无上限、聊天参考图错误承诺、无效编辑控件、Banana 诊断必失败、同步网络阻塞事件循环、取消语义失真、JSON 并发写入丢数据，以及 Windows 发布链路的隐私与可靠性问题。

## 2. 范围与明确取舍

### 2.1 本次包含

- 生产运行只支持回环地址，开发 CORS 仅允许显式配置的准确来源。
- `/outputs` 改为受控图片路由，不再静态公开 JSON 和其他非图片文件。
- 参考图和生成结果只接受严格验证的栅格图片，拒绝 SVG 和任意会话远程 URL。
- 上传、data URL、远程结果下载增加单文件和单请求字节上限。
- API Key 不再自动写入 Studio/Classic localStorage。
- 聊天模式在未实现多模态前禁用参考图并给出真实说明。
- 暂时隐藏未进入上游请求的 GPT 编辑模式和参考强度控件。
- Banana 诊断与真实请求复用同一 URL、请求头和 payload 构造。
- 同步 `requests` 调用通过受限线程执行，避免阻塞 FastAPI 事件循环。
- 前后端使用 job ID 和取消标记；取消后不保存结果，但不承诺上游停止计费。
- history/session/config 采用锁、唯一临时文件、原子替换和必要的版本冲突检测。
- PowerShell 5.1 中文编码、白名单打包、便携 Python 恢复、实例识别和发布顺序加固。

### 2.2 本次不包含

- 不实现真正的 GPT/Banana 多模态聊天。
- 不实现供应商特定的扩图、mask 或参考强度协议。
- 不迁移到 SQLite；先用兼容层修复 JSON 数据竞争。
- 不增加局域网远程模式或账号系统。
- 不做整体 UI 重设计，不处理与 P1 无关的圆角、动效和布局审美问题。
- 不删除 `/classic`。

## 3. 总体架构

保留 `app.py` 作为 FastAPI 入口和兼容路由，新增三个小型后端模块以隔离高风险逻辑：

- `image_safety.py`：栅格魔数识别、尺寸/字节限制、安全 data URL、输出路径和响应头。
- `storage.py`：按文件锁、唯一临时文件、原子 JSON 写入、备份、session revision。
- `upstream.py`：受限线程执行、并发 semaphore、取消状态、Banana/GPT 公共请求辅助。

前端保留 `App.tsx` 和现有队列辅助模块，不进行大拆分；新增小型纯函数模块存放安全配置持久化、聊天能力判断和 job 取消协议，便于 Node 测试覆盖。

Windows 脚本继续使用 PowerShell 5.1 语法。编码转换和发布白名单属于发布阶段提交，不与应用逻辑混在同一提交中。

## 4. 阶段一：安全边界

### 4.1 CORS 与监听地址

生产 `create_app()` 不添加跨端口 CORS。仅当环境变量 `IMAGE_TOOL_DEV_CORS_ORIGINS` 明确列出来源时才启用 CORS，用于 Vite 开发服务器。

`main()` 在 `--host` 不是 `127.0.0.1`、`localhost` 或 `::1` 时拒绝启动，并提示当前版本不支持无认证远程模式。启动脚本继续固定使用 `127.0.0.1`。

意图：阻止其他 localhost 页面读取配置，同时避免用户误把无认证服务暴露到局域网。

影响：使用 `npm run dev` 时需要由开发命令显式设置允许来源；正式双击启动无行为变化。

### 4.2 受控输出路由

移除 `StaticFiles(directory=outputs)`。新增 `/outputs/{path:path}` 路由，只允许输出目录内的 PNG/JPEG/GIF/WebP/BMP，路径 resolve 后必须仍位于 outputs 内。拒绝 JSON、SVG、HTML、临时文件和未知扩展名，响应增加 `X-Content-Type-Options: nosniff` 和私有缓存策略。

意图：保留现有图片 URL，同时阻止直接下载 `history.json`、`studio_sessions.json` 和主动内容。

影响：旧图片和 session reference URL 继续工作；手工访问 outputs 内 JSON 将返回 404。

### 4.3 图片验证与容量

严格允许的格式为 PNG、JPEG、GIF、WebP、BMP，必须由文件魔数识别，不能只信任上传 MIME。SVG 一律拒绝。

默认限制：

- 单张参考图最大 25 MiB。
- 单次参考图总量最大 150 MiB。
- 单个远程生成结果最大 50 MiB。
- data URL 在解码前先根据 Base64 长度估算，超限立即拒绝。

会话参考快照只接受本工具 `/outputs` 图片或 data URL，不再接受任意 HTTP URL。上游返回的生成图片 URL 使用专用下载路径，流式读取并限制字节数。

意图：同时关闭 SSRF、伪图片、SVG 主动内容和内存耗尽路径。

影响：超大或格式不受支持的参考图会收到明确 413/400；正常 4K 位图不受影响。

### 4.4 API Key 浏览器持久化

Studio/Classic 保存表单状态时剔除 `api_key`。页面启动仍可从后端 `config.local.json` 加载 Key，但浏览器 localStorage 不再保存副本。清理动作删除历史版本的本地 Key 字段。

意图：减少浏览器备份、调试数据和同源脚本泄密面。

影响：未点击“保存配置”的临时 Key 在刷新后不再保留；已保存到 `config.local.json` 的 Key 仍会正常加载。

## 5. 阶段二：功能真实性

### 5.1 聊天参考图

聊天模式不创建 reference snapshots，不把参考图数量写入 turn，也不显示“包含参考图”的成功文案。切到聊天模式且 composer 中存在参考图时，界面保留这些图片供之后生图使用，但显示“聊天暂不发送参考图”。

意图：消除模型看到了图片的错误承诺，同时不清除用户尚未提交的素材。

影响：用户不能再误以为聊天具备视觉能力；生图流程不受影响。

### 5.2 无效 GPT 控件

Studio 和 Classic 暂时隐藏 `edit_mode` 与 `reference_strength` 控件。后端继续接收旧客户端字段并写入兼容历史，但不在新 UI 中宣称它们有效。

意图：停止向用户展示不会改变上游请求的控制项。

影响：界面参数减少；旧历史和旧请求仍可读取，不发生 schema 破坏。

### 5.3 Banana 诊断

用命名参数调用公共 Banana payload 构造函数；诊断、聊天和生成共用认证头辅助函数。诊断结果明确提示生图检查会发起一次最小真实请求并可能计费。

意图：让诊断证明真实生成契约，而不是只证明一套不同的模拟请求。

影响：原本必失败的 Banana 生图诊断恢复；部分只接受旧认证头的非标准网关可能需要兼容头并存。

## 6. 阶段三：请求与数据可靠性

### 6.1 非阻塞上游请求

继续使用 `requests` 以避免增加离线运行依赖，但所有网络调用通过统一 `asyncio.to_thread()` 辅助函数执行。生图和聊天分别使用受限 semaphore；无限超时改为有上限的大超时，并在 UI 中保留“长时间等待”语义而非真正无限。

意图：慢请求不再冻结 health、会话保存和其他标签页。

影响：多个请求可并发进入服务，但会按服务端上限排队；极长请求最终会超时。

### 6.2 Job ID 与取消

前端沿用 queue job ID，并在生成/聊天请求中提交 `job_id`。后端维护带 TTL 的内存 job registry，提供 `/api/jobs/{job_id}/cancel`。每次上游请求前、重试间和保存历史前检查取消标记。

取消行为定义：

- 尚未发送上游：不发送。
- 已发送上游：停止本地等待或等待线程结束后丢弃结果，不写图片和历史。
- UI 文案明确“上游已接单时仍可能计费”。

意图：让取消后的本地状态真实一致，同时避免承诺供应商无法保证的计费取消。

影响：取消结果不会再稍后出现在历史中；服务重启会清空内存 job 状态，符合当前浏览器队列刷新即中断的设计。

### 6.3 原子持久化和 revision

`storage.py` 为 config、history、studio sessions 提供：

- 进程内按路径 `RLock`。
- UUID 临时文件。
- flush 后 `os.replace()`。
- config 写入前保留一份 `.bak`。

Studio session state 增加整数 `revision`。GET 返回 revision；PUT 可携带 `expected_revision`，不匹配返回 409 和当前服务端状态。前端收到 409 时按 session `updatedAt` 合并，再以最新 revision 重试一次。

参考图清理只在新 JSON 成功提交后执行；如果仍引用文件超过数量/容量限制，返回 413，不删除仍被引用的文件。

意图：防止多标签页丢历史、固定 tmp 冲突、旧会话覆盖新会话和引用文件静默消失。

影响：极少数同时编辑同一会话的标签页会发生一次自动合并；冲突无法安全合并时提示用户刷新，而不是静默覆盖。

## 7. 阶段四：Windows 发布链路

### 7.1 PowerShell 5.1 编码

所有含中文的发布 `.ps1` 转换为 UTF-8 BOM，并新增使用 `powershell.exe` 解析、运行中文隐私文件名场景的测试。

### 7.2 白名单打包

`package_web_tool.ps1` 从“复制全部再排除”改为明确发布清单。清单只包含后端、已构建前端、启动/停止脚本、运行依赖、版本和用户文档；内部 ledger、spec/plan、测试产物、凭据、证书、数据库和浏览器状态默认不进入包。

### 7.3 便携 Python 与依赖指纹

解压失败只删除不完整 `.runtime`，永不删除 vendor Python ZIP。启动时记录 Python ZIP、requirements 和 wheels 清单指纹；指纹变化时重建 `.runtime`。

发布验证从 vendor 创建全新临时运行环境，执行依赖导入和 API 冒烟；测试专用依赖单独声明，不混入用户运行包。

### 7.4 实例识别与发布顺序

`/api/health` 返回由规范化项目根路径计算的不可逆 `instance_id`。启动脚本计算当前目录的同一 ID，只有版本、instance ID、API 路由和静态资产全部匹配才复用服务。

发布顺序改为本地测试、构建、打包、解压包冒烟、release preflight 全部通过后，才执行 G 盘同步。同步后再做目标校验，但不把目标校验当作第一道门。

意图：避免中文过滤失效、未来未知文件泄露、安装自毁、错误实例复用和坏包先进入共享盘。

影响：发布耗时略增加；旧 `.runtime` 在依赖变化后会自动重建，首次启动时间可能增加。

## 8. 错误处理与用户文案

- 400：格式、参数或不支持图片类型。
- 409：session revision 冲突。
- 413：图片或会话参考数据超限。
- 499 语义不直接作为 HTTP 状态；取消接口返回 200，原生成请求返回结构化 `canceled` 状态或在客户端断开后丢弃结果。
- 502：上游响应无效、非图片或网络错误。
- 504：受控总超时。

客户端错误不返回异常类、绝对路径或未经脱敏的上游文本。详细信息写入未来的脱敏日志；本次至少统一返回短错误码和用户可理解说明。

## 9. 兼容与迁移

- `config.local.json` 的 `forms`、`profiles`、`active_profile_ids` 继续兼容。
- 已有 history/session JSON 首次读取时若无 revision，视为 revision 1。
- 已有图片 URL 保持 `/outputs/...`，只改变服务方式。
- 已有 SVG 或非图片文件不再通过 Web 路由公开，但不自动删除本地文件。
- Classic 继续可生成和读取历史，同时获得 Key localStorage 清理、无效控件隐藏和安全图片限制。
- 版本在实现阶段结束前统一从 1.0.5 升至 1.0.6，不在每个中间提交重复改版本。

## 10. 测试策略

所有行为按 TDD 添加回归测试：

### 后端

- 任意 localhost Origin 不再获得生产 CORS。
- outputs JSON/SVG 被拒绝，合法子目录位图可读取。
- JSON/HTML/SVG/伪 MIME 被拒绝。
- 上传、data URL、远程下载超过限制返回 413。
- session snapshot 远程 URL 被拒绝。
- Banana 诊断真实到达 mock 上游，头和 payload 与生成一致。
- 慢聊天期间 health 仍快速响应。
- 取消后不保存图片和历史。
- 多线程 history/session 写入不丢记录、不出现固定 tmp 冲突。
- revision 冲突返回 409，参考文件仍被引用时不删除。
- 完整 endpoint、错误 JSON 和敏感 URL 均返回脱敏结构化错误。

### 前端

- localStorage 序列化不包含 API Key，并清理旧 Key。
- 聊天模式不创建/发送参考图快照，显示准确文案。
- Studio/Classic 不显示无效编辑模式和参考强度。
- 生成和聊天携带 job ID，取消调用服务端接口。
- session 409 按 updatedAt 合并并重试一次。

### Windows/发布

- PowerShell 5.1 正确识别嵌套中文隐私文件名。
- 发布包只包含白名单。
- Expand-Archive 失败不删除 vendor ZIP。
- 依赖指纹变化触发 runtime 重建。
- 同版本不同实例 ID 不会被复用。
- release preflight 在 G 盘同步前执行。

### 完整验证

- 后端 unittest。
- 前端 Node tests、TypeScript、size rules、Vite build。
- 临时端口 API smoke 和浏览器 smoke。
- 便携 Python 解压环境 smoke。
- package、release preflight 和 G 盘干净同步；只在全部本地验证通过后执行。

## 11. 提交与解释方式

分支为 `codex/p1-hardening-v1.0.6`，按以下稳定边界提交：

1. `Harden local API and image boundaries`
2. `Make chat and diagnostics behavior truthful`
3. `Add cancellable jobs and atomic persistence`
4. `Harden Windows packaging and runtime reuse`
5. `Build and verify v1.0.6 release candidate`

每个阶段开始前向用户说明修改意图；阶段完成后说明可见行为变化、兼容影响、验证证据和仍无法保证的边界。

## 12. 验收标准

- 9 项 P1 均有至少一个实施改动和一个回归测试。
- 默认双击启动、GPT/Banana 生图、聊天、配置 profile、历史、会话和 `/classic` 仍可用。
- 慢上游请求不阻塞 health 和会话 API。
- 取消任务不再写入本地结果或历史，并显示可能继续计费的说明。
- 多标签页并发写入不丢 history/session。
- API Key 不在 localStorage、公开 outputs 元数据或发布包中出现。
- Windows PowerShell 5.1、便携 Python、中文/空格路径和 G 盘同步通过验证。
