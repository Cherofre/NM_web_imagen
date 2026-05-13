# Decisions

## Active Decisions
- 2026-05-13: Build v1.0.2 on `codex/v1.0.2` first; merge to `main` only after verification and user approval.
- 2026-05-13: After every update, sync a clean package copy to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`, excluding local artifacts and internal ledger files.
- 2026-05-13: For GPT Image 2 upstream 524 responses, show a specific Chinese gateway-timeout explanation instead of surfacing only raw HTML or generic upstream text.
- 2026-05-12: For GPT Image 2 edits multipart uploads, keep original reference image names for local display/metadata but send ASCII-safe request filenames to avoid `requests/urllib3` header encoding failures on non-English Windows filenames.
- 2026-05-11: Keep new and old share packages side by side; update only `NM_web_imagen/` and `NM_web_imagen.zip`, leaving `web_imagen_tool/` and `web_imagen_tool.zip` intact.
- 2026-05-11: Always start the Studio UI on GPT Image 2 and defer Banana/Gemini config validation until the user selects Banana/Gemini.
- 2026-05-10: Keep the Studio-inspired conversation stream browser-local only and do not write it into `outputs/history.json`.
- 2026-05-10: Use `7861` as this Studio branch's default port so it can coexist with the main/simple branch on `7860`.
- 2026-05-10: Save only connection fields in `config.local.json`; generation parameters should come from frontend defaults unless changed per request.
- 2026-05-10: Keep header connection configuration as a compact API Key / URL / model modal, while full generation controls stay behind the composer `高级参数` modal.
- 2026-05-10: Keep GPT composer size presets as 1K/2K/4K plus aspect ratios, with custom width/height as an explicit correction/apply path.
- 2026-05-10: Trial a small React/Vite Studio frontend while preserving the existing FastAPI backend and URL + Key + model workflow.
- 2026-05-10: Make the left sidebar default to browser-local conversations and keep old card-style generation records under a separate history素材 tab.
- 2026-05-10: Keep left history as generation-context records, not full backend conversations; open them in a detail modal showing prompt, images, parameters, and meta.
- 2026-05-03: Use Project Ledger Loop from this point forward for this repo.
- 2026-05-03: Keep distribution as a Win64 offline zip/folder package rather than a Go single exe or PyInstaller one-file exe.
- 2026-05-03: Treat the right panel as result-first; queue, history, and details are secondary controls.
- 2026-05-03: Use a dedicated GPT Image 2 `poster_text` field for exact required image text.

## 2026-05-10 - Browser-Local Workbench Conversation
- Status: active
- Decision: Store the new conversation stream in browser `localStorage` only, while continuing to use `/api/history` and `outputs/history.json` for long-term generation history.
- Reason: The user wanted continuous editing-style workspace behavior without adding CPA, accounts, Redis, remote sync, or backend history schema changes.
- Alternatives considered: Persist turns into `outputs/history.json`; add a backend session endpoint; copy the external Studio architecture.
- Consequences / follow-up: Clearing results clears the current local conversation; history remains the durable backend record. Future export/import can be added separately if needed.

## 2026-05-11 - New/Old Package Coexistence
- Status: active
- Decision: Preserve the old `web_imagen_tool/` folder and `web_imagen_tool.zip` in the share directory, while applying current fixes only to `NM_web_imagen/` and `NM_web_imagen.zip`.
- Reason: The user clarified that new and old should coexist, and the old zip should not be updated.
- Alternatives considered: Replace the old folder/zip with the renamed package; delete the old artifacts during cleanup.
- Consequences / follow-up: Future sync and cleanup commands must target the new `NM_web_imagen` path explicitly and avoid broad deletion in the share root.

## 2026-05-11 - GPT Image 2 Startup Default
- Status: active
- Decision: Initialize the frontend on GPT Image 2 and ignore `active_engine` from backend defaults during startup. Validate Banana/Gemini config only when the user selects the Banana/Gemini tab.
- Reason: Starting on Banana/Gemini caused an immediate missing-config prompt even when the desired default workflow is GPT.
- Alternatives considered: Preserve the last selected engine from browser storage; keep backend `active_engine` authoritative; delay all startup validation.
- Consequences / follow-up: Browser storage still records user selections after startup, but a fresh reload returns to GPT Image 2 by design.

## 2026-05-12 - Multipart Reference Filename Encoding
- Status: active
- Decision: Preserve uploaded reference image names in local metadata, but use an ASCII-safe `request_filename` when constructing GPT Image 2 `/v1/images/edits` multipart requests.
- Reason: Some machines upload Chinese or otherwise non-latin filenames, and `requests/urllib3` can raise `UnicodeEncodeError` while encoding the multipart `Content-Disposition` header before the upstream service receives the request.
- Alternatives considered: Ask users to rename files manually; percent-encode the filename; strip filenames entirely.
- Consequences / follow-up: The upstream receives stable names such as `reference-01.png`, while UI/history display can still keep the user's original filename.

## 2026-05-10 - Header Config vs Advanced Parameters
- Status: active
- Decision: The top header model/config button opens only API Key, URL, and model fields. Full generation controls remain in the composer `高级参数` modal.
- Reason: The user wants the visible header configuration to behave like simple connection setup, not a duplicate advanced-parameter entry.
- Alternatives considered: Reuse the full advanced-parameter modal from every config button; keep engine/model duplicated above the composer.
- Consequences / follow-up: Connection setup has one compact header entry point, while reference image, size, count, and advanced generation controls stay near the prompt composer.

## 2026-05-10 - Composer Size Preset Structure
- Status: active
- Decision: Present GPT Image 2 size selection as tier buttons (`自动`, `1K`, `2K`, `4K`) plus aspect buttons (`1:1`, `16:9`, `21:9`, etc.), then show the resolved custom pixel size.
- Reason: This matches the Studio-style mental model better than a long pixel preset list, while still sending the existing URL + Key + model backend a concrete official-valid size.
- Alternatives considered: Keep only raw pixel presets; use a separate large size modal; import the external project's size UI directly.
- Consequences / follow-up: The size popover now uses shared tested preset rules. The custom width/height button is labeled `应用` because typing already switches to custom and the button only forces immediate normalization.

## 2026-05-10 - React/Vite Studio Frontend Trial
- Status: active
- Decision: Add a small `studio-web` React/Vite frontend that builds into `static/studio`, serve it at `/`, and keep the previous static UI at `/classic`.
- Reason: The static skinning attempt did not reach the Studio-like quality bar; React makes the workbench layout, local session state, and interaction polish easier to iterate without adopting the external project's backend.
- Alternatives considered: Fork and strip ChatGpt-Image-Studio; keep improving the old static page; rewrite the FastAPI backend around conversations.
- Consequences / follow-up: The project now has a lightweight build step for the experimental Studio UI. Existing backend APIs and URL + Key + model setup stay intact, and `/classic` remains a rollback path.

## 2026-05-10 - History Context Detail Modal
- Status: active
- Decision: Treat persistent left history entries as per-generation context records and show their prompt, images, form_state, and meta in a centered detail modal.
- Reason: The existing backend history format stores generation records, while the continuous conversation stream remains browser-local.
- Alternatives considered: Add backend conversation sessions; write local turns into `outputs/history.json`.
- Consequences / follow-up: Clicking old history can inspect and reuse the concrete generation context, but it does not reconstruct a full multi-turn chat unless that data exists in the browser-local current session.

## 2026-05-10 - Sidebar Conversation Mode
- Status: active
- Decision: Default the left sidebar to browser-local conversation sessions, with old `outputs/history.json` entries moved into a separate `历史`素材 tab.
- Reason: New workbench interactions should feel like an AI web chat, while the old generation records remain useful as a素材库 rather than conversation state.
- Alternatives considered: Keep only card-style history; write conversations into backend history; add a backend session API immediately.
- Consequences / follow-up: Conversations persist in browser `localStorage` and are not portable across browsers yet. Old history remains durable on disk and can still be applied or used as reference images.

## 2026-05-03 - Enable Project Ledger Loop
- Status: active
- Decision: Maintain `PROJECT_STATUS.md`, `NEXT_ACTIONS.md`, and `DECISIONS.md` alongside existing `AGENTS.md`.
- Reason: The user asked for staged commits and explicitly asked whether `project-ledger-loop` was being used.
- Alternatives considered: Continue with chat-only state.
- Consequences / follow-up: Update the ledger before stable phase commits and before handoff.

## 2026-05-03 - Win64 Offline Zip Package
- Status: active
- Decision: Ship a fixed Windows x64 offline package with bundled portable Python 3.12 and compatible wheels.
- Reason: The target is double-click usability and no external user dependency, not minimum single-exe size.
- Alternatives considered: Go rewrite, PyInstaller one-file exe, system Python plus pip install.
- Consequences / follow-up: Keep package exclusions strict for local config, outputs, caches, logs, and runtime directories.

## 2026-05-03 - Result-First Right Panel
- Status: active
- Decision: Make the current image/result area the primary right-panel content; queue and metadata stay compact or modal.
- Reason: The previous right panel felt crowded and reduced preview space.
- Alternatives considered: Keep queue/history/detail panels always visible.
- Consequences / follow-up: Queue must have explicit controls for expand, clear, and remove queued jobs.

## 2026-05-03 - Explicit Poster Text Field
- Status: active
- Decision: Add `poster_text` as a separate form field and append exact readable-text instructions to the GPT Image prompt.
- Reason: Generic wording such as "need some text" often produces no readable text, especially when negative prompts penalize bad text.
- Alternatives considered: Only update user documentation or rely on stronger prompt examples.
- Consequences / follow-up: History stores `poster_text`; users should put exact desired words in this field.
