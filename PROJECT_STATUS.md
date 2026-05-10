# Project Status

## Current Snapshot
- Last Updated: 2026-05-10 23:42 +08:00
- Phase: React Studio Trial / Verification
- Branch: codex/image-workbench-inspired
- Goal: Trial a more faithful Studio-like frontend while preserving URL + API Key + model setup and existing FastAPI APIs.
- Current Focus: React/Vite Studio frontend is implemented, built to `static/studio`, served at `/`, uses `http://127.0.0.1:7861` by default on this branch, and now separates browser-local AI-style conversations from the old card-style history素材库 with top-down conversation flow, compact result images, separated connection/generation controls, GPT composer size presets as 1K/2K/4K plus aspect ratios, official GPT Image 2 custom-size validation, first-open configuration checks, delayed hover/focus parameter tooltips, and reorderable reference images.

## Resume Here
- Start with: `git status --short --branch`
- Main changed files: `app.py`, `studio-web/`, `static/studio/`, `.gitignore`, and ledger files.
- Runtime artifacts still present and should stay out of commits: `outputs/`, `config.local.json`, `.runtime/`, `.playwright-mcp/`, `__pycache__/`, generated screenshots.

## Progress Summary
- [x] Restored the older static frontend as fallback and moved the Studio experiment into `studio-web`.
- [x] Added a React/Vite workbench with persistent left history, central conversation canvas, bottom composer, and parameter drawer.
- [x] Built the React app into `static/studio` and changed `/` to serve it when present.
- [x] Added `/classic` as the old no-build static UI rollback path.
- [x] Kept `/api/generate/{engine}`, `/api/history`, config save/load, outputs folder, and history favorite/delete APIs intact.
- [x] Added browser-local conversation turns in `localStorage`.
- [x] Added same-origin outputs image-to-reference flow from history, lightbox, and generated turn images.
- [x] Whitelisted history parameter reuse so URL/API key/model are not overwritten by history entries.
- [x] Added minimal `.gitignore` entries for local config, runtime caches, Playwright state, node modules, and TypeScript build info.
- [x] Moved transient notices to a top toast with auto-dismiss so they do not block the send button.
- [x] Replaced the advanced-parameter side drawer with a centered modal and global Escape close behavior.
- [x] Turned composer size/count chips into clickable compact popovers.
- [x] Added drag-and-drop image support for adding reference images to the current composer.
- [x] Added clickable left history records that open generation-context detail modals.
- [x] Added browser-local multi-session state with automatic migration from the previous single `studio-session` turn list.
- [x] Changed the left sidebar default to a ChatGPT-like conversation list and moved old `outputs/history.json` cards under a separate `历史` tab.
- [x] Added a per-result “continue edit” action that reuses the turn prompt and attaches the selected image as reference context.
- [x] Removed the long URL from the conversation header and replaced it with a model/config button.
- [x] Split header connection configuration into a compact modal with only API Key, URL, and model fields.
- [x] Removed the duplicate composer context row and kept the composer controls to one row: reference image, size/quality, count, and advanced parameters.
- [x] Localized browser-local and turn-count labels to Chinese.
- [x] Added an in-page modal for renaming the active browser-local conversation.
- [x] Made composer size/count popovers close when clicking outside them.
- [x] Renamed connection URL labels to `API 请求地址`.
- [x] Removed API Key, API request address, and model fields from the `高级参数` modal.
- [x] Fixed mobile composer size/count popovers so they render fully inside the viewport.
- [x] Changed conversation turns to flow from the top-left instead of a centered narrow column.
- [x] Made generated images default to compact previews with expand/collapse controls below the image group.
- [x] Removed the redundant GPT size dropdown from the composer size popover and added separate custom width/height inputs with automatic 16-multiple correction.
- [x] Split GPT composer size and quality into two separate toolbar buttons/popovers.
- [x] Added GPT custom-size max/16-multiple validation with a small verification script.
- [x] Added reference-image preview, drag handles, and explicit left/right reorder buttons.
- [x] Sorted the left browser-local conversation list newest-first, top to bottom.
- [x] Tightened generated-result meta chips so model/time/# stay near the response title instead of floating to the far right.
- [x] Compact browser-local session storage so generated image data URLs/base64 payloads are not persisted into `localStorage`.
- [x] Updated GPT Image 2 custom-size validation to the official documented constraints: single side <= 3840px, both sides multiples of 16, ratio <= 3:1, and total pixels 655,360-8,294,400.
- [x] Fixed custom width/height inputs so users can freely type values such as `960`; normalization now happens on blur, outside-click popover close, or submit.
- [x] Added first-open configuration checking; missing API Key or placeholder API request address opens the compact connection modal and shows inline/top status warnings.
- [x] Replaced the vague `就绪` chip with explicit configuration/generation status and gave the config button configured/missing states.
- [x] Moved GPT `编辑模式` and `参考强度` into the composer toolbar as popovers and removed them from the advanced parameter modal.
- [x] Restored hover/focus parameter explanations on composer controls without adding visible `?` buttons.
- [x] Added hover/focus explanations for the fields inside the `高级参数` modal.
- [x] Fixed the bottom composer toolbar popovers after the mobile overflow change so buttons are clickable and popovers are visible instead of being clipped.
- [x] Stabilized header dimensions and mobile toolbar overflow so engine/config state changes do not resize the whole UI.
- [x] Reworked the GPT composer size popover into 1K / 2K / 4K tiers plus aspect-ratio buttons, including 21:9 and 9:21, with no horizontal ratio scrollbar.
- [x] Replaced instant pseudo-element composer tooltips with delayed floating tooltips so clicking parameter buttons does not immediately show help text.
- [x] Renamed the custom-size action button from `自定义` to `应用` to make its correction/apply role clearer.
- [x] Changed this Studio branch's default backend port from `7860` to `7861` across launchers, docs, CLI default, and Vite proxy while keeping explicit port overrides.
- [x] Slimmed saved local configuration so `config.local.json` keeps only API Key, API request address, model, active engine, and version.

