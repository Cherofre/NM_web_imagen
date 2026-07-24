# Project Status

## Current Snapshot
- Last Updated: 2026-07-24 11:26 +08:00
- Phase: copying references from a masked turn now restores its reusable mask on `codex/mask-guidance-placement`; user visual acceptance remains pending
- Superpowers Phase: published v1.0.8 baseline -> mask-guidance placement -> masked-reference restoration -> full verification -> manual browser gate
- Superpowers Spec: `docs/superpowers/specs/2026-07-20-history-window-refactor-v1.0.8-design.md`
- Superpowers Plan: `docs/superpowers/plans/2026-07-20-history-window-refactor-v1.0.8.md`
- Branch: `codex/mask-guidance-placement`, created from local `main` at `5bfeb48`; local `main` remains four commits ahead of `origin/main`, `codex/soft-mask-prompt-guidance` remains at `5061971`, and `codex/history-window-refactor-v1.0.8` remains at `cd3b1bd`
- Product Commits: `25b2915` (base refactor), `312a8d9` (recent-record popover), `1d9d1f5` (sidebar batch previews), `8a972c4` (responsive header/model controls), `2d8a263` (compact header grid and explicit GPT-5.6 tiers), `ac3926c` (stable narrow header plus persisted composer height), `41a34a5` (composer-edge resize affordance), `6af8700` (stable session-card hit targets), `41f0b2d` (mask review snapshots plus source-aware history navigation), `7a6c528` (preview focus/action order plus quick-history internal-scroll guard), `e5a2bc1` (standard/reverse-alpha gateway modes), `ccc6fdc` (superseded strict restoration experiment), `8ff25c9` (model-guided red selection with natural boundaries), `eccb1b8` (reference-switch Cancel dismissal), `e59dbac` (current-page mask regenerate plus true editor fit), `a87a8c5` (persisted Alpha plus per-turn deletion), `cd3b1bd` (v1.0.8 identity), `fd3c83b` (remove duplicated advanced controls), `33fce1c` (confirm whole-session deletion), `cd9fad9` (focus expanded multi-image results), `1c94e5c` (allow standalone share sync), `a4bf2df` (make mask specificity advisory), `4a5ef52` (strengthen model-chosen replacements), and `f7b1948` (refine mask guidance placement and wording)
- Goal: Keep the current Studio layout while making mask use reviewable and making compact/sidebar/full history behave as one predictable layered surface.
- Current Focus: the user should hard-refresh `14261`, click `复制参考图和遮罩` on a recent masked turn, and confirm the first reference, applied-mask badge and prompt guidance restore together.
- Latest Verification: 164/164 Node tests, Studio size rules, TypeScript and Vite production build passed. A real-browser click on the 2026-07-24 masked turn restored its base as reference 1, displayed `底图` and `遮罩已应用`, changed the action label to `复制参考图和遮罩`, and activated the mask-specific prompt guidance without submitting a generation request. Pre-existing untracked `PRODUCT.md` and `.impeccable/` remain untouched.

## Masked Reference Copy Follow-up
- Action contract: a turn with a restorable Alpha now labels its action `复制参考图和遮罩 / Copy references and mask`; ordinary turns retain `复制参考图 / Copy references`.
- Restore contract: copying loads the turn references and the same cached or persisted reusable mask payload used by regeneration, promotes the mask base to reference 1, preserves existing composer references behind the copied set, switches to GPT Image 2 generation mode and binds the Alpha to the restored base.
- Limit contract: the operation respects the 16-image GPT reference limit. If only part of the copied set fits, the mask base is kept first and a bilingual limited-copy notice reports the count.
- Failure contract: old records without a persisted Alpha, a missing Alpha file or an unreadable first base still copy any usable references but explicitly ask the user to redraw the mask; they never claim that the mask was restored.
- Compatibility: no backend route, session/history schema, generated output, prompt hardening or upstream call count changed. The feature reuses existing persisted `maskFileSnapshot` data and does not trigger image generation by itself.

## Post-v1.0.8 Mask Prompt Soft Guidance
- Call-count contract: mask handling uses one upstream `/v1/images/edits` request containing the guided source image, Alpha mask and strengthened prompt. Do not add a second intent-understanding API request; this avoids extra latency, cost, failure modes and relay compatibility requirements.
- Submission contract: a non-empty prompt with a valid base image, mask and edit endpoint is submitted regardless of whether a local regular expression considers the wording specific. Empty prompts and real technical errors remain blocking.
- UI contract: the reference row contains only real reference files. An applied mask is shown by a bilingual `遮罩已应用 / Mask applied` badge with an information tooltip; the textarea uses a mask-specific example placeholder. A broad non-empty prompt adds one unboxed line inside the textarea on wider layouts, while widths at or below 560px hide that line to preserve input space. No toast, modal or second confirmation interrupts submission.
- Prompt contract: the backend still identifies the red overlay and Alpha as one selection, asks the model to preserve unpainted content and blend boundaries naturally, and now explicitly tells the model to choose a reasonable selected-area change when the user leaves the exact object or attribute open.
- Model-chosen object replacement: wording such as `换一个物品`, `换个东西`, `改成另一个物品`, `换成另外一个物品` and equivalent English replacement requests receives an additional non-blocking instruction to identify and completely remove the original masked object, choose a category/silhouette that is visibly different, and preserve grasping, occlusion, lighting and contact. `选区` and `遮罩` wording now produces the same guidance; negated requests and color/material/style edits do not receive this object-removal instruction.
- Official alignment: OpenAI documents mask editing as selecting an area and describing the change, recommends specificity for quality rather than as a syntax gate, and states that GPT Image masking is prompt-based guidance rather than an exact pixel boundary.
- Release boundary: the prior fix remains integrated into local `main`; this placement follow-up is on a local feature branch only. No merge, package, G: synchronization, push, tag or Release is authorized yet.

## v1.0.8 Release Readiness
- User authorization: explicit approval to publish the Release and synchronize both G: destinations; this supersedes the earlier local-only boundary.
- Package: `I:\AI\Vibe Coding\NM_web_imagen-v1.0.8.zip`, SHA256 `ed171c9a1c74579a1a9375aa5e8b4fabf66a731b4764839c7b389d12a2f0046c`.
- Synced destinations: `G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具` and `G:\doc\Tools\网页生图站`; each contains the clean `NM_web_imagen` folder and the matching versioned ZIP.
- Publication state: `main` is pushed, annotated tag `v1.0.8` is pushed, and the formal Release is live at `https://github.com/Cherofre/NM_web_imagen/releases/tag/v1.0.8` with asset `NM_web_imagen-v1.0.8.zip` uploaded and SHA256-verified by GitHub.

## v1.0.8 Pre-Merge Audit
- Merge shape: `main` is the direct ancestor and the feature branch is 30 commits ahead, so integration can use `git merge --ff-only`. Both worktrees have no tracked local edits before the version fix; only the documented untracked design/local files exist.
- Backend/data: no config, outputs, logs, runtime, cache or secret path enters the diff. Session mask fields are additive, capacity-limited, raster-validated and reference-counted; deleting a turn cannot delete generated history/output images. Pillow is present in requirements and as the Win64 portable wheel.
- Frontend audit: 14/20, Good. Accessibility 3/4, performance 3/4, responsive 3/4, theming 2/4, anti-patterns 3/4. No merge-blocking regression was found. Non-blocking debt is mostly inherited: many 30–38px compact controls are below the ideal 44px touch target, tooltip entrance animations are not all disabled under reduced motion, three width transitions perform small layout animations, and light-only theming uses a few direct colors. Bundle growth versus main is about 19.6 KiB JS and 7.3 KiB CSS, consistent with the history/mask feature scope.
- Browser gate: the in-app browser rejected loopback access under enterprise policy. Policy explicitly forbids alternate browser surfaces or workarounds, so interaction checks cannot be automated here. HTTP/API/static evidence is green; user-side visual interaction remains the only residual uncertainty.

