# Next Actions

## Now (2026-09-23 v1.1.4 已正式发布)
- [x] 发布前 Python 294/294、Node 229/229、Rust 6/6、四包校验、网页离线启动及 frozen 后端 mock 验证通过。
- [x] 两处 G 盘干净网页工程、网页 ZIP、桌面三类包及解压便携版同步；各处预检和四类包 SHA256 对照通过。
- [x] 产品提交 `8a7a10b` 已推送，`v1.1.4` 标签指向该提交。
- [x] 中文正式 GitHub Release 已发布为 latest，四类包及对应 manifest/SHA256 共 12 个附件，远端大小和 SHA256 逐一核验通过。
- [ ] 用户退出旧版后手动安装 1.1.4 并复核原生窗口；当前运行的安装版未覆盖。
- [ ] 如后续希望旧客户端恢复应用内直装更新，需找回与内置公钥匹配的原 Tauri 签名私钥，再生成并验证签名 updater/feed。

### Handoff Notes — v1.1.4 已发布
- Start here: https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.1.4 、docs/release-notes-v1.1.4.md 与两处 G 盘 1.1.4 分发。
- Do not redo: 完整回归、包构建、两处 G 同步、Release 12 附件 SHA256 对照已通过。
- Verify next: 用户退出旧版后的手动安装与原生窗口体验；如找回私钥再单独验证签名更新。
- Do not claim: 旧客户端自动发现或应用内直装此版、用户安装版已覆盖、原生窗口或跨机器安装已验收。

## Now (2026-09-23 附加提示词命名)
- [x] 用户确认名称「附加提示词」后，统一桌面/窄屏/弹窗及英文对应文案，保持原有功能。
- [x] Node 229/229、Studio 构建与窄屏显示验证通过；本地四类 1.1.4 包已重建并通过清单、网页离线启动及打包后端 mock 验证。
- [ ] 用户安装现有本地 1.1.4 包后，复核原生窗口显示；当前安装版未被覆盖。
- [ ] GitHub 发布及 G 盘同步仍待用户后续请求；原 Tauri 更新签名密钥限制继续有效。

## Now (2026-09-23 配置弹窗滚动修复)
- [x] 修复开启聊天后模型字段和底部按钮被裁切的问题，保持原生 select，表单独立滚动。
- [x] Playwright 复现原问题；带 mock 诊断结果的四种窗口尺寸均能滚动选择聊天模型，保存/关闭按钮可见；Node 229/229 与 Studio 构建通过。
- [x] 四类 1.1.4 包重建、最终校验与本地发布预检通过；网页离线启动、frozen 后端启动/模拟生图通过。
- [ ] 用户安装版仍在运行；用户使用本轮安装包更新后再验收原窗口内操作，未自动覆盖安装。
- [ ] 发布/同步 G 盘仍待用户后续请求；原更新签名密钥限制继续有效。

### 2026-09-23 Handoff Notes
- Start here: docs/v1.1.4-config-scroll-fix.md 与本轮 _release 下的 1.1.4 包。
- Do not redo: 窄窗口、带诊断结果的聊天模型选择已用 mock 验证；未向真实上游生成图片。
- Verify next: 用户安装本轮 1.1.4 更新并复核实际桌面窗口；用户退出旧实例后可做便携窗口烟测。
- Do not claim: 用户当前已安装程序自动获得修复、原生桌面覆盖升级已验证、GitHub 已发布。

## Now (2026-09-17 1.1.4 已重新打包)
- [x] 模型刷新修复、桌面更新审查和修复纳入四类 1.1.4 包。
- [x] Node 229/229、Python 294/294、Rust 6/6；构建、四包校验、本地发布预检、网页离线启动和 frozen 后端模拟渠道验证通过。
- [ ] 如需发布，使用本轮 _release/desktop 与 _release/web 的 1.1.4 包，先按项目规则同步 G 盘，再发布；本轮未授权发布。
- [ ] 用户关闭正在运行的安装版后，可运行 scripts/smoke_desktop_portable.ps1 验证新便携窗口；真实旧版覆盖升级仍待验收。
- [ ] 若找回原 Tauri 私钥，重新生成签名 updater/portable 包及两个 feed，再验证旧客户端更新；否则旧用户手动安装一次 1.1.4。

