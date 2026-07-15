# v1.0.6 最终审查问题修复实施计划

**目标：** 按已批准规格关闭最终整分支审查确认的 5 个 Important，并在不改变界面气质、/classic、旧数据格式和 Windows 离线交付方式的前提下，重新生成可发布的 v1.0.6 候选。

**执行原则：** 每个任务严格执行 RED → 最小 GREEN → 定向回归 → 小步提交。任何产品代码修改前必须先看到对应回归测试因缺少修复而失败。所有本地门禁和最终整分支审查通过前，不写入 G 盘。

**技术栈：** Python 3.12、FastAPI、React 19、TypeScript、Node test runner、PowerShell 5.1。

---

## 文件职责

- app.py：请求边界、上游图片预算、Studio 会话规范化、参考图落盘和 URL 脱敏。
- image_safety.py：data URL/Base64 容量估算与栅格字节边界。
- tests/test_upstream_jobs.py：上游预算、诊断和 URL 脱敏回归。
- tests/test_security_boundaries.py：ASGI 请求体限制与会话字段边界。
- tests/test_studio_sessions.py：会话持久化、稳定参考图文件和旧数据兼容。
- studio-web/src/sessionRevision.ts：启动三方合并、同步基线标记和参考图规范化回写纯函数。
- studio-web/src/sessionRevision.test.mjs：会话同步纯函数 RED/GREEN 测试。
- studio-web/src/App.tsx：把纯函数接入启动加载、保存成功、冲突和 localStorage。
- studio-web/src/uiPolish.test.mjs：确认现有 UI、/classic 和可见文案不被意外改变。
- PROJECT_STATUS.md、NEXT_ACTIONS.md、DECISIONS.md：记录每个阶段的证据和剩余风险。

## Task 1：无效上游图片也消耗检查字节预算

**修改文件：**
- app.py
- image_safety.py（仅当需要复用 Base64 解码前估算）
- tests/test_upstream_jobs.py
- tests/test_security_boundaries.py（仅测试纯容量估算时）

- [ ] **Step 1：写 Base64 预算失败测试**

新增测试，构造多个最终无法通过栅格验证、但每个都有明确解码体积的 data URL。设置很小的请求预算，断言第二或第三个无效候选触发 UpstreamResultLimitError，而不是全部被静默跳过。

- [ ] **Step 2：运行 RED**

运行：

    python -m unittest tests.test_upstream_jobs.UpstreamApiIntegrationTests.test_invalid_base64_candidates_consume_checked_byte_budget

预期：FAIL，证明当前预算只在验证成功后调用 consume。

- [ ] **Step 3：写远程下载预算失败测试**

使用多个 Fake streamed responses；每个响应下载后都因魔数无效而返回 None。断言累计流式字节达到总预算时停止，并且后续响应不再完整读取。

- [ ] **Step 4：运行第二组 RED**

运行：

    python -m unittest tests.test_upstream_jobs.UpstreamApiIntegrationTests.test_invalid_remote_candidates_consume_checked_byte_budget

预期：FAIL，证明当前无效下载不计入总预算。

- [ ] **Step 5：最小实现预算拆分**

将 UpstreamImageBudget 改为分别记录 checked_bytes 和 accepted_images，并提供职责单一的方法：

- charge_checked_bytes(byte_count)：检查并增加已检查字节。
- accept_image()：只增加有效图片数量。
- remaining_checked_bytes / remaining_images：分别返回剩余额度。

Base64 在解码前按编码长度估算并占用检查字节；远程 URL 在每个 chunk 加入内存前占用检查字节。验证失败不退款。有效图片只调用 accept_image，不再重复增加字节。

- [ ] **Step 6：补“有效图片不重复计费”测试并运行 GREEN**

覆盖一张有效 Base64、一张有效远程图片、数量上限和单图 50 MiB 上限。

运行：

    python -m unittest tests.test_upstream_jobs

预期：全部通过。

- [ ] **Step 7：提交**

只暂存本任务文件并提交：

    git commit -m "Bound all upstream image inspection bytes"

## Task 2：限制所有写接口请求体并收紧会话持久化结构