## v1.0.8 Persisted Mask and Per-Turn Delete Follow-up
- Persistence contract: `maskSnapshot` remains a longest-edge 384px review composite; `maskFileSnapshot` stores the exact Alpha PNG as an additive hidden turn field. FastAPI preflight, capacity, deterministic session-reference files, canonical URL adoption and orphan pruning all include both fields. Session JSON contains only `/outputs/session_refs/` URLs after save, never embedded data URLs.
- Regenerate contract: current-page turns reuse their detached runtime payload. After refresh, persisted turns download `maskFileSnapshot` plus the first base reference, restore `mask_encoding` and optional coverage, and rebuild a valid attachment. Pre-feature records without Alpha, missing Alpha files and missing bases stop with an explicit redraw message. Every submit override still supplies that turn's attachment or `null`, so the composer mask cannot leak across turns.
- Delete contract: the trash action deletes only that conversation turn, completed queue metadata, expanded state and runtime mask cache. Queued/running work is blocked and the confirmation states that generated images remain in history and the outputs folder. Backend pruning removes only unreferenced session attachments for that turn; generated output images and `/api/history` records are unchanged.
- UI contract: deletion is a compact fourth icon beside regenerate/copy/reference. Its resting state is neutral to avoid constant alarm; hover, focus and press use the existing danger color. Whole-session deletion remains the existing sidebar action.

## v1.0.8 Mask Regenerate and Editor Fit Follow-up
- Regenerate contract: runtime reuse remains keyed by turn ID and deliberately excludes another full base image. The new persisted Alpha field adds a refresh-safe fallback; only pre-feature/invalid records now require redraw.
- Isolation: every regenerate call explicitly supplies that turn's mask attachment or `null`, so the current composer mask cannot leak into another turn. Normal generation, queue transport and backend multipart remain unchanged.
- Editor contract: fit scale and user zoom are separate. Default load and `0`/适配 use zoom `1` over the stage-derived fit; resize or toolbar/footer wrapping recalculates fit without changing intrinsic canvas pixels, brush coordinates or exported PNG dimensions. Small images remain at native size rather than being enlarged.

## v1.0.8 Model-Guided Mask Editing
- Request path: the user's original base remains the local/session reference, but the first upstream edit image is a temporary full-resolution PNG with the editable selection tinted red at 58%. The same standard or compatibility Alpha mask is still attached as `mask`, so the gateway/model receives both a visual meaning and the API control without adding another reference slot.
- Prompt behavior: broad instructions such as `遮罩部分换一下`, `换成另一种风格` or `换一个物品` are accepted. The UI gives non-blocking specificity guidance, while the backend describes the complete result, identifies red as a non-output selection marker, lets the model choose unspecified selected-area details, preserves unpainted content as far as possible and blends only the immediate boundary instead of cutting or pasting. `enhance_prompt` remains disabled for masks.
- Result behavior: upstream output is saved and returned directly. There is no Pillow restoration, hard clipping, feathered local paste or hidden synthetic repair. UI/history use `遮罩引导` and `mask_guidance=visual-alpha`; an old cached client may still submit `strict_mask=true`, but the compatibility-only field is ignored.
- Resource boundary: mask-guided inputs support up to 8,294,400 pixels, matching the 4K product ceiling. Pillow 12.2.0 remains useful for constructing the temporary guided input inside the portable runtime.
- Honest limit: natural transitions and pixel-exact preservation cannot both be guaranteed through this gateway. The model may make small changes near or outside the selection, but the former guaranteed hard seam is removed. Manual acceptance should judge useful selected-area change, natural edge continuity and whether protected-subject drift is tolerable.

## v1.0.8 Mask Gateway Compatibility Diagnostic
- UI: the mask editor footer now exposes `发送方式：标准 / 兼容网关`. `标准` follows OpenAI semantics where transparent pixels may change; `兼容网关` exports the painted region opaque and the unpainted region transparent. The selection shown in the editor does not flip, so switching modes never changes what the user painted.
- Scope: encoding is stored only on the current in-memory mask attachment, displayed as a `兼容遮罩` badge, copied into the already-exported queued mask file and restored correctly while that mask remains editable. It is deliberately not a global profile setting and does not migrate session/history schemas.
- Accessibility/layout: the new select participates in the modal focus loop, and footer action/meta selectors are separated so narrow layouts do not inherit the wrong flex behavior.
- Result: the 10:48 compatibility-mode generation still primarily changed the protected person. Keep the selector only as an explicit gateway diagnostic; `8ff25c9` now gives both modes the same visible red-selection meaning and relies on model-side blending rather than claiming exact containment.

## v1.0.8 Manual Mask Drift Finding
- Evidence: base `/outputs/session_refs/ref-9d165ed2b33ef56d02e67a88cb1b7618.png`, saved review `/outputs/session_refs/ref-340cdfdaeaa67f2675f0f1a6c3f4b05b.webp`, and result `/outputs/20260720-172017-071355-gpt-image-2-01.png` show the intended background selection but a mostly unchanged background and visibly altered hair/dress.
- Request path: session/history metadata records `mask_used=true`, one reference, model `gpt-image-2`, endpoint `/v1/images/edits`, and configured host `ai-gateway.local`. This proves the local tool constructed and submitted a mask request, but not that the compatibility gateway honored mask guidance exactly.
- Official boundary: GPT Image masking is prompt-based and may not follow the exact shape. `gpt-image-2` always uses high input fidelity and does not accept an adjustable `input_fidelity` override, so adding a fidelity slider would be misleading.
- Implemented resolution: both Alpha directions drifted, and the later strict-restoration experiment produced visible cut edges. `8ff25c9` keeps target validation and prompt hardening but moves selection meaning into the upstream image itself and removes all result-stage compositing. Exact protection is no longer claimed; natural local editing is the acceptance target.

## v1.0.8 Mask Review and History Navigation Follow-up
- Mask review: applying a mask exports the existing full PNG base/mask for submission plus a compact WebP composite with the same red 52% overlay used by the editor. The compact composite enters visible `maskSnapshot`; the later persistence follow-up stores the exact Alpha separately as hidden `maskFileSnapshot`. Both are normalized into `outputs/session_refs/`, counted by existing storage budgets and updated to canonical output URLs after save.
- Conversation UI: masked turns show a distinct labeled thumbnail. Opening it uses the existing lightbox but hides reference/mask-edit actions so the composite cannot accidentally be treated as a new source image.
- History navigation: detail state carries `sidebar / quick / browser` origin. Escape from a sidebar detail closes; Escape from a quick-origin detail returns to the compact popover; Escape from a full-browser detail returns to its prior grid and restores scroll.
- Preview stacking: the foreground preview actively receives focus after mounting; local preview key handling stops propagation and closes only the preview. The history surface also checks whether a preview is present before processing Escape, so a single key press cannot close the background history layer first. The global Escape handler respects action menu, preview, secondary drawer and history priority. Compact history stays mounted underneath its preview, history-backed previews expose a direct `查看详情` action, and the toolbar follows workflow priority with Close fixed at the far right.
- Compatibility: `/api/studio/sessions` now supports optional additive `maskSnapshot` and `maskFileSnapshot` fields per turn. Existing sessions without them, `/api/history`, generation multipart, config, Classic and old records remain compatible. Old records without `maskFileSnapshot` cannot reconstruct exact Alpha.

## v1.0.8 History Window Refactor
- Main integration: local `main` was fast-forwarded through v1.0.8 commit `cd3b1bd`, then received the verified deduplication follow-up `fd3c83b`; the local branch remains unpushed.
- Stable entry: `存图夹` and `历史窗` remain side by side in both sidebar modes. History refresh moved to the history-count row.
- Sidebar batches: persistent history records use up to four thumbnail cells and a total image-count badge, so multi-image generations are visible before opening context.
- Compact state: clicking `历史窗` opens a viewport-clamped fixed popover for the latest 12 image-bearing records. Each record uses one representative thumbnail, multi-image records show a count badge, and clicking opens that record's existing preview gallery without adding another persistence model. Scrolling the popover's own thumbnail grid no longer dismisses it; page scroll, viewport resize and outside pointer interaction still do.
- Full state: the complete history window is now grid-only, retains favorite/date/engine filters and incremental loading, and represents multi-image records with a maximum four-cell batch collage plus remaining count.
- Detail state: history context opens inside the same full window. Returning by button or Esc restores the prior grid scroll position; closing returns keyboard focus to the stable sidebar trigger.
- Compatibility: no FastAPI route, `/api/history` payload, `outputs/history.json`, favorite granularity, delete semantics, session schema, queue behavior or Classic route changed.

