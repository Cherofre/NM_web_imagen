# Decisions

## Active Decisions
- 2026-05-26: Queue jobs own a live `sessionId/turnId` reference only while that target exists. Running/queued jobs block deleting or clearing their session, refresh-interrupted jobs reconcile their matching turn to an error state, and queue actions guard missing targets instead of silently switching to deleted sessions.
- 2026-05-26: Diagnostics may show endpoints for troubleshooting, but endpoints must be sanitized for URL userinfo and sensitive query parameters before returning to the UI.
- 2026-05-26: Startup stale-process cleanup must only stop processes whose command line includes this repository's resolved `app.py`; loose `app.py` matching is too risky on shared Windows machines.
- 2026-05-26: v1.0.3 sync uses the clean package as the source of truth: mirror the extracted package folder to G:, exclude runtime/config/output artifacts, and sync only versioned zips such as `NM_web_imagen-v1.0.3.zip`; leave unversioned `NM_web_imagen.zip` untouched for manual deletion.
- 2026-05-26: Release should be one-click for this tool: `一键发布.bat` runs frontend tests, build, backend checks, clean package sync, and release preflight before reporting success.
- 2026-05-26: Generation queue execution is serialized in the frontend: new jobs enter `queued`, only one `/api/generate` request runs at a time, and queued/running jobs are canceled on refresh.
- 2026-05-27: GPT multi-image requests should be result-count tolerant: when an upstream gateway accepts `n` but returns fewer images, the backend follows up for the missing count instead of silently saving only one.
- 2026-05-26: v1.0.3 config profile migration must remain backward-compatible: legacy `forms` load as default profiles, new saves keep legacy `forms`, and default profile names derive from URL short names when custom names are absent.
- 2026-05-26: Profile deletion in the multi-config drawer is guarded: show a compact row-level delete icon, require confirmation, keep at least one same-engine profile, and switch to another profile when deleting the active one.
- 2026-05-26: Diagnostics should call generation and chat checks separately, report partial failures clearly, and redact API keys from returned errors. Startup reuse must also probe required API routes, not only static assets.
- 2026-05-26: Queue rows should keep controls compact and row-local: cancel for running work, retry for completed/failed/canceled work, apply prompt for any task, and remove for any task.
- 2026-05-26: Queue metadata persistence is browser-local for v1.0.3. Finished/error/canceled jobs survive refresh, while queued/running jobs restore as canceled with an explicit interruption message because old HTTP requests cannot survive a page reload.
- 2026-05-26: v1.0.3 queue UI starts as a floating chat-area capsule with an overlay list, not a fixed right sidebar, so it does not squeeze or offset the main conversation/composer layout.
- 2026-05-26: Completed queue jobs should expose their first generated image as a compact clickable thumbnail, with a direct download action. Image preview lightboxes should keep top-right for file actions only, and put zoom/fit controls inside the canvas bottom corner with wheel zoom and drag pan.
- 2026-05-26: Multi-config management needs an explicit add-profile entry in the profile list, and queue rows need a text click target that jumps back to the matching conversation turn.
- 2026-05-22: Startup reuse must validate Studio assets before trusting an existing backend; `/api/health` alone is insufficient after files are overwritten while an old Python process is still running.
- 2026-05-18: v1.0.3 theme is workflow robustness: multi-config profiles, queued image generation, non-blocking chat/session use while jobs run, separate generation/chat diagnostics, and a later light UI polish pass.
- 2026-05-15: Defer the latest v1.0.2 review findings to the next version. Do not republish v1.0.2 solely for: history apply preserving session prompt drafts, chat-mode helper wording, or broader `.svnignore` cleanup.
- 2026-05-14: Prompt-like draft text is session-scoped. In this slice GPT keeps `prompt / negative_prompt / poster_text` per session, Banana keeps `prompt` per session, while non-text generation parameters remain global form settings.
- 2026-05-14: GPT `负面提示词` and `画面文字` belong near the main composer as an expandable `文本约束` strip instead of living only inside `高级参数`.
- 2026-05-14: Unsubmitted composer reference images still remain global for now, so switching sessions must confirm whether to preserve or clear them, and deleting the active session should clear them.
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

## 2026-05-18 - v1.0.3 Workflow Robustness Scope
- Status: active
- Decision: Plan v1.0.3 around four core workflow capabilities: saved multi-config profiles, real generation queue, non-blocking chat/generation/session switching, and separate minimal diagnostics for image and chat endpoints. Keep UI polish as a follow-up pass after those foundations are stable.
- Reason: The user wants the tool to behave like a real workbench: generation should not freeze the whole interface, multiple API setups should be reusable, and another computer should be able to quickly tell whether image and chat endpoints both work.
- Alternatives considered: Only add UI polish first; only add queue without config profiles; keep config as a single global form.
- Consequences / follow-up: Start v1.0.3 with data model design for config profiles, queue jobs, session/job ownership, and diagnostics results. Avoid building the UI first because the queue/session boundary is the main correctness risk.

