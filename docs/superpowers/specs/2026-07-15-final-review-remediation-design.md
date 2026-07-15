# v1.0.6 Final Review Remediation Design

## 1. Context

The final whole-branch review of `f4afcd0b8d65b045091c6cafd4aa94b95cf3d484..99d8d911f889eb3c6b905e89327a5f1ed696c041` found zero Critical issues and five unresolved Important issues:

1. Invalid upstream image candidates consume memory/network work without consuming the request-wide byte budget.
2. Unsafe API writes outside generation have no encoded-body limit, and Studio session normalization can persist oversized arbitrary fields.
3. Startup hydration replaces newer browser-local sessions whenever the server has any sessions.
4. Successful session saves do not apply server-normalized reference URLs back to the current browser state, causing repeated Base64 uploads and unstable UUID paths.
5. Public endpoint hints and diagnostic error URLs can retain sensitive path or uncommon query credentials.

The user approved the complete but conservative remediation approach. The current v1.0.6 ZIP with SHA256 `56aef66b45c9fec40f3d9b97355c7e2bf59de7615f49d0800b49c08294a23216` remains on disk but is a rejected candidate and must not be treated as the final release.

## 2. Goals

- Bound all upstream image inspection work by one request-wide byte budget, including invalid candidates.
- Bound every unsafe `/api` request before FastAPI parses its body.
- Keep Studio session JSON compact, predictable, and backward-compatible with existing stored sessions.
- Preserve newer browser-local work during startup while retaining server-only changes and correct deletion semantics after a baseline has been established.
- Replace saved reference Base64 with stable local `/outputs` URLs without overwriting references edited while a save is in flight.
- Prevent public diagnostics, errors, history, and session metadata from exposing URL userinfo, paths, query values, or fragments.
- Preserve the current FastAPI + React/Vite architecture, `/classic`, Windows PowerShell 5.1 launchers, offline packaging, and v1.0.5 data compatibility.

## 3. Non-goals

- Do not add Pillow or another raster decoder in this remediation. Magic-byte validation remains the approved v1.0.6 contract; full decode verification is a later enhancement.
- Do not redesign the Studio interface or change its visual character.
- Do not migrate persistence to SQLite or add accounts, LAN/remote mode, or a backend worker queue.
- Do not lower the existing 25 MiB per-reference and 150 MiB aggregate raw-reference limits.
- Do not automatically rewrite old session files during GET requests.

## 4. Chosen Architecture

### 4.1 Upstream inspection budget

`UpstreamImageBudget` will separate two concepts:

- `checked_bytes`: every decoded or downloaded candidate byte inspected during the request.
- `accepted_images`: candidates that pass raster validation and are returned to the caller.

For Base64 candidates, estimate decoded size before decoding, reserve that amount against `checked_bytes`, then decode and validate. Invalid Base64 or invalid raster content does not refund the reservation. For remote URLs, charge each streamed chunk before adding it to the in-memory payload; validation failure likewise does not refund bytes. `Content-Length` remains an early rejection hint but is not trusted as the final accounting source.

The existing limits remain:

- At most 10 accepted images per request.
- At most 150 MiB checked image bytes per request.
- At most 50 MiB for any single candidate.

Intent: ten near-50 MiB invalid candidates must stop at the same 150 MiB request budget instead of causing roughly 500 MiB of work.

### 4.2 Encoded request-body limits

`RequestBoundaryMiddleware` will apply a path-specific limit to every unsafe `/api` request before FastAPI calls `Body(...)`, `request.json()`, or form parsing:

- `/api/generate/*`: retain the existing 152 MiB multipart/body limit.
- `/api/studio/sessions`: allow Base64 expansion of the existing 150 MiB raw-reference budget plus 8 MiB JSON overhead. The encoded limit is exactly 208 MiB (`218,103,808` bytes).
- Every other unsafe `/api` route: 2 MiB.

Both declared `Content-Length` and actual streamed bytes are checked. Exceeding a limit returns HTTP 413 with a stable Chinese detail and does not enter endpoint parsing.

### 4.3 Bounded Studio session schema

Existing session, turn, and reference-count limits remain. Session normalization additionally applies these bounds:

- Prompt, reply, and draft strings: at most 200,000 characters each.
- Error strings: at most 8,000 characters.
- Generated-image scalar fields: at most 8,192 characters each.
- Turn metadata: recursive depth at most 4, at most 50 items per mapping/list, at most 8,192 characters per string, and at most 64 KiB after normalization.
- The complete normalized Studio session JSON: at most 32 MiB after data-URL references have been externalized to files.

Generated images are normalized to the existing known fields (`id`, `name`, `saved_name`, `saved_url`, `saved_path`, `url`, `mime_type`, `dimensions`). Raw `b64_json` and `data_url` fields are not persisted. When a valid `saved_url` exists, redundant data/remote `url` content is omitted. Unknown fields are ignored rather than copied verbatim.

Intent: legitimate prompts, replies, output links, and old sessions continue to load, while arbitrary nested blobs cannot make `studio_sessions.json` grow without bound. A normalized payload above 32 MiB is rejected with HTTP 413 before atomic replacement, and any reference files created for that failed mutation are cleaned up. Normalization occurs only on a user write; GET remains read-only.

### 4.4 Startup three-way reconciliation

The browser will persist compact sanitized server-baseline markers containing:

- Last accepted server revision.
- Session ID and `updatedAt` for each canonical server session.
- Canonical active session ID.