## v1.0.8 Header and Composer Follow-up
- Narrow header: below 920px, the title and global utilities own the first row while engine and configuration own the second. Below 560px, engine and configuration become full-width rows without changing their order.
- Composer preference: the chosen input height is browser-local and independent of sessions. Viewport clamping affects only the displayed height, so reopening a larger window can restore the saved preference.
- Resize affordance: the complete composer top boundary is the drag target, with a centered visible grip and hover/focus/active feedback. Arrow Up/Down adjusts height; double-click or `Home` resets it. No persistent reset button floats on the divider.
- Session switching: session text is non-selectable and pointer-transparent, while the main open button extends through the card's non-delete padding and gap. This removes dead click strips without allowing the expanded target to cover delete.
- Compatibility: no backend route, config/profile schema, session/history/queue payload, generation behavior or Classic page changed.

## v1.0.7 Screenshot Feedback Follow-up
- Results: single images stay compact at their truthful aspect ratio and open the existing lightbox on click; mask and download live on the image, while `继续编辑` and `更多` form one stable footer row. Internal filenames are hidden. A shared output size appears once beside model/time; mixed multi-image sizes remain per-image.
- History: sidebar and history-browser favorites are fixed empty/filled heart states outside the overflow menu. The selected heart uses theme ink instead of danger red. The history browser uses wider image-first cards, contained thumbnails, two-line prompts, one-row quick actions and a favorite anchored to the preview rather than overlapping list actions.
- Interaction: header, result and history overflow menus close after outside click, Escape and completed actions without expanding cards. Page-image dragging remains available only after an approximately 180ms hold; quick movement is canceled as a drag, while desktop file drops, reference sorting handles and lightbox panning remain available.
- Image framing: result borders use an inset outline so the 1px frame does not change the content aspect ratio or create thin `contain` bars. No backend API, payload, persistence, queue, history or mask schema changed.

## v1.0.7 Studio UI Polish Execution
- Results: one-image turns stay compact, use saved dimensions for truthful preview sizing, preserve the whole composition with `contain`, open the lightbox on click and omit the redundant inline toggle. Multi-image turns retain compact collapsed thumbnails and expose full controls after expansion.
- Image actions: `编辑遮罩` and `下载` live on the image; `继续编辑` and `更多` form one footer row; copy/apply/reference/open actions live in a keyboard-accessible menu. The result mask action reuses the verified preview-to-mask path and does not alter the backend mask contract.
- Control hierarchy: top save was removed in favor of the existing drawer saves; `清空当前对话` moved into a dangerous header menu. Size remains directly accessible, while quality and count share one generation-settings popover with a small warning badge for multi-image counts.
- Layout and styling: sidebar count/list now share the flexible row, the duplicate new-chat action is gone, conversation and composer use the available workspace width, ordinary controls use compact radii, switchers retain pills, the queue is neutral rather than glass/pulsing, and focus/press/reduced-motion states are strengthened.
- Compatibility: no backend API, payload, config, history, session, queue or mask schema changed. React/Vite + FastAPI, `/classic`, Windows launchers and existing local data remain in place.
- v1.0.7 Baseline: branch created from `ed28d20`; Python image/upstream regression passed 126/126, frontend submission/UI regression passed 36/36, and `app.py`, `image_safety.py`, `storage.py`, `upstream.py` compiled. The old PID `47808` was stopped. Exact temporary directory cleanup remains pending because the execution host blocks recursive deletion even after a successful path verification.
- v1.0.7 Backend Mask Contract: RED reproduced that `mask_file` was ignored, invalid masks returned 200, non-edit endpoints were accepted, and multipart lacked `mask`. GREEN adds PNG IHDR/Alpha/dimension validation, first-base and endpoint guards, a 150 MiB combined reference/mask budget, edits multipart forwarding, and safe `mask_used` metadata. Five targeted tests and the combined security/upstream suite passed 131/131; four-module compile passed.
- v1.0.7 Frontend Mask Contract: native Canvas supports brush, eraser, move, size, undo/redo, clear/fill, zoom/fit, PNG export, first-base invalidation, exact in-memory `File` identity, queue snapshots, endpoint validation, focus containment, reduced-motion handling, bilingual copy, discoverable B/E/H, `[ ]`, `- +`, `0` shortcuts, and a non-exported true-size brush footprint. Base/mask badges are visible only in GPT generation mode so Banana/chat do not imply mask submission. Result previews can promote the displayed local output/reference to the first GPT reference and open mask editing in one action. Preview controls use pointer events only, ignore nested controls for drag/double-click reset, and provide subtle hover/press/focus feedback with a live percentage.

## v1.0.7 Mask Editor Execution
- Task 1 — complete at `614aab6`: branch, Chinese spec/plan, baseline and release boundary recorded.
- Task 2 — complete at `41aed72`: optional `mask_file` is accepted only with a PNG first base and auto/edits, the RGBA PNG mask must match dimensions, and the upstream receives `image[]` plus `mask`.
- Tasks 3-4 — complete at `b72a6f8`: frontend state/submission protocol, Canvas editor, bilingual UI, production assets, v1.0.7 version and README are committed.
- Task 5 — local automation complete: Python/Node/build/size/compile, real local mock multipart, and HTTP static smoke passed without a paid request.
- Task 6 — user manual review found missing shortcuts, unreliable result-preview buttons, no visible brush footprint, an over-tall guidance block, and a missing direct preview-to-mask workflow. The interaction fixes are committed through `c16881c`, with 124/124 Node and 33/33 release gates. Pending user re-acceptance after refresh. Automatic browser access remains policy-blocked; no v1.0.7 package, G: sync, push, merge, tag, PR, or release has occurred.

## Final Whole-Branch Review Findings
- Current unresolved Critical: zero.
- Current unresolved Important: zero.
- Fresh Important fixed: a persisted baseline at revision 8 could treat an empty/reset server state at revision 1 or a divergent revision 8 snapshot as intentional deletion and silently drop the browser copy. Startup now uses deletion markers only when the server revision advanced or the same-revision server marker snapshot exactly matches; RED reproduced the loss, GREEN preserves local data while retaining valid deletion semantics.
- Fresh Important fixed: Studio applied the 80-session cap only after compacting every supplied session, allowing excess sessions to amplify reference decoding/write/prune work. Requests above the supported session count now return 413 before compaction or reference processing; the normal frontend already sends at most 80.
- Minor: magic-byte-only raster validation can accept structurally corrupt images, but it matches the approved v1.0.6 design and is deferred to a later dependency-aware decoder enhancement.
- Verification limitation: real browser rendering/interaction is not claimed for the current candidate because the available browser surface denied loopback navigation and explicitly prohibited alternate-browser workarounds.

## Remediation Execution
- Task 1 — complete at `4c6f083`. RED: two tests reproduced that invalid Base64/remote candidates did not exhaust the byte budget. GREEN: targeted 5/5, full `tests.test_upstream_jobs` 64/64, image safety 10/10, and four-module compile passed. Compatibility aliases `image_count`, `total_bytes`, and `remaining_bytes` remain available.
- Task 2 — complete at `4a4499e`. RED: non-generation Content-Length/chunked requests reached endpoints, Studio accepted an oversized declared body, and five persistence tests reproduced unbounded text/images/metadata/final JSON. GREEN: route limits are 152 MiB generation, 208 MiB Studio, and 2 MiB other unsafe APIs; normalized Studio text/images/metadata/final JSON are bounded with failed-write reference cleanup. Security/session regression passed 108/108 plus four-module compile and diff check.
- Task 3 — complete at `56e3bc0`. RED: repeated and concurrent identical data URL saves returned different UUID URLs; deterministic-name collision handling did not exist. GREEN: identical references reuse one `ref-{32 hex}.{ext}` file without unlink churn, different content remains distinct, old UUID URLs remain unchanged, occupied mismatched targets return 409 without overwrite, and 69/69 Studio/storage tests pass.
- Task 4 — complete at `b263253`. RED: startup/canonical helpers were absent and source assertions reproduced unconditional server replacement. GREEN: compact markers contain only revision/ID/updatedAt/active ID, missing or damaged markers use a union, baseline-aware deletion works both ways, and canonical reference fields are adopted only for unchanged sent sources. Frontend targeted tests passed 60/60 plus size and production build.
- Task 5 — complete at `746cd5b`. RED: 29 failures showed credential-safe but path/query-bearing diagnostics and metadata. GREEN: shared host normalization strips userinfo, path, every query, and fragment; drops default ports; brackets IPv6; rejects local/invalid inputs; and preserves full configured/upstream URLs internally. Targeted regression passed 177/177 plus compile and diff check.
- Task 6 — local portion complete at product commit `2a8b014`. Full matrix, local package/smoke/preflight, non-browser API/static smoke, two fresh RED/GREEN review fixes, and whole-branch review now have zero unresolved Critical/Important. Real browser smoke and all G: writes remain pending.