### Latest Handoff Notes
- Start here: docs/v1.1.4-updater-review.md、docs/release-notes-v1.1.4.md 和本轮四类 1.1.4 包。
- Do not redo: 测试、构建、包校验、网页与后端烟测均已通过；用户已安装程序未被修改。
- Verify next: 用户退出旧实例后的便携窗口烟测，或按新请求执行发布/同步。
- Do not claim: 老客户端已可自动更新、1.1.4 已发布、完整下载/验签/替换/重启已端到端验证、已修复那一次未知日志的历史下载失败。

## Now (2026-09-17 模型列表刷新)
- [x] 修复读取列表只增不减的问题，成功读取后替换列表并移除失效的当前选择。
- [x] 定向 Node 20/20 测试及 Studio 构建通过，网页资源已更新。
- [ ] 桌面安装版/便携版需重新打包才包含本次修复；现有 1.1.4 包仍为 9 月 12 日构建。
- [ ] 使用新版点击读取模型列表，核对渠道实际返回内容；本次未对真实渠道做请求验证。

### Current Handoff Notes
- Start here: studio-web/src/App.tsx 的 fetchModelListForTarget 与 imageModelOptions.ts。
- Do not redo: 20 项定向测试及网页构建已通过。
- Verify next: 桌面交付时重新打包并验证刷新行为。
- Do not claim: 已安装桌面程序已更新、已有发行包包含修复、渠道必定按模型限制过滤 /v1/models。

## Now (2026-09-12 v1.1.4 打包，未发布)
- [x] 版本号同步到 1.1.4（VERSION / tauri.conf.json / Cargo.toml+Cargo.lock / App.tsx 两处 / `verify_v1_1_0_packages.ps1` 断言 / `tests/test_release_cache_busting.py` 断言）。
- [x] 按序构建四类包：普通安装器 → 离线 WebView2 安装器 → 便携包（-SkipBuild）→ 网页包；产物在 `_release/desktop/` 与 `_release/web/`（名称含 v1.1.4，附 manifest + sha256）。
- [x] 验证：294/294 Python、226/226 Node、`verify_v1_1_0_packages.ps1`、`release_preflight.ps1 -LocalOnly -ExpectedVersion 1.1.4`、`smoke_desktop_backend.ps1`、`release_package_smoke.ps1` 全通过；打包后端 frozen exe 对 mock 渠道 n=3→3 张（上游 n 序列 `[3,1,1,1]`）。
- [x] 便携包渲染烟测：用户在 2026-09-12 关闭安装版后补跑，`smoke_desktop_portable.ps1 -ZipPath .\_release\desktop\NM-Image-Studio-v1.1.4-Portable-x64.zip` 通过（窗口渲染 + 外部文件拖拽成参考图）。
- [ ] 是否提交/推送/发 Release/同步 G 盘待用户决定（本轮明确「先不发布」）。
- [ ] 渠道恢复后建议重跑一次真实付费验收：`python .runtime\probe_gpt_count.py --url http://127.0.0.1:7861 --n 2`（当前渠道上游 503 停摆，见下）。

## Now (2026-09-11 生成数量根因)
- [x] 定位「生成数量设了没用」根因：渠道只接受 `n=1`（`400 n currently supports 1 only`），非前端/后端丢参。
- [x] 修复 `app.py`：命中该 400 时降级 `n=1` 并逐张补齐，`meta.count_strategy` 记录 `per-image`；新增 4 个回归测试。
- [x] 真实渠道实测：修复前同请求 400（0.7s，即用户看到的报错），修复后 `n=4` 得 4 张（110.8s，$0.1422）。详见 `docs/gpt-image-2-count-limit-root-cause.md`。
- [ ] 桌面版生效需**重新打包后端与四类包**（源码修复不会自动进入已安装的 `nm-image-studio-backend.exe`）；是否发 v1.1.4 待用户决定。
- [x] （2026-09-12）已完成打包：源码修复已进四类包；见上方 v1.1.4 打包小节。
- [ ] 可选：向用户确认是否愿意承担 N 倍费用逐个验证「KB/XJ/1K/CX」等其余渠道是否也只支持单张（当前由同一判定兜底）。