## Verification
- Last commands:
  - `npm run build` from `studio-web`
  - `npm run test:size` from `studio-web`
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`
- Result: passed
- Browser evidence:
  - Temporary server on `http://127.0.0.1:7861/` served the React workbench.
  - `/classic` returned the previous static UI.
  - Desktop 1400x900 and 1180x820 reported no horizontal overflow.
  - Mobile 390x844 reported no horizontal overflow.
  - Left sidebar rendered 14 history cards from existing local history.
  - Parameter drawer opened and showed API Key, Base URL, and model fields.
  - Centered advanced-parameter modal opened from composer.
  - Size and count composer popovers opened.
  - History record opened a detail modal with prompt, image, parameters, and meta.
  - Same-origin history image and a dropped local image both appended as reference chips.
  - Toast auto-dismissed after roughly 4 seconds and no longer occupied the send-button corner.
  - Final desktop 1400x900 and mobile 390x844 checks reported no horizontal overflow.
  - Final conversation-mode check reported left sidebar title `对话`, tabs `会话/历史`, and no horizontal overflow at 1400x900 or 390x844.
  - Header/composer check reported no long URL in the header, a connection config button present, Chinese local/turn labels, and no duplicate composer context row.
  - Top header config button opened a compact modal with only API Key, URL, and model fields.
  - Session rename modal opened, saved a test title, and was restored back to the original local title.
  - Composer advanced-parameter button still opened the full centered generation-parameter modal.
  - Mobile 375px check showed the composer controls as a single row: reference image, size/quality, count, and advanced parameters.
  - Mobile 375px recheck showed size/count popovers fully within the viewport and no horizontal overflow.
  - Advanced-parameter dialog title is `高级参数` and no longer contains API Key, API request address, or model fields.
  - Header connection dialog contains `API 请求地址`, API Key, and model fields.
  - Desktop 1365x768 recheck showed the conversation turn starting from the top-left, compact image previews, and expand/collapse controls below the image group.
  - GPT size popover recheck showed no top size dropdown, separate width/height inputs with fixed `x` text, and `1123` corrected to `1120`.
  - GPT composer toolbar now shows separate `尺寸 auto` and `质量 自动` buttons.
  - Desktop popover check showed the size popover contains only size presets/custom width-height controls, while the quality popover contains `自动` / `低` / `中` / `高`.
  - Mobile 390x844 check showed the quality and size popovers stay inside the viewport and there is no horizontal overflow.
  - `npm run test:size` validates custom size normalization: 16-multiple rounding, 3840 single-side max, 3:1 ratio limit, and 2880x2880 total-pixel max.
  - Browser check showed `960` can be typed directly without jumping to `16`, `777` auto-corrects to `784` after leaving the field, and `9999 x 1000` auto-corrects to `3840 x 1280`.
  - Browser check showed the compact connection modal auto-opens when `/api/config/defaults` returns missing API Key and placeholder API request address; the header status reads `缺少 API Key、API 请求地址`, the config button reads `检查配置`, and the modal shows an inline warning.
  - Browser check at 375px showed no document-level horizontal overflow; the composer toolbar scrolls internally instead of widening the page.
  - Browser check at 1180px showed the header bounding box stays stable when switching GPT Image 2 and Banana Gemini.
  - Browser check showed composer size popover closes after clicking outside, and editor mode/reference strength popovers open and update state.
  - Browser check showed bottom toolbar buttons `尺寸`、`质量`、`编辑`、`参考强度`、`1 张` all open visible popovers and `高级参数` opens the modal.
  - Browser check showed toolbar text no longer contains visible `?` help markers.
  - Browser check showed advanced-parameter fields and toggles have `data-tooltip` help text and the CSS hover pseudo-element renders.
  - Mobile 375px check still showed no document-level horizontal overflow and size popover visible inside the viewport after the bottom-button fix.
  - Browser check showed reference images can be dropped, clicked to preview, and reordered with explicit arrow buttons; drag-handle `dragstart/drop` event flow also reordered chips after React state update.
  - Browser check showed session storage length dropped to a lightweight value and no longer contains `data:image` or `b64_json`.
  - Browser check showed generated-result meta chips sit 8px after the response title.
  - `npm run test:size` now also validates GPT composer size presets: 1K/2K/4K tiers, 21:9/9:21 aspect options, and 4K 21:9 mapping to `3840x1648`.
  - Browser check showed the GPT size popover renders tier and ratio buttons as grids, with no page-level horizontal overflow and no horizontal scrollbar in the ratio row.
  - Browser check showed quick `4K` then `21:9` clicks produce `3840x1648`, avoiding stale state from rapid tier/aspect selection.
  - Browser check showed composer tooltips do not render during the first ~260ms of hover and appear after the delay; advanced-parameter field help also appears on hover/focus.
  - Screenshot saved as `studio-desktop-after-react-pass.png`; later screenshot call timed out while waiting for fonts, so DOM metrics were used for final responsive checks.

## Blockers And Risks
- No live image generation request was sent during verification, to avoid spending API quota and changing user outputs.
- `git fetch --all --prune` timed out earlier in the session, so remote freshness was not reconfirmed after that point.
- `python -m py_compile` modified `__pycache__/app.cpython-312.pyc`; this is a runtime artifact and should not be committed.
- The React/Vite approach adds a frontend build step; this is intentional for the Studio trial but differs from the old no-build preference.
- During verification at 2026-05-10 21:40 +08:00, the browser send button was accidentally clicked once and created `outputs/20260510-214017-763628-gpt-image-2-01.png` plus a history entry. The accidental running local turn was removed from browser-local session state; the durable output/history artifact was left untouched.
- User asked about adding a pure conversation mode for prompt/direction discussion; not implemented in this slice because it changes turn types and whether a text model endpoint is used.

## History
- 2026-05-03: Created ledger after the user explicitly asked about `project-ledger-loop`.
- 2026-05-10: Replaced the static skinning attempt with a React/Vite Studio frontend trial while preserving the FastAPI backend.