## Final Remediation Verification
- Security and behavior: trusted loopback Host validation runs before CORS and request parsing; foreign/DNS-rebinding hosts return 403, foreign unsafe Origin returns 403, production preflight does not expose CORS, and multipart/urlencoded/other generation bodies are byte-limited before form parsing.
- Upstream and errors: URL/base64 results share count and aggregate-byte budgets; network/upstream failures return stable Chinese explanations and `error_code` values without provider bodies, exception classes, keys, sensitive URLs, or local paths; diagnostics preserve only sanitized status classes.
- Cancellation and persistence: clear-completed reuses the single-remove settlement path, waits for server cancellation settlement, and clears all runtime job tracking; legacy history/session metadata is sanitized on read without rewriting disk on GET.
- Local matrix: Python 233/233; 14 Node modules with 111/111; `npm run test:size`; TypeScript/Vite build; `py_compile` for `app.py`, `image_safety.py`, `storage.py`, and `upstream.py`; six UTF-8 BOM and PowerShell 5.1 parser checks.
- Package matrix: canonical ZIP contains 52 release files plus one zero-length directory entry; package SHA256 is `d9ceb67249c4e3e9360b7cd8eb2fcfb32936213e6cfe3c1900a23e2c287a5b11`; bundled portable Python smoke and LocalOnly preflight passed; package smoke instance ID was `e92ba34f914ee9b2d630`.
- Runtime/API/static smoke: temporary port `14334` returned v1.0.6, current Studio HTML/assets, and `/classic`; security/body/output checks from the current Task 6 run passed before the final two local-only fixes. Direct current-code tests verified the new 413 and reset-baseline behavior. Stable reference PUTs reused `/outputs/session_refs/ref-0898e0d9bfe0096a72a008149c8ee574.png`, served it as `image/png` with `nosniff`, and pure frontend smoke verified local/server union, newer-local selection, safe canonical URL adoption, and compact marker secrecy. Real browser rendering remains unverified because loopback access was policy-blocked.
- G: sync: not run for this candidate. The release rule requires a fresh real-browser smoke before `sync_release_to_g.ps1 -SkipPackage` or full destination preflight. The existing rejected G: v1.0.6 candidate remains unchanged; v1.0.5 rollback hash remains unchanged.
- Review state: whole-branch review from `f4afcd0b8d65b045091c6cafd4aa94b95cf3d484` through current product code has zero unresolved Critical/Important findings after the two final RED/GREEN fixes. Browser verification is a release-gate limitation, not an unresolved code finding.

## Task 4 Verification
- RED evidence reproduced that the previous package accepted nested credentials/certificates/databases/internal scripts, accepted missing release-tree contents, and could continue release gates after `py_compile` exited 7.
- GREEN evidence: `tests.test_release_cache_busting` passed 32/32; source, staged directory, ZIP, preflight, and sync validators reject unknown/missing files, traversal, absolute/drive paths, duplicate paths, and case-insensitive collisions.
- Compatibility evidence: the valid normalized manifest contains 52 files and keeps Classic's three files, Studio `index.html`, all eight current/fallback hashed JS/CSS assets, the fixed portable Python ZIP, and 25 wheels. No G: write or paid upstream API call occurred in Task 4.
- Review result: spec compliant; code quality Ready to proceed. Remaining non-blocking maintenance note: manifest validation is duplicated across package/preflight/sync scripts, so future release-manifest changes must update all three; the shared negative-test matrix currently guards drift.

## Original Task 5 Verification (superseded candidate)
- TDD evidence: the exact release-version test first failed with `1.0.6 != 1.0.5`, then passed after the minimal `VERSION` bump. Before packaging, LocalOnly preflight rejected the missing v1.0.6 ZIP instead of accepting the old v1.0.5 package.
- Local matrix: Python 176/176, Node 97/97, four-module compile, size rules, deterministic Studio build, 52-file exact ZIP, zero forbidden files, extracted portable-runtime smoke, and LocalOnly preflight all passed.
- API/browser smoke on temporary port `18765`: health returned version 1.0.6 and instance ID `c876d5708838963ae54f`; history JSON and SVG returned 404; a valid PNG returned 200 with `nosniff`. Playwright confirmed Studio rendered, chat selected with reference upload disabled and “暂不发送参考图” disclosure, GPT advanced controls contained neither edit mode nor reference strength, and `/classic` loaded without either field. The temporary listener, fixtures, and this Playwright session/artifacts were removed; no paid API was called.
- Sync evidence: clean package mirrored to `G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`; destination folder contains 52 files and zero forbidden matches. Local/share v1.0.6 ZIP hashes both equal `958334899120e934b82ce786c803616562ad87e45b37b8f4b6d5d966ce6e019d`; v1.0.5 ZIP remains for rollback; sync temp directories are absent.
- Review result: Task 5 spec compliant and Ready to sync. Non-blocking notes: the exact-version test name still says “file exists”; informational OpenAPI/README version literals are not release authority; package smoke does not yet accept an explicit expected-version parameter.

## Resume Here
- Start with: obtain a permitted real-browser smoke for `http://127.0.0.1:<temporary-port>/` and `/classic`, including startup merge, stable reference canonicalization, chat reference disclosure, and hidden GPT controls. The in-app browser used in this session cannot access loopback and alternate-browser circumvention is prohibited.
- Do not redo: Tasks 1-5, the two final RED/GREEN fixes, Python 233/233, Node 111/111, size/build/compile/PowerShell checks, exact package smoke, LocalOnly preflight, API/static/reference smoke, or the final zero-Critical/Important review unless code changes.
- After browser PASS only: run `sync_release_to_g.ps1 -SkipPackage`, full `release_preflight.ps1 -ExpectedVersion 1.0.6`, compare local/G SHA256, confirm the 52-file manifest and zero temp/forbidden files, and recheck v1.0.5 SHA256.
- Current local candidate: `C:\Users\mumengfei\.config\superpowers\worktrees\NM_web_imagen\NM_web_imagen-v1.0.6.zip`, SHA256 `d9ceb67249c4e3e9360b7cd8eb2fcfb32936213e6cfe3c1900a23e2c287a5b11`; it is verified locally but not final or synced.
- Sync target: `G:\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`; its current v1.0.6 folder/ZIP SHA256 `56aef66b45c9fec40f3d9b97355c7e2bf59de7615f49d0800b49c08294a23216` is rejected and intentionally unchanged. The older v1.0.5 ZIP remains.
- Runtime artifacts should stay out of commits and sync packages: `outputs/`, `config.local.json`, `logs/`, `.chrome-debug/`, `.runtime/`, `.venv/`, `.playwright-mcp/`, `__pycache__/`, `studio-web/node_modules/`, `studio-web/tsconfig.tsbuildinfo`, generated screenshots, and temporary zips.
- Current-project release rule: no package is final while any Critical/Important review finding remains. Internal ledger/spec/plan files remain excluded from packages and sync. Do not claim merge, push, tag, pull request, GitHub Release, or cleanup without an explicit successful action.

