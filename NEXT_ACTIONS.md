# Next Actions

## Now
- [x] Verify the startup regression locally: force backend defaults to Banana/Gemini, keep GPT config complete, leave Banana incomplete, and confirm startup stays on GPT.
- [x] Confirm clicking Banana/Gemini opens its config warning only after user selection.
- [x] Commit the GPT-default startup fix and rebuilt Studio assets.
- [x] Sync only `NM_web_imagen/` to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- [x] Update only `NM_web_imagen.zip`.
- [x] Leave `web_imagen_tool/` and `web_imagen_tool.zip` intact for new/old coexistence.

## Handoff Notes
- Start here: `I:\AI\Vibe Coding\NM_web_imagen`, branch `main`.
- Synced copy: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next: for any future change, rerun `npm run build`, `npm run test:size`, `python -m py_compile .\app.py`, then package via `package_web_tool.ps1`.
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
