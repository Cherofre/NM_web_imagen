# Next Actions

## Now
- [x] Reproduce the chat context issue in tests: backend chat endpoints forwarded only the current prompt.
- [x] Add backend request-contract tests for GPT and Banana/Gemini context forwarding.
- [x] Add frontend context payload assembly from recent current-session turns.
- [x] Verify Python tests, Python compile, Vite build, size tests, and whitespace check.
- [x] Commit the chat-context fix.
- [x] Sync only `NM_web_imagen/` and `NM_web_imagen.zip` to the G: share target.

## Handoff Notes
- Start here: `I:\AI\Vibe Coding\NM_web_imagen`, branch `main`.
- Synced copy: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next: after sync, run `python -m py_compile .\NM_web_imagen\app.py`, inspect `NM_web_imagen.zip`, and confirm local-only artifacts are absent.
- Do not claim: live upstream generation success for this cleanup; this task is packaging/repo hygiene only.
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