## v1.0.3 Planning Draft
- Confirmed scope:
  - Multi-config profiles: allow saving multiple API/model configurations, likely grouped by engine/provider, with quick switching and a clear active profile.
  - Generation queue: generation tasks should run as jobs so the whole composer/workbench does not stay in a single blocking spinner state.
  - Non-blocking session use: while one image job is running, users should be able to switch conversations, chat, edit prompts, or submit another generation without corrupting the running job.
  - Minimal diagnostics: provide a connection check that can test image generation and chat capability separately, with clear warnings when one side fails.
  - Light UI polish: keep for a later pass after the workflow architecture is stable.
- Candidate additions:
  - Job controls for queued/running/completed items: cancel, retry, duplicate/apply parameters, and clear completed.
  - Queue persistence policy: decide whether pending/running/completed job metadata survives refresh; generated images should still remain in `outputs/`.
  - Per-session reference ownership: revisit whether unsubmitted reference images should become session-scoped before queue work lands.
  - Diagnostics detail: show endpoint, model, latency, and sanitized error text; never expose API keys in UI logs or exported diagnostics.
  - Current config entry display: show a custom profile name when available; otherwise derive a short name from the API URL by removing protocol, common paths, and common domain suffixes. Make the entry visually read as clickable/editable because it opens configuration editing and later profile switching.
  - About/version surface: show app version/build info and quick copyable diagnostics for another computer.
  - Release preflight script: one command to verify version, build assets, cache-busting, package exclusions, zip hash, and G: sync readiness.
- Suggested implementation order:
  - Start with data model decisions: config profile schema, job queue schema, and session/job boundaries.
  - Then implement backend contracts for config profiles and diagnostics.
  - Then split generation submission into job lifecycle state in the frontend.
  - Finally add UI polish once queue and diagnostics behavior is proven.

## Progress Summary
- [x] Created branch `codex/v1.0.3` from the current worktree and kept existing v1.0.2 hotfix/ledger work in place.
- [x] Bumped `VERSION` to `1.0.3` so startup cache-busting separates this branch from v1.0.2.
- [x] Added config profile compatibility: old v1.0.2 `forms` become default profiles, default names derive from URL short names, and saves still write legacy `forms` for v1.0.2 compatibility.
- [x] Updated the header config entry to display `配置 · <profile/url short name>` with edit/dropdown affordance and removed the redundant `配置已完成` status chip.
- [x] Converted the connection drawer into an initial multi-config management view with a profile list, editable profile name, and API Key eye toggle that defaults to hidden on every open.
- [x] Added an initial non-blocking generation queue capsule inside the chat area; it expands into an overlay queue list without adding a right sidebar or pushing conversation layout.
- [x] Tightened the queue overlay density, added completed-job thumbnails as clickable preview targets, added per-job download links, and added download plus wheel-zoom/drag-pan controls to the global image preview lightbox. The zoom toolbar now lives inside the canvas bottom-right, while the top-right header stays for simple file actions.
- [x] Added the missing multi-config creation entry in the left config list and made queue job text clickable so it jumps back to the corresponding conversation turn.
- [x] Added guarded profile deletion in the multi-config list: the current engine must keep at least one profile, and deleting the active profile switches to another same-engine profile before saving back to `config.local.json`.
- [x] Added separate generation/chat diagnostics at `/api/diagnostics`, surfaced a `测试连接` action in the config drawer, and extended `start_web.ps1` so stale backends missing required API routes are restarted instead of reused.
- [x] Added queue row controls: running tasks can be canceled, completed/failed/canceled tasks can be retried, all tasks can apply their prompt back to the session composer or be removed from the queue.
- [x] Added browser-local queue persistence: success/error/canceled jobs survive refresh, while queued/running jobs restore as canceled with `页面刷新，任务已中断`; fixed array localStorage loading so queue arrays are not coerced into objects.
- [x] Replaced the queue row generic title `生成图片` with a compact prompt-derived title, falling back to `未命名任务` only when a job has no prompt.
- [x] Restyled the floating queue capsule from the heavy black pill to a compact smoky gray translucent glass pill with a small status dot, no dropdown arrow, and a subtle breathing animation only while queued/running tasks exist.
- [x] Added a shared smoked-glass material pass for the queue system: capsule inner highlight, queue popover glass gradient/top sheen, separated task cards, and row status strips for running/success/error states.
- [x] Reduced the queue popover default width by about 15% to `366px` and added a lower-left drag handle for resizing width and height.
- [x] Audited local runtime, frontend assets, G: sync folder, and both NM zip packages with subagents plus direct smoke checks.
- [x] Fixed the stale-backend white-screen path: `start_web.ps1` now probes current Studio JS/CSS assets before reusing an existing healthy server, and restarts a recognizable stale `app.py` process if assets fail.
- [x] Added release-cache tests covering startup asset probing and stale-backend restart logic.
- [x] Rebuilt the Studio frontend, regenerated `NM_web_imagen-v1.0.2.zip`, copied it to `NM_web_imagen.zip`, and synced package files to the G: `NM_web_imagen/` folder without deleting local runtime/config/output artifacts.
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
- [x] Added a regression test for GPT Image 2 edits requests with a Chinese reference filename.
- [x] Changed GPT Image 2 multipart upload requests to use an ASCII-safe request filename while preserving the original display filename in local asset metadata.
- [x] Synced the upload filename fix to the G: `NM_web_imagen/` folder and updated only `NM_web_imagen.zip`.
- [x] Created `codex/v1.0.2` from updated `main` for the next release slice.
- [x] Added clearer Chinese error text for upstream 524 gateway timeout responses.
- [x] Added a regression test for GPT Image 2 524 timeout messaging.
- [x] Committed the v1.0.2 branch slice as `8a42a6a Improve GPT upstream timeout messaging`.
- [x] Moved GPT `prompt / negative_prompt / poster_text` and Banana `prompt` to session-scoped drafts instead of global form presets.
- [x] Moved GPT text constraints out of `高级参数` into a composer-adjacent expandable `文本约束` strip.
- [x] Restored history apply and regenerate flows so they write back to the active session drafts instead of stale global prompt fields.
- [x] Added session-switch confirmation when unsubmitted reference images exist because references are still composer-global in this slice.
- [x] Added backend session persistence coverage for draft payloads, turn `posterText`, and cleanup of deleted session reference snapshots.
- [x] Fixed a regenerate edge case so explicit turn `negativePrompt / posterText` override the previously rendered active draft during submission.
- [x] Fixed active-session deletion so the current composer reference images are cleared instead of leaking into the next session.
- [x] Released v1.0.2 from `main` and synchronized the clean package to the G: target.
- [x] Patched v1.0.2 for upstream UTF-8 JSON charset mismatch so Chinese chat replies no longer render as mojibake.

