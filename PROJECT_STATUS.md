# Project Status

## Current Snapshot
- Last Updated: 2026-05-11 19:47 +08:00
- Phase: Composer Shortcut / Synced
- Branch: main
- Goal: Keep the Studio image tool shareable as the new `NM_web_imagen` line while preserving the old `web_imagen_tool` folder and zip for coexistence.
- Current Focus: The main composer supports Enter to submit and Shift+Enter to insert a newline.

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
- [x] Changed startup engine handling so the app defaults to GPT Image 2 even if backend defaults or browser storage previously selected Banana/Gemini.
- [x] Added engine-selection validation so Banana/Gemini missing-config prompts appear when the user clicks Banana/Gemini, not during GPT startup.
- [x] Synced the clean `NM_web_imagen/` package folder to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
- [x] Updated only `NM_web_imagen.zip`; `web_imagen_tool/` and `web_imagen_tool.zip` remain in place for coexistence.
- [x] Added chat context forwarding: frontend sends recent turn messages, backend forwards them to GPT chat messages and Banana/Gemini contents.
- [x] Synced the chat-context fix to the G: `NM_web_imagen/` folder and updated only `NM_web_imagen.zip`.
- [x] Added composer keyboard shortcut: Enter submits the current chat/generation request; Shift+Enter keeps textarea newline behavior; IME composition is ignored.
- [x] Synced the composer shortcut fix to the G: `NM_web_imagen/` folder and updated only `NM_web_imagen.zip`.

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
- Latest startup verification:
  - `npm run build` from `studio-web`: passed.
  - `npm run test:size` from `studio-web`: passed.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `python -m unittest tests.test_studio_sessions`: passed.
  - Browser smoke on `http://127.0.0.1:7862/` with temporary `active_engine: banana`, complete GPT config, and incomplete Banana config: opened with GPT Image 2 active, no connection drawer on startup, and Banana/Gemini click opened the drawer with missing API Key warning.
  - G: copy `$env:PYTHONUTF8='1'; python -m py_compile .\NM_web_imagen\app.py`: passed.
  - `NM_web_imagen.zip` contains root `NM_web_imagen\`, does not contain `web_imagen_tool\`, and has no excluded local artifacts.
  - G: `NM_web_imagen/` final artifact scan found no `config.local.json`, `outputs/`, `logs/`, `.runtime/`, `.venv/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, or `studio-web/tsconfig.tsbuildinfo`.
  - Old `web_imagen_tool.zip` remained unchanged at 14,889,614 bytes with timestamp `2026-05-11 15:20:57`.
- Latest chat-context verification:
  - `python -m unittest tests.test_studio_sessions`: passed, including GPT and Banana context forwarding tests.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `npm run build` from `studio-web`: passed.
  - `npm run test:size` from `studio-web`: passed.
  - `git diff --check`: no whitespace errors, only expected LF/CRLF warnings.
  - G: copy `$env:PYTHONUTF8='1'; python -m py_compile .\NM_web_imagen\app.py`: passed.
  - G: final artifact scan found no `config.local.json`, `outputs/`, `logs/`, `.runtime/`, `.venv/`, `.playwright-mcp/`, `.git`, `.svn`, `__pycache__/`, `studio-web/node_modules/`, or `studio-web/tsconfig.tsbuildinfo`.
  - New `NM_web_imagen.zip` contains `static/studio/assets/index-DMFT1-Y0.js`; old `web_imagen_tool.zip` remained unchanged at 14,889,614 bytes with timestamp `2026-05-11 15:20:57`.
- Latest composer shortcut verification:
  - `npm run build` from `studio-web`: passed.
  - `npm run test:size` from `studio-web`: passed.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `python -m unittest tests.test_studio_sessions`: passed.
  - `git diff --check`: no whitespace errors, only expected LF/CRLF warnings.
  - G: copy `$env:PYTHONUTF8='1'; python -m py_compile .\NM_web_imagen\app.py`: passed.
  - `NM_web_imagen.zip` contains `static/studio/assets/index-60ZvdiML.js`; old `web_imagen_tool.zip` remained unchanged at 14,889,614 bytes with timestamp `2026-05-11 15:20:57`.
  - G: final artifact scan found no `config.local.json`, `outputs/`, `logs/`, `.runtime/`, `.venv/`, `.playwright-mcp/`, `.git`, `.svn`, `__pycache__/`, `studio-web/node_modules/`, or `studio-web/tsconfig.tsbuildinfo`.

## Blockers And Risks
- `AGENTS.md` still contains older project snapshot wording, but it explicitly says not to edit that file unless the user asks.
- `/classic` intentionally keeps old no-build static UI files; do not delete `static/index.html`, `static/app.js`, or `static/styles.css` unless the rollback path is intentionally retired.
- No live paid image-generation request is required for packaging cleanup.
- Browser payload smoke could not be completed because the in-app browser navigation timed out; code-level build and backend request-contract tests cover the fix.
- `C:\Users\Cherofre\.codex\memories` from the project-local `AGENTS.md` could not be created on this machine due access denial; current global memory remains under `C:\Users\mumengfei\.codex\memories`.
- User clarified the share target should keep new and old packages side by side: do not delete or update `web_imagen_tool/` or `web_imagen_tool.zip` while syncing this fix.

## History
- 2026-05-03: Created ledger after the user explicitly asked about `project-ledger-loop`.
- 2026-05-10: Replaced the static skinning attempt with a React/Vite Studio frontend trial while preserving the FastAPI backend.
- 2026-05-11: Added backend session persistence, chat model controls, and cleanup of old package naming.