## 2026-05-26 - v1.0.3 Profile Compatibility And Queue Placement
- Status: active
- Decision: Save v1.0.3 multi-config data as `profiles` plus `active_profile_ids`, while also writing the v1.0.2-compatible `forms` object. When reading old configs that only have `forms`, create one default profile per engine and use a URL-derived short name unless a custom name exists. The queue entry should be a small floating capsule in the chat area that expands into an overlay, not a permanent right-side panel.
- Reason: The user explicitly required old v1.0.2 configs and other computers to keep opening without config loss or white screens. The existing workbench also treats the conversation/composer as the main surface, so a right queue panel would fight the layout.
- Alternatives considered: Replace `forms` with only `profiles`; display the model name as the config entry; add a fixed right queue sidebar; keep the redundant `配置已完成` chip.
- Consequences / follow-up: Future profile edits must keep the legacy `forms` compatibility layer until a migration/release policy says otherwise. Queue hardening should add controls and persistence inside the overlay/drawer pattern rather than making a new right panel.

## 2026-05-26 - Queue Completion Preview Actions
- Status: active
- Decision: Completed queue rows should use the first generated image as a 44px thumbnail button that opens the same image preview lightbox used elsewhere, and should expose a direct download action. The lightbox should keep download/reference/close in the header, while zoom in/out, fit, and 100% live as a canvas-corner toolbar. The canvas also supports mouse wheel zoom, drag panning while zoomed, and double-click reset.
- Reason: The user clarified that completed tasks need an obvious clickable area to view and download outputs, and all previews should support download plus canvas-scale style controls similar to the older web tool.
- Alternatives considered: Keep only a green completion icon; use a large right-side queue drawer; keep preview controls only on the image cards.
- Consequences / follow-up: Future queue controls should build on the compact overlay row pattern and avoid increasing the main chat surface height or using oversized controls. Future preview actions should preserve the distinction between header file actions and in-canvas view controls.

## 2026-05-26 - Config Add Entry And Queue Jump
- Status: active
- Decision: Put `新增配置` inside the left profile list of the multi-config drawer, below existing profiles. Queue job rows should expose the job title/config text as a click target that closes the queue popover and scrolls to the matching conversation turn.
- Reason: The user could not discover where to add another config, and completed/running queue tasks need a clear way to return to the related conversation context.
- Alternatives considered: Put add config only in the footer; make only the thumbnail clickable; add a separate small jump icon.
- Consequences / follow-up: Future profile controls should remain near the profile list. Future queue row actions should avoid making the download thumbnail/jump targets compete.

## 2026-05-26 - Guarded Config Profile Deletion
- Status: active
- Decision: Add profile deletion as a compact icon button inside each same-engine profile row. Deletion asks for confirmation, is disabled when only one profile remains for that engine, and deleting the active profile immediately switches the form to another same-engine profile before the user saves.
- Reason: The user caught that multi-config management was incomplete without deletion, but deleting the last config would create an empty profile state and risk confusing or broken saves.
- Alternatives considered: Hide deletion entirely; allow deleting all profiles and recreate defaults on save; make deletion a large text action. These either leave management incomplete, increase migration risk, or make the drawer visually heavier than requested.
- Consequences / follow-up: Profile rows now use a main selection button plus a secondary delete icon. Persisted deletion still follows the existing explicit `保存配置` flow, which keeps profile edits consistent with the rest of the drawer.

## 2026-05-26 - Separate Diagnostics And Required Route Probe
- Status: active
- Decision: Add `/api/diagnostics` as a structured check endpoint that runs generation and chat checks independently for the active engine. The config drawer exposes `测试连接` and renders separate cards for 生图 and 聊天, including endpoint/model/latency/status and redacted errors. `start_web.ps1` now probes `/api/diagnostics` with a no-key chat check before reusing a running backend.
- Reason: Another computer needs to see whether image generation or chat is the broken side. During local smoke, an old backend could serve new static assets while lacking new API routes, so static asset probing alone was insufficient.
- Alternatives considered: Reuse only `/api/health`; test only chat because it is cheaper; show raw upstream errors. Those would miss partial failures, stale route mismatches, or leak sensitive config details.
- Consequences / follow-up: The generation diagnostic may call a real image endpoint when users click it. Keep this as an explicit button, not an automatic startup check.

