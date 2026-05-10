# Next Actions

## Now
- [x] Verify branch and existing dirty runtime artifacts.
- [x] Restore old static UI as `/classic` fallback.
- [x] Add `studio-web` React/Vite workbench and build it into `static/studio`.
- [x] Serve the Studio build from `/` when present.
- [x] Wire persistent history, local conversation turns, parameter drawer, config save/load, and outputs image-to-reference actions.
- [x] Apply a two-pane Studio-like layout with persistent history and central canvas/composer.
- [x] Fix usability issues from the first Studio pass: auto-dismiss toast, centered advanced modal, composer size/count popovers, drag-in reference images, and clickable history context detail.
- [x] Split the left sidebar into browser-local `会话` and old card-style `历史`素材库, with multi-session localStorage persistence.
- [x] Tighten the chat surface: top-down conversation spacing, header config button, single-row composer controls, Chinese local labels, session rename modal, and outside-click closing for composer popovers.
- [x] Split top header config into a compact API Key / URL / model modal while keeping full generation parameters behind the composer `高级参数` button.
- [x] Rename URL wording to `API 请求地址`, remove connection fields from `高级参数`, fix composer popovers, and make result images compact with expand/collapse controls below the image group.
- [x] Simplify GPT size popover: remove the redundant size dropdown and add width/height custom inputs with automatic 16-multiple correction.
- [x] Split GPT composer `尺寸` and `质量` into separate toolbar buttons and popovers.
- [x] Add GPT custom-size max/16-multiple correction with persistent in-popover feedback.
- [x] Add reference-image preview plus drag-handle and arrow-button reordering, with browser event-flow verification.
- [x] Sort browser-local conversations newest-first from top to bottom.
- [x] Pull generated-result model/time/# chips next to the response title.
- [x] Keep browser-local session storage lightweight by removing image data payloads before persisting.
- [x] Update GPT Image 2 custom-size rules to official constraints and allow free typing before blur/submit correction.
- [x] Add first-open/active-engine configuration completeness checks with compact connection modal warnings.
- [x] Move GPT editing mode and reference strength to composer toolbar popovers.
- [x] Restore hover/focus explanations for composer parameters without visible `?` markers.
- [x] Add hover/focus explanations inside the advanced-parameter modal.
- [x] Fix bottom toolbar popovers after the mobile overflow change so the buttons visibly respond again.
- [x] Stabilize top header/mobile toolbar layout to avoid UI jumping and page-level horizontal overflow.
- [x] Convert GPT composer size presets to a 1K/2K/4K plus aspect-ratio grid without horizontal ratio scrollbars.
- [x] Add delayed composer and advanced-parameter tooltips so clicking buttons does not immediately show help text.
- [x] Move this Studio branch to default port `7861` across app defaults, launchers, docs, and Vite proxy.
- [x] Keep saved `config.local.json` connection-only instead of persisting generation defaults.
- [x] Run React build, Python compile, and browser layout/interaction checks.
- [ ] Decide and implement a pure conversation mode for prompt/direction discussion: local-only notes vs calling a text/chat model endpoint.
- [ ] Optional: do a real paid/API generation smoke test with the user's preferred endpoint and key.
- [ ] Optional: stage only source/ledger files after reviewing runtime artifacts.

## Handoff Notes
- Start here: `D:\Documents\AI资源\AI应用\web_imagen_tool`, branch `codex/image-workbench-inspired`.
- Do not redo: `studio-web` scaffold, React workbench layout, `/classic` fallback, multi-session local state, `会话/历史` sidebar split, centered parameter modal with field tooltips, compact header connection modal with first-open missing-config warnings, session rename modal, single-row composer controls/popovers with separated GPT size/quality/edit-mode/reference-strength, 1K/2K/4K plus aspect-ratio GPT size grid, official custom-size correction, delayed hover/focus parameter tooltips, compact result image expand/collapse, tightened result meta chips, history detail modal, reference preview/reorder, drag-in references, and same-origin image-to-reference actions are already implemented.
- Verify next: if testing true generation, use the existing form and confirm a successful turn appears in the conversation stream, refreshes from localStorage, and writes durable history through the backend.
- Do not claim: live upstream generation success; this session intentionally did not call the paid image API.
- Watch out for: leave `outputs/`, `config.local.json`, `.runtime/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, `studio-web/tsconfig.tsbuildinfo`, and generated screenshots out of commits.
- Port note: the Studio branch defaults to `http://127.0.0.1:7861`, while launch/stop scripts still accept an explicit port argument.
- Config note: `config.local.json` should only persist connection fields: GPT API Key/API request address/model, Banana API Key/API request address/model, active engine, and version.
- Verification note: an accidental browser click at 2026-05-10 21:40 +08:00 did trigger one real GPT Image 2 generation. The browser-local running turn was removed, but `outputs/20260510-214017-763628-gpt-image-2-01.png` and its `outputs/history.json` entry were left untouched.
- Discussion note: the old `自定义` button was renamed to `应用`; custom width/height already become active while typing, and this button only forces immediate normalization.

## Later
- [ ] Consider adding a compact filter/search inside the persistent left history sidebar if history grows large.
- [ ] Consider adding a pinned current-session export/import if the browser-local conversation becomes worth sharing.
- [ ] Consider making the mobile layout use a collapsible history drawer instead of stacking history above the workbench.
- [ ] Consider a stronger empty-state visual treatment if the first screen still feels too plain.

## History
- [x] 2026-05-03: User requested staged commits and asked whether Project Ledger Loop was active.
- [x] 2026-05-10: Implemented the Studio-inspired local workbench plan.
