# Next Actions

## Now
- [x] v1.0.2 is merged/tagged/released/synced, v1.0.3 direction is captured, and white-screen package audit/startup asset probing is already handled.
- [x] Implemented v1.0.3 core scope: multi-config profiles, editable config entry, key eye toggle, floating queue capsule/popover, queue controls, completed thumbnails/downloads, preview zoom/pan, and browser-local queue persistence.
- [x] Completed subagent review hardening: queue/session orphan handling, refresh-interrupted turn reconciliation, diagnostics endpoint redaction, strict stale-process recognition, profile-switch edit preservation, and current built asset inclusion.
- [x] Finalized v1.0.3 sync/package strategy: mirror only a clean package extraction to G:, remove local runtime/config/output artifacts from the sync folder, and update only `NM_web_imagen-v1.0.3.zip` in the share root.
- [x] Added and verified one-click release: `一键发布.bat` runs tests, build, backend checks, package sync, and release preflight.
- [x] Fixed queue execution semantics and re-ran one-click release: later jobs wait in `queued`, one generation request runs at a time, and the synced G: folder/versioned package include the serialized queue build.
- [x] Fixed GPT multi-image behavior for gateways that ignore `n`; user confirmed locally, then final one-click release sync updated the G: clean folder and `NM_web_imagen-v1.0.3.zip`.

## Handoff Notes
- Start here: `I:\AI\Vibe Coding\NM_web_imagen`, branch `codex/v1.0.3`; v1.0.2 is released at tag `v1.0.2` / commit `17f79c2`.
- Synced copy: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next after changes:
  - `node --test .\src\configProfiles.test.mjs .\src\configProfileSelection.test.mjs .\src\generationQueue.test.mjs .\src\queuePersistence.test.mjs .\src\queueSessionBoundaries.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`
  - `npm run build` from `studio-web`
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`
  - `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`
- Do not claim: v1.0.3 is committed, merged, or pushed.
- Current review evidence: full frontend test set including queue/session boundary tests passed, build passed, backend tests passed, py_compile passed, browser smoke loaded the new `index-CsE45KWn.js`/`index-CdRuknBN.css` without new console errors, `git diff --check` passed with only expected LF/CRLF warnings, and ledger check passed on 2026-05-26 20:45 +08:00. Rerun `git diff --check` after this ledger update.
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
