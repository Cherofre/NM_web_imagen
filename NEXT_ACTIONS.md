# Next Actions

## Now
- [x] Bump the local release candidate to v1.1.1 across VERSION, Tauri/Cargo metadata, versioned smoke defaults and release assertions; rebuild and verify local artifacts (2026-08-28).
- [ ] After manual desktop acceptance, decide whether to publish v1.1.1 and synchronize both approved G: roots; do not reuse the v1.1.0 tag.
- [x] Desktop notifications/taskbar/tray behavior, unified storage buttons, hot-switched output roots, migration discovery (`output`/`outputs` plus bounded nested search), and folder-picker path sanitization are implemented.
- [x] Add a separate localized “打开文件夹 / Open folder” action to the post-download toast and remove the pre-download folder action from the image “更多” menu.
- [ ] Manually verify the rebuilt EXE's native UI flows (wizard, folder picker, migration, storage switch, save/download/open-folder, tray/notifications/shortcuts) on a clean or currently approved test install.
- [ ] Use a later test Release to prove 1.1.0 → 1.1.1 installed and portable update flows; add Authenticode signing if distributing to ordinary Windows users.

## Previous v1.0.9 Checklist
- [x] Make `复制参考图` restore the same reusable Alpha mask as `再次生成` when the turn has a valid persisted or page-local mask.
- [x] Keep the copied mask base as reference 1, preserve existing composer references behind it, respect the GPT 16-image limit, and switch to GPT Image 2 generation mode.
- [x] Add Chinese and English action labels plus explicit success, limited-copy, missing-Alpha and missing-base notices.
- [x] Pass 164 Node tests, 247 Python tests, Studio size rules, Python compilation, TypeScript/Vite build, real narrow-screen browser checks and clean-package smoke.
- [x] Fast-forward the verified branch into `main`, publish GitHub Release `v1.0.9`, and synchronize both approved G: roots.
- [ ] Monitor user feedback from v1.0.9 and create a new `codex/` branch before further product changes.

## Handoff Notes
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
- Release boundary: v1.1.0 is published at `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.1.0`; both G: destinations passed manifest and SHA256 verification.
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
- [ ] Decide whether `/classic` should remain long term or be retired in a separate cleanup phase.
- [ ] Consider adding a compact filter/search inside the persistent left history sidebar if history grows large.
- [ ] Consider adding a current-session export/import if Studio conversations need to move between machines.

## History
- [x] 2026-05-03: User requested staged commits and asked whether Project Ledger Loop was active.
- [x] 2026-05-10: Implemented the Studio-inspired local workbench plan.
- [x] 2026-05-11: Added backend persistence/chat improvements and began staged repo cleanup.
