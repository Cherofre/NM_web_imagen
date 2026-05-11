# Next Actions

## Now
- [x] Remove the obsolete tracked `GwenImageGen.exe` as its own commit.
- [x] Rename default packaging from `web_imagen_tool` to `NM_web_imagen`.
- [x] Refresh README, launcher error text, `/classic` strings, and ledger current state.
- [x] Run local verification: Python compile, Studio build, size tests, package dry run, and package-content inspection.
- [x] Commit the naming/docs cleanup as a second staged commit.
- [x] Sync committed project files to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen` without local config, outputs, logs, runtime caches, node modules, screenshots, temporary zips, or internal ledger files.
- [x] Run the same essential verification in the G: copy.

## Handoff Notes
- Start here: `I:\AI\Vibe Coding\NM_web_imagen`, branch `main`.
- Synced copy: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`, branch `main`, commit `9d66a70`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next: after cleanup edits, run `python -m py_compile .\app.py`, `npm run build`, `npm run test:size`, and a package dry run.
- Do not claim: live upstream generation success for this cleanup; this task is packaging/repo hygiene only.
- Watch out for: `outputs/`, `config.local.json`, `.runtime/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, generated screenshots, and temporary zip files must remain out of commits and sync packages.
- Sync note: the G: destination should receive source, built static assets, launcher scripts, docs, tests, and vendor runtime files, but not local-only runtime/config/output data.
- AGENTS note: `AGENTS.md` has stale snapshot wording, but it explicitly says not to edit it unless the user asks.

## Later
- [ ] Decide whether `/classic` should remain long term or be retired in a separate cleanup phase.
- [ ] Consider adding a compact filter/search inside the persistent left history sidebar if history grows large.
- [ ] Consider adding a current-session export/import if Studio conversations need to move between machines.

## History
- [x] 2026-05-03: User requested staged commits and asked whether Project Ledger Loop was active.
- [x] 2026-05-10: Implemented the Studio-inspired local workbench plan.
- [x] 2026-05-11: Added backend persistence/chat improvements and began staged repo cleanup.
