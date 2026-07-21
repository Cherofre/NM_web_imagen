# Next Actions

## Now
- [x] Integrate verified v1.0.7 locally, create `codex/history-window-refactor-v1.0.8`, refactor compact/full/detail history without schema changes, and complete the responsive header/model/composer/session-card follow-ups.
- [x] Complete mask review/history behavior and the model-guided containment decision through `41f0b2d`, `7a6c528`, and `8ff25c9`: keep a visible review snapshot, predictable preview/history Escape order, direct `查看详情`, red-selection upstream guidance and natural blending; reject both reverse-Alpha containment claims and hard local restoration with visible cut edges.
- [x] Fix the session-switch confirmation Cancel action: backdrop, X and Cancel now share one dismiss handler; cancel preserves the active session and current references. TDD red/green plus the full 152 Node, 242 Python, size/build/compile/diff/HTTP matrix passed; `14261` now serves `index-2X_EvAWd.js` / `index-DFqFlLMm.css` from PID `51720`.
- [x] Persist exact Alpha masks and add guarded per-turn deletion. `maskFileSnapshot` now survives refresh through `outputs/session_refs/`, regenerate restores encoding/coverage and never falls back unmasked, and deleting a completed turn prunes only its session attachments while preserving generated history/output images. Full matrix: 160 Node, 244 Python, size/build/compile/diff/HTTP smoke green; `14261` serves `index-jekAejtM.js` / `index-B-pQphnX.css` from PID `53128`.
- [x] Run the full pre-merge review, correct the release/cache identity from 1.0.7 to 1.0.8, and fast-forward the verified branch into local `main` through `cd3b1bd`. No conflict or merge commit was needed.
- [x] Remove controls duplicated between the composer and Advanced Parameters. GPT size/custom size/quality/count and Banana count/aspect/resolution now have one visible entry point; values, submission payloads, browser-local persistence and legacy config compatibility are unchanged. Commit `fd3c83b`; 161 Node, 244 Python, 33 release-cache, size/build/compile/diff/import/HTTP gates pass.
- [ ] Hard-refresh `http://127.0.0.1:14261/` and confirm: (1) create a new masked turn, wait for session save, refresh, then click regenerate and verify the new turn shows the same mask review and submits with mask guidance; (2) a pre-feature masked record without persisted Alpha still asks for redraw; (3) delete a completed turn, confirm its conversation row and completed queue row disappear while the generated image remains in history; (4) queued/running turns refuse deletion; (5) the neutral trash icon aligns with the other turn actions and only gains danger color on hover/focus; (6) Cancel, tall/wide editor fit and one low-cost natural masked result still pass. Do not package, sync G:, push, tag or release without a new explicit instruction.

## Handoff Notes
- Start here: hard-refresh `14261`, create a fresh masked turn, wait briefly for session persistence, refresh again and regenerate it. Then delete that completed turn and verify its generated image remains in history.
- Do not redo: Alpha-direction inspection, multipart/LiteLLM inspection, official-doc lookup, the four earlier paid comparisons, or the rejected hard-composite implementation. Their conclusion is encoded in `8ff25c9` and the superseded `ccc6fdc` decision.
- Verify next: a post-change refreshed masked turn must reuse the mask; only a pre-change record without `maskFileSnapshot` should block. Confirm completed-turn deletion preserves history/output images and active-turn deletion is refused. Then confirm portrait/landscape fit and one natural `遮罩引导` result.
- Do not claim: reliable mask containment, browser manual acceptance, package/G: sync, push, tag, pull request, GitHub Release, or worktree/branch deletion.
- Release boundary: local `main` contains the v1.0.8 product through `fd3c83b` plus the integration ledger commit; it has not been pushed or packaged. G: remains unchanged. Main-path backend PID `30812` runs on `14261`; the existing `14260` service remains separate at PID `56600`.
- Current Studio assets: `index-D_52QQcP.js` and `index-B-pQphnX.css`.
- Known limits: automatic real-browser smoke is blocked by enterprise loopback policy; mask guidance is capped at 8,294,400 pixels; records created before `maskFileSnapshot` cannot reconstruct exact Alpha; persisted masks support regenerate after refresh but do not yet reopen as an editable historical brush layer; the model may make small changes outside the selection and still controls whether the selected region changes usefully.

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