## Verification
- Latest v1.0.5 compatibility hardening:
  - TDD red checks first reproduced missing backend version probing, missing v1.0.4 hashed asset fallbacks, legacy output id collision / forged `legacy_path` deletion, narrow toolbar/list responsive gaps, Esc closing both preview and history, and Banana requested-size display gaps.
  - `python -m unittest tests.test_release_cache_busting tests.test_studio_sessions`: passed, 44 tests.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 28 tests.
  - Final post-fix subagent review found a nested `outputs/session_refs` forged legacy deletion path; added `test_legacy_output_delete_rejects_matching_id_for_nested_outputs_file`, restricted legacy deletion to top-level output image files, and re-ran backend tests successfully.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\release_one_click.ps1`: passed on `main` on 2026-06-26 17:33 +08:00; frontend tests 61/61, frontend build passed, backend checks passed, clean package created, G: clean sync updated, and release preflight passed.
  - Release preflight reported local and G: package SHA256 `7c8e671fb1c00141243cd84427b0c202e9e2be9e8ef23d9537c93787fbe77109`, current Studio assets `index-Beqa6WRY.js` / `index-BQpJH9G2.css`, and version `1.0.5`.
  - Manual zip/G: checks confirmed `VERSION=1.0.5`, current assets and v1.0.4 fallback assets `index-CnP0RvwW.js` / `index-Dr4xysUg.css` are present, and `config.local.json` / `outputs/` are absent.
  - `git diff --check`: passed with only expected LF/CRLF warnings.
- Latest v1.0.3 profile/queue slice verification:
  - Baseline before edits: `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Baseline before edits: `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 25 tests.
  - Baseline before edits: `node --test .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 19 tests.
  - Baseline before edits: `npm run build` from `studio-web`: passed.
  - New profile tests were written red first, then passed: legacy `forms` wrap into profiles, saved profile config keeps legacy `forms`.
  - `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 27 tests.
  - `node --test .\src\configProfiles.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 22 tests.
  - `npm run build` from `studio-web`: passed; current assets are `index-CrF-zptf.js` and `index-2gA9ys33.css`, with v1.0.2 fallback assets preserved.
  - Browser smoke on `http://127.0.0.1:7861/?v=1.0.3-smoke`: no white screen; header only shows the config button, no redundant `配置已完成` chip; multi-config drawer opens; API Key input is `type=password`; eye button has no border/background; queue capsule and overlay render in the chat area.
  - 2026-05-26 queue/preview polish: `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 8 tests.
  - 2026-05-26 queue/preview polish: `node --test .\src\configProfiles.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 24 tests.
  - 2026-05-26 queue/preview polish: `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - 2026-05-26 queue/preview polish: `npm run build` from `studio-web`: passed; current generated assets are `index-pyyH3H60.js` and `index-BnuKZBhe.css`.
  - 2026-05-26 queue/preview polish: `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 27 tests.
  - 2026-05-26 queue/preview polish: browser smoke on `http://127.0.0.1:7861/?v=1.0.3-smoke` with mocked generation response confirmed queue popover width 430px, title 18px, thumbnail 44x44, thumbnail opens the lightbox, and the lightbox has download, zoom in/out, fit, 100%, and `.lightbox-stage` cursor `zoom-in`.
  - 2026-05-26 queue/preview polish: `git diff --check`: passed with only expected LF/CRLF warnings.
  - 2026-05-26 15:12 zoom/pan and toolbar placement polish: `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 9 tests.
  - 2026-05-26 15:12 zoom/pan and toolbar placement polish: `node --test .\src\configProfiles.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 25 tests.
  - 2026-05-26 15:12 zoom/pan and toolbar placement polish: `npm run build` from `studio-web`: passed; current generated assets are `index-DDhUWlv8.js` and `index-jU3LE9wH.css`.
  - 2026-05-26 15:12 zoom/pan and toolbar placement polish: `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - 2026-05-26 15:12 zoom/pan and toolbar placement polish: `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 27 tests.
  - 2026-05-26 15:12 zoom/pan and toolbar placement polish: browser smoke on `http://127.0.0.1:7861/?v=1.0.3-zoomtools-bottom` confirmed the preview header has no zoom controls, `.lightbox-zoom-tools` is inside `.lightbox-stage`, and it sits 14px from the canvas right/bottom edge.
  - 2026-05-26 15:18 add-profile and queue-jump polish: `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 10 tests.
  - 2026-05-26 15:18 add-profile and queue-jump polish: `node --test .\src\configProfiles.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 26 tests.
  - 2026-05-26 15:18 add-profile and queue-jump polish: `npm run build` from `studio-web`: passed; current generated assets are `index-kSsxhjdu.js` and `index-BhdFRWPJ.css`.
  - 2026-05-26 15:18 add-profile and queue-jump polish: `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - 2026-05-26 15:18 add-profile and queue-jump polish: `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 27 tests.
  - 2026-05-26 15:18 add-profile and queue-jump polish: browser smoke on `http://127.0.0.1:7861/?v=1.0.3-add-profile-jump` confirmed `新增配置` appears in the left profile list, clicking it creates/selects `新配置 2`, and clicking the queue job text closes the queue popover and scrolls to a `turn-*` element.
  - `git diff --check`: passed with only expected LF/CRLF warnings.
  - 2026-05-26 15:35 delete-profile polish: `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 11 tests.
  - 2026-05-26 15:35 delete-profile polish: `node --test .\src\configProfiles.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 27 tests.
  - 2026-05-26 15:35 delete-profile polish: `npm run build` from `studio-web`: passed; current generated assets are `index-VlInpUeL.js` and `index-BZ2WVYkL.css`.
  - 2026-05-26 15:35 delete-profile polish: `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - 2026-05-26 15:35 delete-profile polish: `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 27 tests.
  - 2026-05-26 15:35 delete-profile polish: browser smoke on `http://127.0.0.1:7861/?v=1.0.3-delete-profile` confirmed only-profile delete is disabled, adding a second profile enables delete, deleting the active second profile confirms then switches back to the remaining same-engine profile, and the remaining delete button becomes disabled again.
  - 2026-05-26 17:02 diagnostics and queue controls: red tests first reproduced missing `/api/diagnostics`, missing frontend diagnostics UI, missing queue action controls, and missing startup required-route probing.
  - 2026-05-26 17:02 diagnostics and queue controls: `node --test .\src\configProfiles.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 29 tests.
  - 2026-05-26 17:02 diagnostics and queue controls: `npm run build` from `studio-web`: passed; current generated assets are `index-4bwlxH7e.js` and `index-CZQ5CDIH.css`.
  - 2026-05-26 17:02 diagnostics and queue controls: `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - 2026-05-26 17:02 diagnostics and queue controls: `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 29 tests.
  - 2026-05-26 17:02 diagnostics and queue controls: browser smoke on `http://127.0.0.1:7861/?v=1.0.3-diagnostics` confirmed mocked partial diagnostics render `生图可用，聊天失败` with separate cards and redacted error; `http://127.0.0.1:7861/?v=1.0.3-queue-actions` confirmed queue rows expose cancel/retry/apply/remove actions without a live upstream request.
- Latest package/white-screen audit verification:
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 25 tests.
  - `node --test .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 19 tests.
  - `npm run test:size` from `studio-web`: passed.
  - `npm run build` from `studio-web`: passed; current assets remain `index-DjJyEBb1.js` and `index-D6wyuxyS.css`.
  - `git diff --check`: passed with only expected LF/CRLF warnings.
  - `package_web_tool.ps1 -OutputPath <temp zip>`: passed; extracted package had no excluded local artifacts and included startup asset probe logic.
  - Extracted temp package server smoke on port `7866`: `/api/health` passed; root page assets `/assets/index-DjJyEBb1.js` and `/assets/index-D6wyuxyS.css` returned 200.
  - G: `NM_web_imagen.zip` and `NM_web_imagen-v1.0.2.zip` were regenerated to identical current packages; both extracted zip smoke checks returned 200 for root page JS/CSS assets.
  - G: folder now has the updated `start_web.ps1` asset probe and matching `./assets` references, but local artifacts still exist there: `config.local.json`, `outputs/`, `.runtime/`, and `__pycache__/`.
- Latest session-draft verification:
  - `node --test .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs` from `studio-web`: passed, 8 tests.
  - `npm run build` from `studio-web`: passed; updated assets `static/studio/assets/index-Dp26rfuO.js` and `static/studio/assets/index-acPErJzx.css`.
  - `npm run test:size` from `studio-web`: passed.
  - `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions`: passed, 15 tests.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `git diff --check`: passed with only expected LF/CRLF warnings after normalizing `static/studio/index.html`.
  - `Invoke-WebRequest http://127.0.0.1:7861/api/health`: passed, health payload confirmed `studio_sessions` and `session_reference_files`.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: WARN only; `NEXT_ACTIONS.md ## Now` needed compaction.
