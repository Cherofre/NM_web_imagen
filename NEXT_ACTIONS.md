# Next Actions

## Now
- [x] Integrate the verified v1.0.7 branch locally, create `codex/history-window-refactor-v1.0.8`, and refactor history into compact, full-browser and in-window-detail states without schema changes.
- [x] Complete the responsive/interaction follow-ups: explicit GPT-5.6 Sol/Terra/Luna presets, stable narrow header rows, browser-persisted composer height, a boundary drag rail without a floating reset control, and non-selectable full-surface session-card switching.
- [x] Add persisted lightweight mask-review snapshots, source-aware history detail return paths, preview-first Escape handling and a preview `查看详情` action at product commit `41f0b2d`.
- [x] Fix foreground preview focus and toolbar order, prevent background-history Escape handling, and keep the compact recent-history popover open during its own internal scrolling at product commit `7a6c528`.
- [x] Verify 147/147 Node tests, 239/239 Python tests, size rules, warning-free production build, 33/33 release-cache tests, `app.py` compile and diff check; branch Uvicorn PID `48232` is healthy on `14261` and serves `index-hlp9jyMM.js` / `index-CEN8B5E_.css`.
- [x] Run one real masked generation and inspect the saved base/review/result. Manual evidence shows the background was selected correctly but the protected character changed about 3.6 times more than the selected area, so mask behavior is rejected even though request construction is correct.
- [ ] Before merge, choose and implement the mask follow-up: at minimum add automatic preservation constraints plus a warning for targetless mask prompts; decide separately whether exact outside-mask pixel restoration is worth the larger compositing path. Re-run a real masked background edit plus the pending history/preview checks. Do not package, sync G:, push, tag or release without a new explicit instruction.

## Handoff Notes
- Start here: decide the mask reliability level. The small fix is prompt hardening and targetless-prompt validation; the strict fix additionally composites the original outside-mask pixels back over the model result.
- Do not redo: alpha-direction inspection, multipart inspection, official-doc lookup, or the base/review/result comparison. The local tool exports painted pixels transparent and sends `mask`; the current uncertainty is model/gateway adherence, not mask inversion.
- Verify next: after the chosen mask fix, repeat the same background-mask case with a concrete replacement target and compare selected versus protected-region drift. Then test Escape in the order `preview -> detail/origin -> history surface` and wheel/touchpad-scroll the compact history grid at a narrow width.
- Do not claim: reliable mask containment, browser manual acceptance, v1.0.8 merge, package/G: sync, push, tag, pull request, GitHub Release, or worktree/branch deletion.
- Release boundary: local `main` contains v1.0.7 through `af4afc0`; v1.0.8 remains isolated on `codex/history-window-refactor-v1.0.8`. G: remains unchanged. Current branch service PID `48232` runs on `14261`; the existing `14260` service is separate.
- Current Studio assets: `index-hlp9jyMM.js` and `index-CEN8B5E_.css`.
- Known limits: automatic real-browser smoke is blocked by enterprise loopback policy; old records have no recoverable mask data; new records persist only a review composite, not the editable full mask; GPT Image mask boundaries are prompt guidance rather than a hard cutout; custom gateways must faithfully support edits multipart `image[]` and `mask`.

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
