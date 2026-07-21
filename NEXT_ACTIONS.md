# Next Actions

## Now
- [x] Integrate the verified v1.0.7 branch locally, create `codex/history-window-refactor-v1.0.8`, and refactor history into compact, full-browser and in-window-detail states without schema changes.
- [x] Complete the responsive/interaction follow-ups: explicit GPT-5.6 Sol/Terra/Luna presets, stable narrow header rows, browser-persisted composer height, a boundary drag rail without a floating reset control, and non-selectable full-surface session-card switching.
- [x] Add persisted lightweight mask-review snapshots, source-aware history detail return paths, preview-first Escape handling and a preview `查看详情` action at product commit `41f0b2d`.
- [x] Fix foreground preview focus and toolbar order, prevent background-history Escape handling, and keep the compact recent-history popover open during its own internal scrolling at product commit `7a6c528`.
- [x] Complete the mask reliability follow-up through `e5a2bc1` and `ccc6fdc`: diagnose both Alpha directions, reject targetless mask prompts before upstream, harden accepted prompts, disable mask prompt enhancement, and locally restore every unpainted pixel before saving. Final matrix: 151 Node, 242 Python, size/build/compile/portable-runtime/HTTP smoke green; `14261` serves `index-D8_S6x_5.js` / `index-DFqFlLMm.css`.
- [x] Inspect four real masked generations. The latest compatibility test still changed the protected person about 2.3 times more than the painted background, proving that Alpha direction alone is not a reliable containment mechanism.
- [ ] Hard-refresh `http://127.0.0.1:14261/`, reopen the base image, redraw the external background mask, keep `标准`, and run one low-cost single-image edit with a concrete target such as `把涂红的外部背景改成夜晚城市，人物保持不变`. Confirm the result row shows `严格保护`, the person is pixel-preserved, and only the painted region/edge appearance needs judgment. Then finish the pending history/preview interaction checks. Do not package, sync G:, push, tag or release without a new explicit instruction.

## Handoff Notes
- Start here: manually test the strict `标准` mask on `14261` with one concrete background replacement. The protected person should now be locally restored regardless of upstream behavior.
- Do not redo: Alpha-direction inspection, multipart/LiteLLM inspection, official-doc lookup, or the four prior paid comparisons. Their conclusion is encoded in strict post-compositing.
- Verify next: confirm a `严格保护` result preserves the person exactly and judge only whether the painted background changed usefully and whether the boundary seam is acceptable. If the painted region remains unchanged, add a full-resolution visual red-overlay reference rather than weakening protection. Then test Escape in the order `preview -> detail/origin -> history surface` and wheel/touchpad-scroll the compact history grid at a narrow width.
- Do not claim: reliable mask containment, browser manual acceptance, v1.0.8 merge, package/G: sync, push, tag, pull request, GitHub Release, or worktree/branch deletion.
- Release boundary: local `main` contains v1.0.7 through `af4afc0`; v1.0.8 remains isolated on `codex/history-window-refactor-v1.0.8`. G: remains unchanged. Current portable backend PID `37812` runs on `14261`; the existing `14260` service is separate.
- Current Studio assets: `index-D8_S6x_5.js` and `index-DFqFlLMm.css`.
- Known limits: automatic real-browser smoke is blocked by enterprise loopback policy; strict masks are capped at 8,294,400 pixels and may show slight edge seams; old records have no recoverable editable mask; new records persist only a review composite; the model still controls whether the painted region changes usefully.

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
