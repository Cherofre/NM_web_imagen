# Next Actions

## Now
- [x] Diagnose the screenshot error as a backend request-construction issue, not a single-machine config problem.
- [x] Add and pass a regression test for Chinese reference-image filenames in GPT Image 2 edits requests.
- [x] Compile and run backend session tests.
- [x] Commit and push the upload filename fix.
- [x] Sync only `NM_web_imagen/` and `NM_web_imagen.zip` to the G: share target.
- [x] Verify the G: copy and zip still exclude local-only artifacts.

## Handoff Notes
- Start here: `I:\AI\Vibe Coding\NM_web_imagen`, branch `main`; GPT reference upload filename encoding fix is synced.
- Synced copy: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next: if this bug reappears on another machine, collect the full backend error and uploaded reference filename; the current regression covers non-ASCII multipart filenames.
- Do not claim: live upstream generation success on the user's coworker's machine; this fix verifies the backend no longer passes non-ASCII upload names into multipart requests.
- Watch out for: `outputs/`, `config.local.json`, `.runtime/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, generated screenshots, and temporary zip files must remain out of commits and sync packages.
- Sync note: the G: destination should receive source, built static assets, launcher scripts, docs, tests, and vendor runtime files, but not local-only runtime/config/output data. Old `web_imagen_tool/` and `web_imagen_tool.zip` should remain untouched.
- AGENTS note: `AGENTS.md` has stale snapshot wording, but it explicitly says not to edit it unless the user asks.

## Later
- [ ] Decide whether `/classic` should remain long term or be retired in a separate cleanup phase.
- [ ] Consider adding a compact filter/search inside the persistent left history sidebar if history grows large.
- [ ] Consider adding a current-session export/import if Studio conversations need to move between machines.

## History
- [x] 2026-05-03: User requested staged commits and asked whether Project Ledger Loop was active.
- [x] 2026-05-10: Implemented the Studio-inspired local workbench plan.
- [x] 2026-05-11: Added backend persistence/chat improvements and began staged repo cleanup.