## 2026-05-26 - Compact Queue Row Controls
- Status: active
- Decision: Add compact row-local queue controls: cancel for running/queued jobs, retry for completed/failed/canceled jobs, apply prompt for any job, and remove for any job. Keep clear-completed in the queue header.
- Reason: The user asked completed tasks to have usable click targets and the planning checklist required cancel/retry/apply/delete controls without turning the queue into a large right-side panel.
- Alternatives considered: Put all controls in the queue header; open a larger job detail drawer; make only completed jobs actionable. These reduce directness or make the compact queue feel too heavy.
- Consequences / follow-up: Retry currently resubmits the stored prompt into the job's session with the current active configuration for that engine. Queue metadata persistence and deeper parameter snapshotting remain a separate decision.

## 2026-05-26 - Browser-Local Queue Persistence
- Status: active
- Decision: Persist only compact queue metadata in browser `localStorage`. On refresh, preserve `success`, `error`, and `canceled` jobs, but convert stored `queued` or `running` jobs to `canceled` with `页面刷新，任务已中断`.
- Reason: v1.0.3 has browser-owned queue UI state and normal HTTP generation requests; after a full page refresh there is no reliable client-side controller left for the old request, so restoring it as still running would be misleading.
- Alternatives considered: Store queue metadata under `outputs/`; attempt to resume running jobs after refresh; do not persist queue rows at all.
- Consequences / follow-up: Generated images remain durable through existing saved output URLs/history, while the queue list is a convenience surface for the current browser. A future backend job runner could replace this with durable server-side queue state.

## 2026-05-22 - Startup Asset Probe Before Backend Reuse
- Status: active
- Decision: `start_web.ps1` must probe the current Studio page JS/CSS assets before reusing an already-running backend. If health succeeds but assets fail, the script may stop a recognizable stale `app.py` process and start the current code.
- Reason: A stale in-memory backend can still pass `/api/health` and read the updated `static/studio/index.html`, while lacking the new `/assets` mount required by `./assets/...` from the root page. That mismatch produces a white screen.
- Alternatives considered: Only tell users to run `stop_web.bat`; rely on version query cache-busting; keep absolute `/static/studio/assets` URLs. These do not handle the real stale-process mismatch reliably.
- Consequences / follow-up: Release checks should include root HTML asset probing from an actual server, plus extracted-zip smoke checks. The G: folder may still contain ignored local runtime/config/output artifacts, so zip packages remain the cleaner distribution source.

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
## 2026-05-26 - Serialized Image Generation Queue
- Status: active
- Decision: Treat the v1.0.3 generation queue as a real single-flight queue: new image-generation submissions enter `queued`, only the oldest queued job starts when no generation job is `running`, and refresh still cancels queued/running jobs because browser fetches cannot survive reload.
- Reason: Parallel upstream image requests made later queue entries appear to be “一直在请求”; users expect a queue to wait behind the active generation job.
- Alternatives considered: Keep concurrent generation and only improve labels; add a backend worker queue immediately.
- Consequences / follow-up: The frontend now snapshots payloads for runtime queued jobs and starts them serially. A future backend queue could preserve jobs across refresh, but browser-local v1.0.3 intentionally marks interrupted jobs canceled.

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

## 2026-05-14 - Session-Scoped Text Drafts
- Status: active
- Decision: Store text drafts with the workbench session instead of the global engine form. GPT sessions keep `prompt`, `negative_prompt`, and `poster_text`; Banana sessions keep `prompt`.
- Reason: Users were accidentally reusing old negative prompts or poster text because those values behaved like sticky global presets rather than per-conversation context.
- Alternatives considered: Keep them in `高级参数`; only move negative prompt; make all generation parameters session-scoped.
- Consequences / follow-up: History apply and regenerate flows must write back into session drafts, and deleting a session should remove its drafts along with any session-owned reference snapshots.

## 2026-05-14 - Composer-Adjacent Text Constraints
- Status: active
- Decision: Surface GPT `负面提示词` and `画面文字` in a dedicated expandable `文本约束` strip directly under the main composer.
- Reason: These fields meaningfully affect nearly every generation, so hiding them deep in `高级参数` made accidental stale injection too easy.
- Alternatives considered: Keep them in advanced settings only; make them always expanded; add a separate modal.
- Consequences / follow-up: The strip should summarize current values compactly, and advanced settings should stop duplicating these fields.

## 2026-05-14 - Global Composer References For Now
- Status: active
- Decision: Keep unsubmitted composer reference images global for this v1.0.2 slice, but require an explicit preserve/clear choice when switching sessions and clear them when deleting the active session.
- Reason: Session-scoping reference files is a larger behavior change; the current goal was to remove prompt-text leakage first without reopening the reference upload lifecycle.
- Alternatives considered: Make reference files fully session-scoped now; silently preserve them on switch; silently clear them on every switch.
- Consequences / follow-up: The UI must warn that current reference images are not session-bound yet, and future queue/multi-chat work can revisit deeper reference scoping.
