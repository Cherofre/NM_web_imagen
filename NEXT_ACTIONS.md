# Next Actions

## Now
- [x] v1.0.2 is merged to `main`, tagged, released, and synced to the G: clean package target.
- [x] Keep the latest review findings out of v1.0.2; user chose to discuss them in the next version instead.
- [ ] Before starting the next version branch, review the deferred planning items under `Later`.

## Handoff Notes
- Start here: `I:\AI\Vibe Coding\NM_web_imagen`, branch `main`; v1.0.2 is released at tag `v1.0.2` / commit `b15b3ab`.
- Synced copy: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next: when opening the next version branch, run the normal frontend/backend baseline before making changes.
- Do not claim: the deferred review findings are fixed; they are only recorded for next-version discussion.
- Watch out for: `outputs/`, `config.local.json`, `.runtime/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, generated screenshots, and temporary zip files must remain out of commits and sync packages.
- Sync note: the G: destination should receive source, built static assets, launcher scripts, docs, tests, and vendor runtime files, but not local-only runtime/config/output data. Do not sync internal ledger files `AGENTS.md`, `PROJECT_STATUS.md`, `NEXT_ACTIONS.md`, or `DECISIONS.md`. Old `web_imagen_tool/` and `web_imagen_tool.zip` should remain untouched.
- AGENTS note: `AGENTS.md` has stale snapshot wording, but it explicitly says not to edit it unless the user asks.

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