On startup, the client compares:

1. The stored server baseline.
2. Current browser-local sessions.
3. Current server sessions.

It reuses the existing three-way merge semantics so newer local edits survive, server-only edits survive, and a deletion wins when the opposite side is unchanged from the stored baseline markers. The complete current server response becomes the new in-memory baseline, while only compact markers are persisted in localStorage. If merged state differs from the server, the normal debounced save persists the merge.

For users upgrading without a stored baseline, the first startup performs an `updatedAt`-based union: newer copies win and unique sessions from either side survive. This intentionally favors avoiding silent data loss. Once the first baseline is stored, later startups have correct deletion semantics.

The baseline markers are sanitized before localStorage persistence, never contain API keys or image payloads, and remain small enough for normal browser storage quotas. If marker persistence fails, startup falls back to the first-start union rather than discarding local sessions.

### 4.5 Safe reference canonicalization and stable files

After a successful session PUT, the client applies server-normalized reference fields by stable session ID, turn ID, and reference ID. A server field is applied only when the current reference `src` still equals the `src` sent by that save attempt. If the user changed or replaced the reference while the request was in flight, the newer local value is preserved and will be saved normally.

The update covers React state, refs, localStorage, and the persisted server baseline. A save triggered only by canonical URL replacement is skipped; genuine concurrent local edits still schedule another save.

New data-URL reference files use a deterministic name based on sanitized session/turn/reference IDs plus a SHA-256 content prefix. If the same content already exists at that path, the backend reuses it. Existing `/outputs/session_refs/...` URLs and old UUID files remain readable and are not renamed on GET.

Intent: repeated saves do not retransmit or rewrite the same image, and another tab's canonical URL does not become stale merely because identical content was saved again.

### 4.6 Host-only public URL hints

Public URL surfaces will retain only normalized hostname and non-default port:

- Remove scheme credentials/userinfo.
- Remove the complete path.
- Remove the complete query, regardless of key name.
- Remove the fragment.
- Preserve normalized IPv4/IPv6 hostname and a non-default port.

Diagnostics and persisted metadata will therefore expose values such as `gateway.example.com:8443`, never `/proxy/credential`, `?key=...`, or `#fragment`. The full connection URL remains available only in the user's configuration form and `config.local.json`; those are not copied into public metadata or release packages.

## 5. Compatibility and Visible Impact

- Normal generation, chat, history, configuration profiles, queue behavior, and `/classic` remain visually unchanged.
- Existing config, history, Studio sessions, `/outputs` links, and UUID reference files remain readable.
- A newer browser-local session will no longer disappear merely because the server has an older non-empty file.
- Reference-backed sessions should become smaller and stop rewriting identical files after the first successful canonical save.
- Diagnostics will show less endpoint detail: host and port only. The editable config drawer still shows the user's complete endpoint.
- Only abusive or accidentally enormous requests should see new HTTP 413 responses.
- The v1.0.5 ZIP remains untouched for rollback.

## 6. Error Handling

- Request-body overflow: HTTP 413 before endpoint parsing.
- Upstream checked-byte overflow: existing stable upstream result-limit error contract.
- Oversized or unknown Studio fields: truncate bounded text/metadata or omit unknown blob fields. Reject with HTTP 413 only when the encoded request exceeds its route limit or the normalized session JSON still exceeds 32 MiB.
- Baseline parse failure: ignore the invalid stored baseline, use the first-start `updatedAt` union, and write a fresh sanitized baseline after successful hydration.
- Reference canonicalization mismatch: preserve current local data and allow the next normal save to resolve it.

## 7. Test and Release Gates

Each remediation slice uses RED/GREEN regression tests before production code changes.

Required targeted coverage:

- Several invalid Base64/URL candidates exhaust the checked-byte budget even though zero images are accepted.
- Valid images still obey the accepted-image limit and are not double-charged.
- Oversized session, chat, diagnostics, config, and generation requests return 413 before endpoint parsing.
- Oversized nested session fields do not persist; normal legacy session shapes remain compatible.
- Startup keeps newer local edits, keeps server-only edits, and respects deletion when a stored baseline exists.
- Save success replaces only unchanged reference sources and preserves references edited while the request was pending.
- Re-saving identical data-URL content reuses one deterministic file.
- URL tests cover userinfo, path credentials, `key`, `credential`, `code`, arbitrary query names, fragments, IPv6, and non-default ports.

Before a new candidate reaches `G:`:

1. Full Python suite.
2. All Node test modules and `npm run test:size`.
3. TypeScript/Vite build.
4. Four-module `py_compile`.
5. Six UTF-8 BOM and PowerShell 5.1 parser checks.
6. Exact-manifest package and extracted portable-runtime smoke.
7. LocalOnly preflight.
8. API/browser smoke without paid upstream calls.
9. Final whole-branch review with zero unresolved Critical/Important findings.
10. Only then overwrite the v1.0.6 G: candidate and run full destination preflight.

## 8. Residual Risks

- Cancellation still cannot guarantee provider-side cancellation or refund after an upstream accepts work.
- Locks and the job registry remain single-process by design.
- A first upgrade startup without a stored baseline cannot perfectly distinguish an intentional deletion from a stale local-only copy; it favors preservation once, then records a baseline for correct future merges.
- Magic-byte validation may still accept structurally corrupt raster files. This is a documented Minor issue deferred to a future dependency-aware image-decoding enhancement.