**修改文件：**
- app.py
- tests/test_security_boundaries.py
- tests/test_studio_sessions.py

- [ ] **Step 1：写所有写接口 body-limit RED 测试**

覆盖：

- /api/generate/* 使用现有 152 MiB 限制。
- /api/studio/sessions 使用 208 MiB 限制。
- /api/chat/*、/api/diagnostics、/api/config 和其他不安全 /api 写接口使用 2 MiB 限制。
- Content-Length 超限和实际流式字节超限都在 endpoint 解析前返回 413。
- GET、HEAD、OPTIONS 不受写请求 body limiter 影响。

测试通过小型可注入/可 patch 的限额验证，不实际分配 208 MiB。

- [ ] **Step 2：运行 body-limit RED**

运行：

    python -m unittest tests.test_security_boundaries

预期：新增非 generation 路由测试失败。

- [ ] **Step 3：实现路径级请求体限制**

在 RequestBoundaryMiddleware 中增加纯函数或明确映射，根据 method/path 选择：

- generation：152 MiB。
- studio sessions：218,103,808 字节。
- 其他不安全 /api：2 MiB。

复用现有 Content-Length 与 limited_receive 逻辑，稳定返回中文 413。

- [ ] **Step 4：写 Studio 字段边界 RED 测试**

覆盖：

- prompt/reply/draft 截断到 200,000 字符。
- error 截断到 8,000 字符。
- image 只保留白名单字段，单个字符串最多 8,192 字符。
- b64_json、data_url 和未知大字段不写入。
- turn meta 深度、项目数、字符串和 64 KiB 总量均有边界。
- 规范化后完整 JSON 超过可 patch 的小型总上限时返回 413，原文件不变。
- GET 旧文件只读，不自动迁移。

- [ ] **Step 5：运行会话结构 RED**

运行：

    python -m unittest tests.test_studio_sessions

预期：新增字段边界测试失败。

- [ ] **Step 6：最小实现会话结构规范化**

在 app.py 增加小型 helper：

- bounded_text(value, limit)
- bounded_json_value(value, depth, item_limit, string_limit)
- compact_studio_image(image)
- normalized_session_json_size(state)

在 compact_studio_turn / compact_studio_session 中只保留既有业务需要的字段。原子写入前检查规范化后的 JSON 不超过 32 MiB；失败时复用现有 created_paths 补偿清理。

- [ ] **Step 7：运行 GREEN 与兼容回归**

运行：

    python -m unittest tests.test_security_boundaries tests.test_studio_sessions

预期：全部通过，旧会话、revision、未知旧字段读路径和 GET 不写盘测试继续通过。

- [ ] **Step 8：提交**

    git commit -m "Bound API bodies and Studio session data"

## Task 3：让相同参考图使用稳定文件并可重复保存

**修改文件：**
- app.py
- tests/test_studio_sessions.py
- tests/test_storage_concurrency.py（若需要验证并发重用）

- [ ] **Step 1：写稳定引用 RED 测试**

同一个 session/turn/reference ID 和同一 data URL 连续保存两次，断言：

- 两次返回相同 /outputs/session_refs/... URL。
- 目录中只有一个对应文件。
- 第二次不会新建再删除另一个 UUID 文件。
- 不同内容得到不同 URL。
- 已存在的旧 UUID /outputs URL 原样保留。

- [ ] **Step 2：运行 RED**

运行：

    python -m unittest tests.test_studio_sessions.StudioSessionTests.test_repeated_data_url_reference_reuses_stable_file

预期：FAIL，当前 UUID 文件名每次变化。

- [ ] **Step 3：实现确定性文件名**

基于 session ID、turn ID、reference ID 与图片原始字节计算 SHA-256，使用短且稳定的 ref-{digest}.{ext} 文件名。以 xb 原子创建；若文件已经存在且内容一致则直接复用。哈希冲突或内容不一致时安全失败，不覆盖现有文件。

保留旧 UUID 路径读取行为，GET 不迁移。

- [ ] **Step 4：验证失败补偿和并发**

覆盖写入异常、容量异常、revision 冲突和两个串行/并发相同请求，确认旧状态和已提交文件不被误删。

运行：

    python -m unittest tests.test_studio_sessions tests.test_storage_concurrency

- [ ] **Step 5：提交**

    git commit -m "Reuse stable Studio reference files"

## Task 4：启动时合并会话并安全采用服务端参考图 URL

**修改文件：**
- studio-web/src/sessionRevision.ts
- studio-web/src/sessionRevision.test.mjs
- studio-web/src/App.tsx
- studio-web/src/clientSafety.ts（只在复用安全存储 helper 时）
- studio-web/src/uiPolish.test.mjs

- [ ] **Step 1：写启动合并 RED 测试**

为新的纯函数 reconcileInitialSessionState 覆盖：

- 本地同 ID 会话 updatedAt 更新时保留本地。
- 服务端同 ID 更新时保留服务端。
- 两边独有会话都保留。
- 有 baseline marker 时，本地删除且服务端未改则删除生效。
- 有 baseline marker 时，服务端删除且本地未改则删除生效。
- 没有或损坏 baseline 时使用 updatedAt 并集，优先避免数据丢失。
- activeSessionId 只选择合并后仍存在的会话。

- [ ] **Step 2：运行启动 RED**

运行：

    node --test ./src/sessionRevision.test.mjs

预期：新增 helper 不存在或行为失败。

- [ ] **Step 3：写参考图规范化 RED 测试**

为 applyCanonicalReferenceUpdates 覆盖：

- sent/current src 相同，采用服务端 /outputs URL 和规范化 mime/size/dimensions。
- 保存等待期间 current src 已改变，不覆盖。
- 只修改匹配的 session/turn/reference ID。
- 不修改输入对象。
- 返回 changed 标记，供 App 判断是否跳过仅由规范化引发的重复保存。

- [ ] **Step 4：实现纯函数并运行 GREEN**

在 sessionRevision.ts 中实现：

- normalizePersistedBaselineMarkers
- buildPersistedBaselineMarkers
- reconcileInitialSessionState
- applyCanonicalReferenceUpdates
- sessionStateMatchesSnapshot（或等价最小比较）

运行：

    node --test ./src/sessionRevision.test.mjs

- [ ] **Step 5：接入 App 启动 hydration**

增加新的 localStorage baseline key。GET server sessions 后：

- 先把完整服务端响应作为内存 baseline。
- 用 marker/local/server 三方合并，不再无条件覆盖 local。
- 写入精简 marker，不保存 API Key 或图片数据。
- 合并结果不同于服务端时，允许正常 debounce PUT。
- marker 解析/写入失败时保留本地并使用首次并集合并。

- [ ] **Step 6：接入保存成功与冲突响应**

保存成功后，基于实际成功发送的 state，把服务端规范化参考图字段安全合并进 sessionsRef.current；同步 React state、refs、localStorage、内存 baseline 和 marker。只有规范化变化时设置 skip token；存在并发本地编辑时继续下一次保存。

冲突和最终冲突路径更新相同 baseline marker，但不得让旧 revision 覆盖新 marker。

- [ ] **Step 7：运行前端定向回归和构建**

运行：

    node --test ./src/sessionRevision.test.mjs ./src/clientSafety.test.mjs ./src/uiPolish.test.mjs
    npm run test:size
    npm run build

预期：全部通过，构建资产保持确定性，UI 文案和布局无新增变化。

- [ ] **Step 8：提交**

    git commit -m "Reconcile Studio sessions without local rollback"

## Task 5：对外 URL 只保留主机和非默认端口

**修改文件：**
- app.py
- tests/test_upstream_jobs.py
- tests/test_studio_sessions.py

- [ ] **Step 1：写 URL 脱敏 RED 测试**

覆盖：

- user:password@host
- /proxy/path-token
- ?key=、?credential=、?code=、任意查询参数
- fragment
- IPv4、IPv6
- 默认端口和非默认端口
- 无 scheme host
- Windows/POSIX/UNC 本地路径
- diagnostics、history、session 旧 metadata 读路径和成功写迁移

所有公开结果只允许 hostname[:non-default-port] 或 [invalid endpoint]。

- [ ] **Step 2：运行 RED**

运行：

    python -m unittest tests.test_upstream_jobs tests.test_studio_sessions

预期：现有 example.com/v1 等断言失败，证明路径仍被公开。

- [ ] **Step 3：最小实现 host-only 输出**

调整 public_url_hint 和 sanitize_client_url：

- 移除 userinfo、完整 path、全部 query 和 fragment。
- 规范化 hostname 大小写。
- IPv6 使用方括号。
- 仅保留非默认端口。
- sanitize_client_url 在错误文本中最多返回 scheme://host[:port]，不回显路径或参数。
- config.local.json 和配置抽屉中的原始用户配置不修改。

- [ ] **Step 4：运行 GREEN 与错误合同回归**

运行：

    python -m unittest tests.test_upstream_jobs tests.test_studio_sessions tests.test_security_boundaries

预期：全部通过，稳定中文错误码和错误内容不变。

- [ ] **Step 5：提交**

    git commit -m "Redact public endpoint paths and queries"

## Task 6：完整验证、最终审查和重新发布候选

**修改文件：**
- 构建后的 static/studio/*
- PROJECT_STATUS.md
- NEXT_ACTIONS.md
- DECISIONS.md
- 仅在所有本地门禁通过后更新本地/G 盘 v1.0.6 包

- [ ] **Step 1：完整本地测试矩阵**

运行：

    python -m unittest discover -s tests -p "test_*.py"
    $FrontendTestFiles = @(Get-ChildItem .\studio-web\src -Filter "*.test.mjs" -File | Sort-Object Name | ForEach-Object { ".\src\$($_.Name)" })
    Push-Location .\studio-web
    node --test @FrontendTestFiles
    Pop-Location
    npm run test:size
    npm run build
    python -m py_compile app.py image_safety.py storage.py upstream.py

验证 6 个发布 PowerShell 脚本均带 UTF-8 BOM，并可由 Windows PowerShell 5.1 parser 解析。

- [ ] **Step 2：检查 Git 和构建资产**

运行：

    git diff --check
    git status --short --branch

确认只剩用户原有 .impeccable/、PRODUCT.md 和本任务预期改动；不得提交运行时产物。

- [ ] **Step 3：打包但暂不写 G 盘**

运行精确白名单打包、解压后的便携 Python smoke 和 LocalOnly preflight。记录新 ZIP SHA256、文件数和 package smoke instance ID。

- [ ] **Step 4：API/浏览器 smoke**

使用唯一临时端口且不调用付费上游，验证：

- health/version/instance ID。
- Host、Origin、CORS 和各类 body 413。
- /outputs 仅栅格 + nosniff。
- Studio 与 /classic 正常渲染。
- 启动本地/服务端会话合并。
- 保存参考图后前端采用稳定 /outputs URL。
- GPT/聊天现有可见能力边界不变。

结束后清理精确 PID、端口、fixtures、Playwright session 和临时目录。

- [ ] **Step 5：最终整分支审查**

审查 base f4afcd0b8d65b045091c6cafd4aa94b95cf3d484 到最新代码 HEAD。Critical/Important 必须为 0；若发现问题，回到对应任务补 RED/GREEN。

- [ ] **Step 6：本地全部通过后同步 G 盘**

运行：

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\sync_release_to_g.ps1 -SkipPackage
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\release_preflight.ps1 -ExpectedVersion 1.0.6

确认：

- 本地/G ZIP 哈希一致。
- 目标目录恰好符合发布 manifest，零禁入项。
- v1.0.5 ZIP 保持原哈希。
- 无同步临时目录。

- [ ] **Step 7：更新台账并提交**

记录最终 HEAD、测试计数、资产名、ZIP 哈希、package/API/browser smoke、最终审查结果和残余限制。运行 ledger check 和 git diff --check 后提交。

- [ ] **Step 8：进入分支收尾**

只向用户提供：

1. 本地合并 main。
2. Push 并创建 PR。
3. 保留分支。
4. 丢弃。

不主动 push、merge、删除分支或 worktree。
