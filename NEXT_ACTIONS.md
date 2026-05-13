# Next Actions

## Now
- [x] Start v1.0.2 work on branch `codex/v1.0.2`, not directly on `main`.
- [x] Record the current-project sync rule: after every update, sync a clean copy to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- [x] Improve GPT Image 2 upstream 524 timeout messaging.
- [x] Add and pass a regression test for 524 timeout messaging.
- [x] Run frontend/package verification for the branch.
- [x] Sync the clean package copy to the G: target, excluding local artifacts and internal ledger files.
- [ ] Commit the v1.0.2 branch changes.
- [ ] Wait for user approval before merging `codex/v1.0.2` back to `main`.

## Handoff Notes
- Start here: `I:\AI\Vibe Coding\NM_web_imagen`, branch `codex/v1.0.2`; v1.0.2 is intentionally not merged to `main` yet.
- Synced copy: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Do not redo: Studio frontend scaffold, `/classic` fallback, real chat endpoints, backend Studio session persistence, GPT chat-model controls, reference snapshot display, and user-turn action buttons are already implemented and committed.
- Verify next: review the branch commit, then wait for user approval before merge.
- Do not claim: v1.0.2 is merged or released until the user approves merging `codex/v1.0.2` into `main`.
- Watch out for: `outputs/`, `config.local.json`, `.runtime/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, generated screenshots, and temporary zip files must remain out of commits and sync packages.
- Sync note: the G: destination should receive source, built static assets, launcher scripts, docs, tests, and vendor runtime files, but not local-only runtime/config/output data. Do not sync internal ledger files `AGENTS.md`, `PROJECT_STATUS.md`, `NEXT_ACTIONS.md`, or `DECISIONS.md`. Old `web_imagen_tool/` and `web_imagen_tool.zip` should remain untouched.
- AGENTS note: `AGENTS.md` has stale snapshot wording, but it explicitly says not to edit it unless the user asks.

## Later
- [ ] Decide whether `/classic` should remain long term or be retired in a separate cleanup phase.
- [ ] Consider adding a compact filter/search inside the persistent left history sidebar if history grows large.
- [ ] Consider adding a current-session export/import if Studio conversations need to move between machines.

## History
- [x] 2026-05-03: User requested staged commits and asked whether Project Ledger Loop was active.
- [x] 2026-05-10: Implemented the Studio-inspired local workbench plan.
- [x] 2026-05-11: Added backend persistence/chat improvements and began staged repo cleanup.
