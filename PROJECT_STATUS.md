# Project Status

## Current Snapshot
- Last Updated: 2026-05-11 15:35 +08:00
- Phase: Cleanup / Packaging Hygiene
- Branch: main
- Goal: Keep the Studio image tool shareable as `NM_web_imagen`, remove obsolete `web_imagen_tool` leftovers, and preserve the current backend persistence/chat work.
- Current Focus: The React/Vite Studio frontend is built into `static/studio` and served at `/`; the old static UI remains available at `/classic`. Backend Studio sessions persist in `outputs/studio_sessions.json`, reference snapshots persist under `outputs/session_refs/`, and local config/output/runtime folders stay out of commits/packages.

## Resume Here
- Start with: `git status --short --branch`
- Main changed files in the current cleanup: `package_web_tool.ps1`, `start_web.ps1`, `README.md`, `static/index.html`, `static/app.js`, `PROJECT_STATUS.md`, and `NEXT_ACTIONS.md`.
- Sync target after local commits: `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- Runtime artifacts should stay out of commits and sync packages: `outputs/`, `config.local.json`, `logs/`, `.chrome-debug/`, `.runtime/`, `.venv/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, `studio-web/tsconfig.tsbuildinfo`, generated screenshots, and temporary zips.

## Progress Summary
- [x] Implemented the React/Vite Studio frontend in `studio-web/`, built to `static/studio/`, and kept `/classic` as the rollback path for the old static UI.
- [x] Added real chat endpoints and frontend chat turns for GPT Image 2 / Banana flows.
- [x] Added user-turn action buttons for regenerate, copy prompt, and copy reference images.
- [x] Added backend Studio session persistence under `outputs/` with reference snapshot limits.
- [x] Added GPT chat model and reasoning-effort controls.
- [x] Removed reference chip left/right arrow controls while keeping drag sorting and previews.
- [x] Changed the Studio branch default port to `7861`.
- [x] Removed obsolete tracked `GwenImageGen.exe` in commit `c37f909`.
- [x] Renamed the default package zip and extracted folder from `web_imagen_tool` to `NM_web_imagen`.
- [x] Updated README, launcher error text, and `/classic` UI wording away from `web_tool` / `web_imagen_tool`.
- [x] Synced a package-clean copy to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- [x] Initialized the G: sync copy as a git repo on `main` with commit `9d66a70`.

## Verification
- Latest cleanup verification:
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `npm run build` from `studio-web`: passed.
  - `npm run test:size` from `studio-web`: passed.
  - `powershell -ExecutionPolicy Bypass -File .\package_web_tool.ps1 -OutputPath <temp zip>`: passed.
  - Package dry run produced root folder `NM_web_imagen/` and excluded `node_modules/`, `tsconfig.tsbuildinfo`, `config.local.json`, `outputs/`, `logs/`, and the removed `GwenImageGen.exe`.
  - `python C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py I:\AI\Vibe Coding\NM_web_imagen`: passed with 0 fail / 0 warn.
  - `python -m unittest tests.test_studio_sessions` in I: repo: passed.
  - `npm ci`, `npm run build`, `npm run test:size`, and `python -m unittest tests.test_studio_sessions` in the G: sync copy: passed before cleanup of temporary `node_modules/`.
  - After G: verification cleanup, excluded local/sync artifacts were absent: `config.local.json`, `outputs/`, `logs/`, `.runtime/`, `.venv/`, `.playwright-mcp/`, `GwenImageGen.exe`, `studio-web/node_modules/`, `studio-web/tsconfig.tsbuildinfo`, and internal ledger files.

## Blockers And Risks
- `AGENTS.md` still contains older project snapshot wording, but it explicitly says not to edit that file unless the user asks.
- `/classic` intentionally keeps old no-build static UI files; do not delete `static/index.html`, `static/app.js`, or `static/styles.css` unless the rollback path is intentionally retired.
- No live paid image-generation request is required for packaging cleanup.

## History
- 2026-05-03: Created ledger after the user explicitly asked about `project-ledger-loop`.
- 2026-05-10: Replaced the static skinning attempt with a React/Vite Studio frontend trial while preserving the FastAPI backend.
- 2026-05-11: Added backend session persistence, chat model controls, and cleanup of old package naming.