## Now (v1.1.3 发行遗留)
- [x] 按用户本轮要求补发 GitHub Release v1.1.3；推送提交和标签，12 个附件 SHA256 核验一致。
- [x] 完成 1.1.3 缺陷修复、290 Python/226 Node 回归与四类包构建。
- [x] 最终 ZIP 通过中文路径、系统 PATH、全新 WebView、正常渲染及外部文件拖入验证；网页包启动和 boot-guard HTTP 检查通过。
- [x] 同步两处 G 盘干净工程与桌面分发；本地及两处预检通过。
- [ ] 在另一台 Windows 10/11 x64 做真实安装/升级验收，特别是缺 WebView2 场景。
- [ ] 若继续追查 sunburst 效果，请向渠道提供 edits + 4 图 + 时间证据，或经用户同意进行一次受控付费对照；当前未证实上游根因。

## Handoff Notes
- Start here: docs/v1.1.3-review.md 与 _release/desktop/*v1.1.3*；本轮已完成本地、G 盘及 GitHub Release v1.1.3 交付。
- Do not redo: 已通过的完整测试、四类包构建、最终 ZIP 兼容烟测和 G 盘同步。
- Verify next: 用户安装新的 1.1.3 后验收真实 Explorer 拖入、覆盖升级与异机离线安装。
- Do not claim: 上游 sunburst 已修复、任何电脑必定可运行、真实跨机或覆盖安装已验证、原安装目录已升级。
- Notes: 旧程序已恢复打开，测试调试参数已移除；原有 .impeccable/ 和 PRODUCT.md 未纳入本轮修改。

## Previous 1.1.2 Actions
### Completed release actions
- [x] 完成发布前审查，并修复 `docs/v1.1.2-pre-release-review.md` 的 F1–F5。
- [x] 将复现转成正式行为回归；223 Node / 287 Python 测试、前端构建、尺寸规则和 Python 编译通过。
- [x] 补全中文 release notes 的配置管理、修复与旧候选配置兼容性说明。
- [x] 关闭开发实例后按 普通安装器 → 离线 WebView2 安装器 → 便携包 → 网页包 的顺序构建四类发行包（网页包最后生成）。
- [x] 修正发行清单白名单，允许 Studio 代码分块 `static/studio/assets/<name>-<8位hash>.(js|css)`（1.1.2 新增 `webview-*.js`），并补 Node 回归断言。
- [x] 提交并推送 `main`（`de4281c`）、打 `v1.1.2` 标签，同步两处 G 盘并跑通全量预检，发布 GitHub Release `v1.1.2`（2026-09-10）。
- [x] 用户验收时发现桌面端白屏 + 安装界面英文：定位 `import.meta` 经典脚本解析失败（CDP 实证）与 NSIS 语言记忆，已修复并加防复发断言。
- [x] 修复首次使用设置里"使用文档"选项显示提示文案（看起来被禁用）、向导按钮未套用主题样式、主按钮无圆角。
- [x] 重建四类包（网页包最后），`verify_v1_1_0_packages.ps1`、便携包渲染烟测、本地与两处 G 盘全量预检全部通过；同版本**覆盖替换** GitHub Release 12 个附件与两处 G 盘（含 `NM Image Studio Desktop` 安装版/离线安装版/便携版），四个包 digest 与线上逐一核对一致。
- [ ] 用户在真实安装/便携实例上按 `docs/v1.1.2-acceptance-checklist.md` 重新验收；**已装过旧 1.1.2 的机器必须用修复版覆盖升级**。

## Handoff Notes
- Start here: 1.1.2 修复版已重新发布并同步完毕；接下来的工作重点是用户重新验收，以及自动更新签名链路 / Authenticode 签名（本次发布不含）。
- Do not redo: F1–F5 源码修复、白屏/语言修复、自动化验证、四类包构建、包核验、本地与两处 G 盘全量预检、烟测、GitHub Release 覆盖上传。四类包哈希与 G 盘清单见 `PROJECT_STATUS.md`。
- Verify next: 用户重新验收（覆盖安装、首次使用设置、模型切换、配置导入导出与共用、缩放）；若要做自动更新，需要配置签名密钥并生成测试 feed，不能用源码检查或普通安装包替代。
- Notes: 同步 G 盘时必须先把 `_release\web\NM_web_imagen-v1.1.2-Web-x64.zip` 原样复制为 `..\NM_web_imagen-v1.1.2.zip`（即 `I:\AI\Vibe Coding\NM_web_imagen-v1.1.2.zip`），再用 `sync_release_to_g.ps1 -SkipPackage`；桌面发行目录（`NM Image Studio Desktop`）由 `scripts/prepare_desktop_distribution.ps1 -DestinationRoot <root>` 单独刷新，`sync_release_to_g.ps1` **不会**碰它。编辑带中文的根目录 `.ps1`（`package_web_tool.ps1`、`release_preflight.ps1`、`sync_release_to_g.ps1`）后必须确认 UTF-8 BOM 仍在。打包前必须关闭运行中的 `nm-image-studio-desktop` / `nm-image-studio-backend`（否则 `os error 32`）与残留 `makensis`。
- Do not claim: 真实覆盖升级已验收、自动更新链路已验收、Authenticode 已签名。

## Published v1.1.2 Checklist
- [x] Fix F1–F5 from the pre-release review and turn the reproducer into a green behavior regression.
- [x] Add the model switcher inside one profile, config export/import, engine tabs, engine-scoped model lists, chat off by default, Chinese/English overwrite installer, and desktop UI zoom.
- [x] Build the normal installer, offline WebView2 installer, portable desktop package, and web package; web ZIP last.
- [x] Allow Studio code-split chunks in the release manifest allowlist; keep `index-*` counting intact.
- [x] Pass Node and Python suites, package verification, local preflight, and the portable/coexistence/backend smokes.
- [x] Publish GitHub Release `v1.1.2` with 12 assets (four packages plus manifests and SHA256 sidecars) and synchronize both approved G: roots.
- [x] Rebuild and re-publish all four packages after the white-screen and installer-language fixes, replacing the broken assets in place (no version bump, per user decision).
- [x] Make the portable smoke assert that the window actually renders, and ship `static/studio/boot-guard.js` so a future load failure is reportable instead of blank.
- [ ] Prove a real overwrite upgrade and the updater feed on a test Release; add Authenticode signing before distributing to ordinary Windows users.

## Previous v1.1.1 Checklist
- [x] Bump to v1.1.1, publish GitHub Release `v1.1.1`, and synchronize both approved G: roots without reusing the v1.1.0 tag (2026-08-29).
- [x] Desktop notifications/taskbar/tray behavior, unified storage buttons, hot-switched output roots, migration discovery (`output`/`outputs` plus bounded nested search), and folder-picker path sanitization are implemented.
- [x] Add a separate localized “打开文件夹 / Open folder” action to the post-download toast and remove the pre-download folder action from the image “更多” menu.
- [ ] Manually verify the published v1.1.1 desktop UI flows (wizard, folder picker, migration, storage switch, save/download/open-folder, tray/notifications/shortcuts) on a clean or currently approved test install.
- [ ] Use a later test Release to prove 1.1.0 → 1.1.1 installed and portable update flows; add Authenticode signing if distributing to ordinary Windows users.

## Earlier v1.1.2 Candidate Checklist (superseded)
- [x] Model switching inside one profile: drawer dropdown + `/api/models` fetch from the profile's own API address + free-text model id; composer quick switcher in the generation-settings area; cached list travels as `model_options` and is filtered out of generation requests.
- [x] Installer: Simplified Chinese + English language selector and unconditional overwrite install (no "uninstall first" choice page), validated by real `tauri bundle` runs for both the online and offline WebView2 flavors.
- [x] Whole-interface zoom on desktop (`Ctrl` + `+` / `-` / `0`, `Ctrl` + wheel, 80%–160%, persisted) plus the `core:webview:allow-set-webview-zoom` capability.
- [x] Automated gates green: 190 Node tests, 272 Python tests, TypeScript/Vite build, Studio size rules, release cache-busting assertions.
- [ ] User acceptance on the desktop dev instance: model fetch/switch (including switching profiles, where the cached list must not leak) and UI zoom. Checklist: `docs/v1.1.2-acceptance-checklist.md`.
- [ ] Package 1.1.2 after that confirmation. **Close the running dev instance first** — its sidecar locks `studio-web/src-tauri/backend` and `desktop:prepare` now refuses to run while that is the case. Then, from `studio-web`, run `npm run desktop:installer`, `npm run desktop:installer:offline`, `npm run desktop:package`, `npm run web:package` (each `tauri build` re-runs `npm run build && npm run desktop:prepare`), then `npm run desktop:verify-packages` and `powershell -File .\release_preflight.ps1 -ExpectedVersion 1.1.2 -LocalOnly` in the repo root. Do **not** use `release_one_click.ps1` for this: it is the web-only pipeline and it ends by syncing to G:.
- [ ] Refresh `PROJECT_STATUS.md`, this file, and `docs/release-notes-v1.1.2.md` with the final hashes, then publish/sync only if the user asks; the updater feed stays at v1.1.0 (no signing key in this build environment).

## Previous v1.0.9 Checklist
- [x] Make `复制参考图` restore the same reusable Alpha mask as `再次生成` when the turn has a valid persisted or page-local mask.
- [x] Keep the copied mask base as reference 1, preserve existing composer references behind it, respect the GPT 16-image limit, and switch to GPT Image 2 generation mode.
- [x] Add Chinese and English action labels plus explicit success, limited-copy, missing-Alpha and missing-base notices.
- [x] Pass 164 Node tests, 247 Python tests, Studio size rules, Python compilation, TypeScript/Vite build, real narrow-screen browser checks and clean-package smoke.
- [x] Fast-forward the verified branch into `main`, publish GitHub Release `v1.0.9`, and synchronize both approved G: roots.
- [ ] Monitor user feedback from v1.0.9 and create a new `codex/` branch before further product changes.

## Historical v1.1.1 Handoff Notes
- Start here: continue on `codex/desktop-distribution-cn`; the latest download-toast change is in `studio-web/src/App.tsx`, `studio-web/src/i18n.ts`, `studio-web/src/styles.css`, and `studio-web/src/uiPolish.test.mjs`.
- Do not redo: the completed 171 Node + 251 Python tests, Tauri/PyInstaller build, normal/offline installer smoke, portable/web package smoke, coexistence smoke, signature/feed smoke, or local pre-release audit.
- Verify next: use a local signed test feed or test Release to prove update-available, invalid-signature, install-from-old-version, and portable download states.
- Do not claim: a real 1.1.0 → 1.1.1 upgrade, Authenticode signing, clean-machine no-WebView2 UI acceptance, a true single-file runtime, full drag/drop/clipboard/mask/DPI acceptance, or installer extraction smoke on this already-installed machine.
- Do not claim: manual tray/notification acceptance until the currently running installed instance is closed and the release EXE is tested alone.
- Notification identity note: an uninstalled `target\release` EXE may be attributed to PowerShell by Windows; verify the packaged installed Setup for the NM Image Studio source name.
- Debug-console usage: open the release EXE, press `Ctrl+,`, choose `存储与日志`, then click `打开调试窗口`; this tails the current backend log and does not restart the sidecar.
- Download feedback: after desktop 下载 succeeds, the toast offers `打开文件夹`; clicking it opens the system Downloads directory and dismisses the toast on success. Web mode keeps the browser download-list hint.
- Shortcut usage: open `桌面设置 → 快捷键`, click a binding, press a combination containing Ctrl/Alt/Meta, or use `清空` to disable it. `恢复默认` resets all six desktop-global shortcuts. Enter and Shift+Enter remain input behavior.
- Updater boundary: About now exposes the implemented desktop update surface. Installed builds use the Tauri signed Setup updater artifact; portable builds download a signed ZIP without self-replacement; web mode remains outside the updater. No silent update, automatic rollback helper, or publication is implemented.
- DPAPI boundary: only the Tauri desktop sidecar sets `IMAGE_TOOL_DESKTOP_MODE=1`; web mode keeps the existing plaintext `config.local.json` compatibility path. Desktop plaintext config is migrated in place on first read, while `.bak` is rewritten with encrypted content.
- Verification caveat: portable ZIP creation and extracted-package startup smoke passed with the dedicated scripts; a missing-WebView2 machine has not been simulated, so only the registry-check code path is compiled and reviewed.
- Current feature caveat: the new portable smoke must be rerun after closing the already-running installed NM Image Studio instance; the failure observed on 2026-08-25 was the existing single-instance guard exiting the second shell with code 0, not a backend startup error.
- Storage behavior: migration copies the selected `outputs`, `data\outputs`, or direct output directory into the current output root and renames the old target to a timestamped `.backup-*` sibling. Output-root changes persist in `desktop-storage.json`; the Tauri shell and running FastAPI sidecar now switch to the copied directory immediately.
- Packaging recommendation: one Setup EXE for installation; one portable ZIP containing the complete application folder; do not use PyInstaller `onefile` for the runtime.
- Security note: per-run API/output tokens are proven; five Node build-chain audit findings remain and should be handled with a controlled Vite major upgrade in the formal branch.
- Pre-release audit: `docs/NM-Image-Studio-v1.1.0-pre-release-audit.md` records the passed matrix, exact artifact hashes, current blockers, and machine/environment limits.
- Release boundary: v1.1.1 is published at `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.1.1`; both G: destinations passed manifest and SHA256 verification. This release contains manual-install packages only; updater/feed remains at v1.1.0 until the signing key is restored.
- Dirty worktree: current console/model follow-up and generated Studio assets are intentional; `.impeccable/` and `PRODUCT.md` are unrelated user files and must remain untouched.

## Previous v1.0.9 Handoff Notes
- Start here: use `main` / `v1.0.9` as the published baseline and review new user feedback before selecting the next change.
- Do not redo: mask payload persistence, regeneration/copy restoration, single-call guidance, v1.0.9 build/package smoke, GitHub publication, or either G: synchronization.
- Do not add: a preliminary chat/Responses/vision request for mask-intent parsing. Keep the solution single-call.
- Verify next: for any follow-up, rerun the smallest relevant tests plus the release matrix before replacing either distribution folder.
- Do not claim: a paid upstream generation was run during the v1.0.9 release gate; browser acceptance covered UI interaction and layering only.
- Release boundary: v1.0.9 is live at `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.0.9`; both G: destinations passed manifest and SHA256 verification.
- Current Studio assets: `index-CIdUE-oK.js` and `index-DjxhBbZl.css`.
- Known limits: pre-persistence records without `maskFileSnapshot` can copy images but cannot reconstruct the original Alpha; mask guidance remains prompt-based and can drift slightly outside the selected region.

## Prior Release Context
- Historical start point: `I:\AI\Vibe Coding\NM_web_imagen`, branch `main`.
- Synced copy on this machine: `G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Current v1.0.5 packages: local `I:\AI\Vibe Coding\NM_web_imagen-v1.0.5.zip`, share `G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen-v1.0.5.zip`, SHA256 `7c8e671fb1c00141243cd84427b0c202e9e2be9e8ef23d9537c93787fbe77109`.
- GitHub Release: `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.0.5`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next after changes:
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`
  - `git status --short --branch`
- Do not claim: v1.0.5 feature branch was deleted locally or remotely; it is preserved for now.
- Current review evidence: final one-click release passed on `main` on 2026-06-26 17:33 +08:00; local and G: zips share SHA256 `7c8e671fb1c00141243cd84427b0c202e9e2be9e8ef23d9537c93787fbe77109`; final post-fix subagent Important finding is fixed.
- Current queue bug evidence: the stuck second task was a real upstream request that eventually timed out, not just stale UI; the fix adds `generationQueue.ts`, queued turn rendering, active-job-preserving trimming, and active-remove-as-cancel so only one generation request runs at a time.
- Current multi-image evidence: `n=2` was already sent and recorded, but the active GPT gateway returned one image; backend now compensates by requesting the missing remainder.
- Watch out for: `outputs/`, `config.local.json`, `.runtime/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, generated screenshots, and temporary zip files must remain out of commits and sync packages.
- White-screen startup note: if the backend is already running, `start_web.ps1` must validate the root page JS/CSS assets, not just `/api/health`, because an old in-memory backend can read new `index.html` but lack the new `/assets` mount.
- Sync note: the G: destination should receive source, built static assets, launcher scripts, docs, tests, and vendor runtime files, but not local-only runtime/config/output data. Do not sync internal ledger files `AGENTS.md`, `PROJECT_STATUS.md`, `NEXT_ACTIONS.md`, or `DECISIONS.md`. Old `web_imagen_tool/` and `web_imagen_tool.zip` should remain untouched.
- Package note: only versioned zips such as `NM_web_imagen-v1.0.3.zip` are synced now. The existing unversioned `NM_web_imagen.zip` in the share root is left untouched for the user to delete later.
- One-click release note: double-click `一键发布.bat` or run `powershell -NoProfile -ExecutionPolicy Bypass -File .\release_one_click.ps1`.
- AGENTS note: `AGENTS.md` has stale snapshot wording, but it explicitly says not to edit it unless the user asks.
- Compatibility note: new `config.local.json` saves must continue writing legacy `forms` beside `profiles`; old configs with only `forms` must still load and receive URL-derived default profile names.

## v1.0.3 Confirmed
- [x] Config profiles: save multiple API/model configurations, support switching, editing, renaming, deleting, and marking a default/active profile.
- [x] Queue: image generation submits as a job instead of blocking the whole workbench; show pending/running/done/failed states.
- [x] Queue job controls: cancel, retry, duplicate/apply parameters, remove item, clear completed.
- [x] Diagnostics: minimal check for generation and chat separately, including clear warning when only one side works.
- [x] Non-blocking use: users can edit prompts and submit more work while image jobs run; browser smoke uses a mocked image endpoint so no paid upstream call is made.
- [x] UI polish: queue capsule/popover/row material, prompt-derived titles, preview actions, and resizable queue popover are implemented.

## v1.0.3 Suggested Additions
- [x] Queue persistence decision: keep queue metadata browser-local; refresh preserves finished jobs and marks queued/running jobs canceled instead of pretending HTTP requests survived.
- [x] Session/reference boundary: submitted jobs snapshot references at submit time; active jobs now block session deletion/clear, and orphan queue actions are guarded. Unsubmitted composer references remain global by existing decision.
- [x] Diagnostics detail: show endpoint, model, latency, capability result, and sanitized error; never log or expose API keys.
- [x] Current config entry display: show a custom profile name when set, otherwise a shortened URL-derived name without protocol/common suffixes, and make the entry clearly look clickable/editable.
- [ ] About/version panel: show current version, release/build info, and copyable diagnostics for another computer.
- [x] Release preflight script: verify `VERSION`, Studio assets, package exclusions, and G: sync readiness.

## Later
- [ ] If the user confirms, add a compact `图片库` trigger beside the composer reference button. Open a non-modal image tray with `本会话 / 最近历史 / 收藏` tabs, quick preview/reference/favorite actions, and a footer link to the full history window; use a bottom sheet on narrow screens instead of a permanent right rail.
- [ ] Next version: change history "套用参数" so missing `context_prompt / negative_prompt / poster_text` fields do not clear the current session prompt drafts; only explicit history fields should overwrite.
- [ ] Next version: reconsider chat-mode helper text. Current behavior calls the chat API but does not generate images; wording should not imply it is purely local/offline.
- [ ] Next version: broaden `.svnignore` to match the package-clean exclusions for `.playwright-mcp`, `studio-web/node_modules`, `studio-web/tsconfig.tsbuildinfo`, root screenshots/images, and related local artifacts.
- [ ] Decide whether `/classic` should remain long term or be retired in a separate cleanup phase. If it is kept, give `static/app.js` the same model fetching/switching affordance the Studio got in 1.1.2 (today the classic page still has a plain text model input, and the web package opens the classic entry).
- [ ] Consider adding a compact filter/search inside the persistent left history sidebar if history grows large.
- [ ] Consider adding a current-session export/import if Studio conversations need to move between machines.

## History
- [x] 2026-05-03: User requested staged commits and asked whether Project Ledger Loop was active.
- [x] 2026-05-10: Implemented the Studio-inspired local workbench plan.
- [x] 2026-05-11: Added backend persistence/chat improvements and began staged repo cleanup.