- Latest v1.0.2 branch verification:
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions`: passed, 12 tests.
  - `npm run test:size` from `studio-web`: passed.
  - `git diff --check`: no whitespace errors, only expected LF/CRLF warnings.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\package_web_tool.ps1 -OutputPath <temp zip>`: passed.
  - Synced temp package contents to `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen`.
  - G: copy `$env:PYTHONUTF8='1'; python -m py_compile <G target>\app.py`: passed; generated `__pycache__` verification residue was removed afterward.
  - G: final artifact scan found no `config.local.json`, `outputs/`, `logs/`, `.runtime`, `.venv`, `.playwright-mcp`, `.git`, `__pycache__`, `AGENTS.md`, `PROJECT_STATUS.md`, `NEXT_ACTIONS.md`, `DECISIONS.md`, `studio-web/node_modules`, or `studio-web/tsconfig.tsbuildinfo`.
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
- Latest GPT reference upload encoding verification:
  - `python -m unittest tests.test_studio_sessions.StudioSessionTests.test_gpt_generation_uses_ascii_multipart_filename_for_reference_upload`: initially reproduced the failure with `UnicodeEncodeError` on `参考图.png`, then passed after the fix.
  - `python -m unittest tests.test_studio_sessions`: passed, 7 tests.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `git diff --check`: no whitespace errors, only expected LF/CRLF warnings.
  - `npm run build` from `studio-web`: passed.
  - `npm run test:size` from `studio-web`: passed.
  - G: copy `$env:PYTHONUTF8='1'; python -m py_compile .\NM_web_imagen\app.py`: passed; the generated `__pycache__` verification residue was removed afterward.
  - G: final artifact scan found no `config.local.json`, `outputs/`, `logs/`, `.runtime`, `.venv`, `.playwright-mcp`, `.git`, `.svn`, `__pycache__`, `node_modules`, or `tsconfig.tsbuildinfo`.
  - `NM_web_imagen.zip` root is `NM_web_imagen/`, has no excluded local artifacts, and was updated at `2026-05-12 19:43:50`.
  - Old `web_imagen_tool.zip` remained unchanged at 14,889,614 bytes with timestamp `2026-05-11 15:20:57`.
- Latest v1.0.3 queue-persistence verification:
  - `node --test .\src\queuePersistence.test.mjs .\src\uiPolish.test.mjs` from `studio-web`: passed, 17 tests.
  - `npm run build` from `studio-web`: passed; current built JS asset includes `static/studio/assets/index-Bnaal4ny.js`.
  - Browser smoke on `http://127.0.0.1:7861/?v=1.0.3-persist-fix2`: a stored `running` queue job restored after refresh as `canceled`, the queue capsule appeared, and the opened row showed `已取消`.
  - Browser non-blocking smoke with mocked `/api/generate/gpt-image-2`: two generation submissions completed without calling the paid upstream; while the first was running, buttons and textarea were not disabled, and the queue stored two success jobs.
  - `node --test .\src\configProfiles.test.mjs .\src\queuePersistence.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 33 tests.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 29 tests.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
- Latest v1.0.3 queue-title verification:
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built JS asset includes `static/studio/assets/index-DsWxa4Ga.js`.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: passed, 0 fail / 0 warn.
- Latest v1.0.3 queue-capsule polish verification:
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed on the old black capsule CSS before implementation.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-CND6kz-v.js` and `static/studio/assets/index-C8CWA69z.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser style smoke on `http://127.0.0.1:7861/?v=1.0.3-glass-queue`: queue capsule appeared with text `队列1`, `rgba(255, 255, 255, 0.78)` background, `32px` min-height, `999px` radius, and no SVG arrow inside the capsule.
- Latest v1.0.3 dark queue-capsule verification:
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed on the previous white-glass capsule CSS before implementation.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index--ehayZV1.js` and `static/studio/assets/index-ThWX4dcl.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser active-state smoke with mocked slow `/api/generate/gpt-image-2`: queue capsule appeared as `queue-capsule active`, text `队列1`, background `rgba(31, 34, 39, 0.76)`, capsule animation `queue-capsule-breathe` for `2.4s`, and running dot animation `queue-dot-pulse`.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: passed, 0 fail / 0 warn.
- Latest v1.0.3 smoky queue-capsule verification:
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed on the prior darker `rgba(31, 34, 39, 0.76)` capsule before implementation.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-BIih_HXH.js` and `static/studio/assets/index-B4mRJfVk.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser active-state smoke with mocked slow `/api/generate/gpt-image-2`: queue capsule appeared as `queue-capsule active`, text `队列1`, background `rgba(72, 76, 84, 0.54)`, backdrop filter `blur(20px) saturate(1.35)`, white text, and active animation `queue-capsule-breathe`.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: passed, 0 fail / 0 warn.
- Latest v1.0.3 queue material verification:
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed because `.queue-capsule::before` and the materialized popover/row CSS did not exist.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-BjlyMQtK.js` and `static/studio/assets/index-DKqCSWDn.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser queue-menu material smoke on `http://127.0.0.1:7861/?v=1.0.3-queue-material`: capsule has inner highlight gradient, popover has glass gradient and `blur(22px) saturate(1.18)`, popover top highlight is `58px`, task rows have `rgba(255,255,255,0.66)` surface, `14px` radius, and `3px` status strip.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: passed, 0 fail / 0 warn.
- Latest v1.0.3 queue resize verification:
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed because `QUEUE_POPOVER_DEFAULT_WIDTH = 366`, resize state, CSS variables, and resize handle did not exist.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-DgRX9Vlo.js` and `static/studio/assets/index-CXJMWb_n.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser resize smoke on `http://127.0.0.1:7861/?v=1.0.3-queue-resize`: default popover measured `366x310`, resize handle existed, and dragging left/down changed it to `446x390`.
- Latest v1.0.3 queue resize correction verification:
  - Root cause: the first resize implementation made `.queue-popover` itself the scrolling layer (`overflow:auto`), so the resize handle/content felt mixed with individual queue rows instead of resizing a stable outer window.
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed because `.queue-popover` did not use `grid-template-rows: auto minmax(0, 1fr)` + `overflow:hidden`, and `.queue-list` did not own the scrolling.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-lQYoW3VM.js` and `static/studio/assets/index-COgj2vDB.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser resize smoke on `http://127.0.0.1:7861/?v=1.0.3-queue-resize-fix`: outer `.queue-popover` changed from `366x310` to `456x400`, outer overflow stayed `hidden`, and inner `.queue-list` stayed `overflow:auto`.
- Latest v1.0.3 single-row queue stretch verification:
  - Root cause: the queue list is a CSS grid; with a single auto row inside a fixed-height list area, the row stretched to fill the remaining track height unless the list explicitly aligned content to the start.
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed because `.queue-list` lacked `align-content:start` and `grid-auto-rows:max-content`.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-Dwns7EYr.js` and `static/studio/assets/index-vCyicaSU.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser single-row smoke on `http://127.0.0.1:7861/?v=1.0.3-queue-single-row-fix`: popover height was `310`, list height was `218`, but the single row height was `73`; `.queue-list` reported `align-content:start`, `grid-auto-rows:max-content`, and `overflow:auto`.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: passed, 0 fail / 0 warn.
- Latest v1.0.3 queue compact-text verification:
  - TDD red check: `node --test .\src\uiPolish.test.mjs` first failed because queue rows still rendered repeated status text and elapsed seconds in the right-side status column.
  - `node --test .\src\uiPolish.test.mjs` from `studio-web`: passed, 15 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-DhVum5vy.js` and `static/studio/assets/index-CdRuknBN.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - Browser compact-text smoke on `http://127.0.0.1:7861/?v=1.0.3-queue-compact-text-fix`: row text no longer contained `失败/已完成/生成中/排队中/已取消`; elapsed seconds moved into the meta line as `test / gpt-image-2 · 2 秒`; title box ended before the action buttons.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: passed, 0 fail / 0 warn.
- Latest v1.0.3 subagent review hardening:
  - Subagent review found queue/session orphan risks, refresh state mismatch, diagnostics endpoint redaction leakage, loose stale-process matching, unsaved profile edits lost on switch, and untracked current hash assets.
  - Added queue/session boundary helpers so running/queued jobs block session deletion/clear, refresh-interrupted queue jobs mark matching running turns as errored, missing queue targets no longer pretend to jump, retries avoid deleted session ids, and apply falls back to the current session with a notice.
  - Added `syncActiveProfileForm` so switching profiles preserves unsaved edits into the previous active profile before loading the next one.
  - Redacted diagnostics endpoints for URL userinfo and sensitive query params, and tightened `start_web.ps1` to recognize only this repository's resolved `app.py` path.
  - `node --test .\src\configProfiles.test.mjs .\src\configProfileSelection.test.mjs .\src\queuePersistence.test.mjs .\src\queueSessionBoundaries.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web`: passed, 37 tests.
  - `npm run build` from `studio-web`: passed; current built assets include `static/studio/assets/index-CsE45KWn.js` and `static/studio/assets/index-CdRuknBN.css`.
  - `$env:PYTHONUTF8='1'; python -m py_compile .\app.py`: passed.
  - `$env:PYTHONUTF8='1'; python -m unittest tests.test_studio_sessions tests.test_release_cache_busting`: passed, 30 tests.
  - Browser smoke on `http://127.0.0.1:7861/?v=1.0.3-review-fix`: page title `生图工作台`, root rendered, script `assets/index-CsE45KWn.js`, stylesheet `assets/index-CdRuknBN.css`, no new console errors.
  - `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
  - `python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" "I:\AI\Vibe Coding\NM_web_imagen"`: passed, 0 fail / 0 warn.
- Latest v1.0.3 sync/package verification:
  - Added `sync_release_to_g.ps1`; sync strategy is to build a clean package, extract it to a temporary source folder, mirror only that clean folder to the G: `NM_web_imagen/` directory, and update only the versioned package zip.
  - Fixed the sync script for Windows PowerShell 5.1 Chinese path handling by constructing the default G: path from Unicode code points; removed the accidental mojibake `G:\su\doc\Tools\AI浜у嚭宸ュ叿鎻掍欢` folder created by the first run.
  - User clarified that unversioned `NM_web_imagen.zip` should no longer be synced; the script now only writes `NM_web_imagen-v1.0.3.zip` locally and in the G: share root.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\sync_release_to_g.ps1`: passed and updated `G:\su\doc\Tools\AI产出工具插件\美术\特效组\网页生图工具\NM_web_imagen` plus `NM_web_imagen-v1.0.3.zip`.
  - G: clean folder scan found no `config.local.json`, `outputs`, `logs`, `.runtime`, `.venv`, `.playwright-mcp`, `__pycache__`, `studio-web\node_modules`, `studio-web\tsconfig.tsbuildinfo`, or internal ledger files.
  - G: Studio index points to `assets/index-CsE45KWn.js` and `assets/index-CdRuknBN.css`.
  - G: copy `$env:PYTHONUTF8='1'; python -m py_compile ...\NM_web_imagen\app.py`: passed; verification-created `__pycache__` was removed afterward.
  - Local and G: `NM_web_imagen-v1.0.3.zip` contain `sync_release_to_g.ps1`, `index-CsE45KWn.js`, and `index-CdRuknBN.css`, and contain no `config.local.json`, `outputs`, `.runtime`, or internal ledger files.
  - G: `web_imagen_tool.zip` remained unchanged at timestamp `2026/5/11 15:20:57`; existing unversioned `NM_web_imagen.zip` was not updated by the corrected sync run and is left for the user to delete later.
- Latest v1.0.3 one-click release verification:
  - Added `release_preflight.ps1`, `release_one_click.ps1`, and `一键发布.bat`.
  - `release_one_click.ps1` runs frontend tests, frontend build, backend compile/tests, package sync, then release preflight. `一键发布.bat` launches that script for double-click use.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\release_preflight.ps1`: passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\release_one_click.ps1`: passed; frontend tests 37/37, `npm run build` passed, backend/release tests 34/34, package sync passed, final preflight passed.
  - G: `NM_web_imagen-v1.0.3.zip` updated at `2026/5/26 21:11:13`; G: unversioned `NM_web_imagen.zip` remained at `2026/5/26 20:50:54`; `web_imagen_tool.zip` remained at `2026/5/11 15:20:57`.
  - G: clean folder includes the one-click scripts and still has no `config.local.json`, `outputs`, `.runtime`, or `__pycache__`.
- Latest v1.0.3 serialized queue fix:
  - Root cause: the queue UI was a concurrent task list; each generate submit immediately called `/api/generate/...`, so the second task could sit in an upstream request instead of waiting behind the first.
  - Evidence from `outputs/studio_sessions.json`: session `猫狗大战` had `猫狗大战` success after about 70.61s and `猪狗大战` error after about 505.27s with `GPT Image 2 请求超时：上游接口长时间没有返回。`
  - Added a tested queue scheduler so only one generation job runs at a time; submissions enter `queued`, the oldest queued job starts only when no job is `running`, and queued turns now show `排队中，等待前面的生图任务完成`.
  - Updated refresh reconciliation so both queued and running turns are marked interrupted after reload, preserving the existing “HTTP requests do not survive refresh” decision.
  - Subagent review found two queue hardening issues: trimming the visible queue to 30 could drop the running job and allow a second request, and removing active queued/running jobs could leave a stuck conversation turn.
  - Fixed both: queue trimming now preserves active jobs before finished history, and active job remove now delegates to cancellation so the queue item, payload ref, abort controller, and turn state stay consistent.
  - Verification: `node --test .\src\configProfiles.test.mjs .\src\configProfileSelection.test.mjs .\src\generationQueue.test.mjs .\src\queuePersistence.test.mjs .\src\queueSessionBoundaries.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs` from `studio-web` passed, 42 tests; `npm run build` passed and generated `static/studio/assets/index-DtiPs6UC.js`; `$env:PYTHONUTF8='1'; python -m py_compile .\app.py` passed; backend unittest suite passed, 34 tests; ledger check passed; `git diff --check` passed with only expected LF/CRLF warnings.
  - Re-ran one-click release after the fix: `powershell -NoProfile -ExecutionPolicy Bypass -File .\release_one_click.ps1` passed; frontend release tests 37/37, build passed with `index-DtiPs6UC.js`, backend tests 34/34, sync updated the clean G: folder and `NM_web_imagen-v1.0.3.zip`, release preflight passed.
- Latest v1.0.3 multi-image fallback fix:
  - Root cause evidence: latest `outputs/history.json` entry for `人狗大战` had `form_state.n = 2` and `meta.n = 2`, proving the frontend and backend sent the requested count, but `meta.image_count = 1` / `saved_count = 1`, proving the current GPT gateway returned only one image.
  - Added backend compensation for `/v1/images/generations` and `/v1/images/edits`: if `n > 1` and the upstream returns fewer images than requested, issue follow-up request(s) for the remaining count and aggregate returned images/usage.
  - Verification: targeted regression `test_gpt_generation_retries_remaining_images_when_upstream_returns_fewer_than_requested` failed before the fix and passed after; `$env:PYTHONUTF8='1'; python -m py_compile .\app.py` passed; backend/release tests passed, 35 tests; release one-click passed on 2026-05-27 00:23 +08:00, with frontend tests 37/37, build passed, sync updated G: clean folder and `NM_web_imagen-v1.0.3.zip`, and release preflight passed.
  - After the user confirmed the local restarted service could produce the requested multi-image result, re-ran `release_one_click.ps1` on 2026-05-27 01:27 +08:00; frontend tests 37/37, frontend build, backend tests 35/35, clean G: sync, versioned package update, and release preflight all passed.

## Blockers And Risks
- `AGENTS.md` still contains older project snapshot wording, but it explicitly says not to edit that file unless the user asks.
- `/classic` intentionally keeps old no-build static UI files; do not delete `static/index.html`, `static/app.js`, or `static/styles.css` unless the rollback path is intentionally retired.
- No live paid image-generation request is required for packaging cleanup.
- Browser payload smoke could not be completed because the in-app browser navigation timed out; code-level build and backend request-contract tests cover the fix.
- `C:\Users\Cherofre\.codex\memories` from the project-local `AGENTS.md` could not be created on this machine due access denial; current global memory remains under `C:\Users\mumengfei\.codex\memories`.
- User clarified the share target should keep new and old packages side by side: do not delete or update `web_imagen_tool/` or `web_imagen_tool.zip` while syncing this fix.
- The screenshot that triggered this fix was from another machine, so no local live upstream generation was reproduced; the covered root cause is request construction with non-ASCII multipart filenames.
- Updating the G: folder required stopping its running `start_web.ps1` / portable `python.exe` processes because `.runtime` DLLs were locked.

## History
- 2026-05-03: Created ledger after the user explicitly asked about `project-ledger-loop`.
- 2026-05-10: Replaced the static skinning attempt with a React/Vite Studio frontend trial while preserving the FastAPI backend.
- 2026-05-11: Added backend session persistence, chat model controls, and cleanup of old package naming.
