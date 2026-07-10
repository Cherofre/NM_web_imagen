# v1.0.6 P1 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 v1.0.5 已确认的 9 类 P1 安全、行为、并发、持久化和 Windows 发布风险，同时保持旧配置、历史、会话、`/classic` 与双击离线启动兼容。

**Architecture:** 保留 FastAPI + React/Vite + Classic 无构建页面架构。把严格图片边界放入 `image_safety.py`，把锁和原子 JSON 操作放入 `storage.py`，把受限线程执行和 job 取消状态放入 `upstream.py`；`app.py` 只负责路由、供应商 payload 和兼容转换。前端新增小型纯函数模块处理无密钥持久化、job 协议和 session revision 合并。

**Tech Stack:** Python 3.12、FastAPI、requests、unittest、React 19、TypeScript 5.9、Vite 7、Node test runner、Windows PowerShell 5.1。

---

## 文件职责

- Create `image_safety.py`: 栅格魔数识别、容量限制、data URL 解码、受控 outputs 路径和流式远程图片下载。
- Create `storage.py`: 按路径 `RLock`、UUID 临时文件、flush/fsync、原子替换、备份和锁内 JSON mutation。
- Create `upstream.py`: 请求 semaphore、`asyncio.to_thread()` 调度、Banana/GPT 请求头和 TTL job registry。
- Modify `app.py`: 接入三个模块，收紧 CORS/outputs/host，异步请求，取消协议，原子历史/config/session 和 revision。
- Create `tests/test_security_boundaries.py`: CORS、outputs、图片格式/容量、SSRF、host 与错误脱敏测试。
- Create `tests/test_upstream_jobs.py`: Banana 契约、事件循环非阻塞、取消后不保存测试。
- Create `tests/test_storage_concurrency.py`: 并发历史写、原子 config、session revision 和引用保留测试。
- Create `studio-web/src/clientSafety.ts` and `.test.mjs`: 递归剔除 localStorage 中的 `api_key`。
- Create `studio-web/src/jobProtocol.ts` and `.test.mjs`: job ID 字段、取消 URL 和取消提示协议。
- Create `studio-web/src/sessionRevision.ts` and `.test.mjs`: revision payload 与按 `updatedAt` 合并。
- Modify `studio-web/src/App.tsx`, `i18n.ts`, `uiPolish.test.mjs`: 聊天参考图真实性、无效控件隐藏、job 取消、session 409 重试。
- Modify `static/index.html`, `static/app.js`: Classic 无密钥 localStorage 和无效控件隐藏。
- Create `tests/test_classic_frontend_security.py`: Classic 源码级持久化和控件回归测试。
- Modify `start_web.ps1`: UTF-8、runtime 指纹、解压失败保留 ZIP、instance ID 与准备模式。
- Modify `package_web_tool.ps1`: 明确白名单复制。
- Modify `release_one_click.ps1`, `release_preflight.ps1`: 本地预检先于 G 盘同步。
- Create `release_package_smoke.ps1`: 解压发布包，用全新便携 runtime 启动临时端口并检查 health。
- Modify `tests/test_release_cache_busting.py`: Windows/打包/发布顺序回归测试。

---

### Task 1: Harden local API and image boundaries

**Files:**
- Create: `image_safety.py`
- Create: `tests/test_security_boundaries.py`
- Modify: `app.py`
- Test: `tests/test_security_boundaries.py`

- [ ] **Step 1: Write failing pure image-safety tests**

Create tests for accepted raster magic, fake MIME, SVG, Base64 preflight size, total upload size and safe outputs resolution:

```python
import base64
import tempfile
import unittest
from pathlib import Path

from image_safety import (
    ImageSafetyError,
    decode_raster_data_url,
    resolve_output_image,
    validate_raster_bytes,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 32


class ImageSafetyTests(unittest.TestCase):
    def test_rejects_svg_and_fake_image_mime(self) -> None:
        with self.assertRaises(ImageSafetyError) as svg_error:
            validate_raster_bytes(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", max_bytes=1024)
        self.assertEqual(400, svg_error.exception.status_code)

        with self.assertRaises(ImageSafetyError):
            validate_raster_bytes(b"{\"not\":\"image\"}", max_bytes=1024, claimed_mime="image/png")

    def test_rejects_oversized_data_url_before_decode(self) -> None:
        encoded = base64.b64encode(b"x" * 33).decode("ascii")
        with self.assertRaises(ImageSafetyError) as error:
            decode_raster_data_url(f"data:image/png;base64,{encoded}", max_bytes=32)
        self.assertEqual(413, error.exception.status_code)

    def test_resolves_only_valid_output_rasters(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "ok.png").write_bytes(PNG)
            (root / "history.json").write_text("{}", encoding="utf-8")
            self.assertEqual(root / "ok.png", resolve_output_image(root, "ok.png"))
            with self.assertRaises(ImageSafetyError):
                resolve_output_image(root, "history.json")
            with self.assertRaises(ImageSafetyError):
                resolve_output_image(root, "../secret.png")
```

- [ ] **Step 2: Run the pure tests and verify RED**

Run:

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_security_boundaries.ImageSafetyTests -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'image_safety'`.

- [ ] **Step 3: Implement `image_safety.py`**

Implement these public contracts and constants:

```python
from __future__ import annotations

import base64
import binascii
import re
from pathlib import Path
from typing import Iterable, Iterator

REFERENCE_IMAGE_MAX_BYTES = 25 * 1024 * 1024
REFERENCE_REQUEST_MAX_BYTES = 150 * 1024 * 1024
REMOTE_RESULT_MAX_BYTES = 50 * 1024 * 1024
ALLOWED_RASTER_MIMES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}


class ImageSafetyError(ValueError):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def detect_raster_mime(raw: bytes) -> str:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw.startswith(b"BM"):
        return "image/bmp"
    return ""


def validate_raster_bytes(raw: bytes, *, max_bytes: int, claimed_mime: str = "") -> str:
    if len(raw) > max_bytes:
        raise ImageSafetyError(f"图片超过 {max_bytes // (1024 * 1024)} MiB 限制", 413)
    mime = detect_raster_mime(raw)
    if not mime:
        raise ImageSafetyError("只支持 PNG、JPEG、GIF、WebP 或 BMP 栅格图片")
    return mime


def decode_raster_data_url(source: str, *, max_bytes: int) -> tuple[bytes, str]:
    match = re.fullmatch(r"data:(image/[^;]+);base64,([A-Za-z0-9+/=\r\n]+)", source, re.IGNORECASE)
    if not match:
        raise ImageSafetyError("参考图 data URL 格式无效")
    encoded = re.sub(r"\s+", "", match.group(2))
    if (len(encoded) * 3) // 4 > max_bytes:
        raise ImageSafetyError("参考图超过单图容量限制", 413)
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ImageSafetyError("参考图 Base64 内容无效") from exc
    return raw, validate_raster_bytes(raw, max_bytes=max_bytes, claimed_mime=match.group(1))


def resolve_output_image(outputs_dir: Path, relative_path: str) -> Path:
    root = outputs_dir.resolve()
    candidate = (root / relative_path).resolve()
    if candidate == root or root not in candidate.parents or not candidate.is_file():
        raise ImageSafetyError("图片不存在", 404)
    if candidate.stat().st_size > REMOTE_RESULT_MAX_BYTES:
        raise ImageSafetyError("输出图片超过容量限制", 413)
    with candidate.open("rb") as handle:
        if not detect_raster_mime(handle.read(16)):
            raise ImageSafetyError("输出文件不是受支持的栅格图片")
    return candidate


def read_limited_chunks(chunks: Iterable[bytes], *, max_bytes: int) -> bytes:
    payload = bytearray()
    for chunk in chunks:
        if not chunk:
            continue
        payload.extend(chunk)
        if len(payload) > max_bytes:
            raise ImageSafetyError("远程图片超过容量限制", 413)
    return bytes(payload)
```

- [ ] **Step 4: Run the pure tests and verify GREEN**

Run the Step 2 command. Expected: all `ImageSafetyTests` pass.

- [ ] **Step 5: Write failing FastAPI boundary tests**

Add a `SecurityBoundaryApiTests` fixture that patches the same root constants as `StudioSessionTests`, then add:

```python
def test_production_cors_does_not_echo_arbitrary_localhost_origin(self) -> None:
    response = self.client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:9999",
            "Access-Control-Request-Method": "GET",
        },
    )
    self.assertNotIn("access-control-allow-origin", response.headers)

def test_outputs_serves_raster_but_not_json_svg_or_fake_png(self) -> None:
    self.outputs.mkdir(parents=True, exist_ok=True)
    (self.outputs / "ok.png").write_bytes(PNG_1X1_RAW)
    (self.outputs / "history.json").write_text("{}", encoding="utf-8")
    (self.outputs / "active.svg").write_text("<svg/>", encoding="utf-8")
    (self.outputs / "fake.png").write_text("<html/>", encoding="utf-8")
    ok = self.client.get("/outputs/ok.png")
    self.assertEqual(200, ok.status_code)
    self.assertEqual("nosniff", ok.headers["x-content-type-options"])
    for path in ("history.json", "active.svg", "fake.png"):
        self.assertEqual(404, self.client.get(f"/outputs/{path}").status_code)

def test_session_reference_rejects_remote_url_and_oversized_data_url(self) -> None:
    remote = self.client.put("/api/studio/sessions", json=session_payload("https://example.com/a.png"))
    self.assertEqual(400, remote.status_code)
    oversized = "data:image/png;base64," + ("A" * ((25 * 1024 * 1024 * 4 // 3) + 32))
    response = self.client.put("/api/studio/sessions", json=session_payload(oversized))
    self.assertEqual(413, response.status_code)

def test_upload_rejects_svg_fake_mime_and_total_overflow(self) -> None:
    common = {"api_key": "sk-test", "base_url": "https://example.com/v1", "prompt": "x"}
    svg = self.client.post(
        "/api/generate/gpt-image-2",
        data=common,
        files={"reference_files": ("x.png", b"<svg/>", "image/png")},
    )
    self.assertEqual(400, svg.status_code)
```

Define these fixture helpers in the same test file:

```python
PNG_1X1_RAW = base64.b64decode(PNG_1X1)


def session_payload(reference_src: str) -> dict:
    now = "2026-07-10T10:00:00Z"
    return {
        "active_session_id": "session-1",
        "sessions": [{
            "id": "session-1",
            "title": "安全测试",
            "createdAt": now,
            "updatedAt": now,
            "turns": [{
                "id": "turn-1",
                "engine": "gpt-image-2",
                "mode": "generate",
                "prompt": "test",
                "createdAt": now,
                "status": "success",
                "images": [],
                "referenceSnapshots": [{"id": "ref-1", "name": "a.png", "src": reference_src}],
            }],
        }],
    }
```

- [ ] **Step 6: Run API tests and verify RED**

Run:

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_security_boundaries.SecurityBoundaryApiTests -v
```

Expected: CORS echoes the origin, JSON is publicly served, remote session URL is accepted, or fake upload reaches the upstream mock.

- [ ] **Step 7: Integrate strict uploads, session references and controlled outputs**

In `app.py`:

```python
def dev_cors_origins() -> List[str]:
    return [item.strip().rstrip("/") for item in os.getenv("IMAGE_TOOL_DEV_CORS_ORIGINS", "").split(",") if item.strip()]


def validate_bind_host(host: str) -> str:
    value = str(host or "").strip().lower()
    if value not in {"127.0.0.1", "localhost", "::1", "[::1]"}:
        raise ValueError("当前版本只允许绑定本机回环地址；不支持无认证局域网共享。")
    return host
```

Only add `CORSMiddleware` when `dev_cors_origins()` is non-empty, with `allow_origins=origins` and no regex. Replace the outputs `StaticFiles` mount with:

```python
@app.get("/outputs/{relative_path:path}")
async def output_image(relative_path: str) -> FileResponse:
    try:
        path = resolve_output_image(OUTPUTS_DIR, relative_path)
        mime = detect_raster_mime(path.read_bytes())
    except ImageSafetyError as exc:
        raise HTTPException(status_code=404 if exc.status_code == 404 else 404, detail="图片不存在") from exc
    response = FileResponse(path, media_type=mime)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "private, max-age=3600"
    return response
```

Update `read_upload_assets()` to read at most `REFERENCE_IMAGE_MAX_BYTES + 1`, call `validate_raster_bytes`, accumulate `total_bytes`, and raise HTTP 413 when it exceeds `REFERENCE_REQUEST_MAX_BYTES`. Update `normalize_studio_reference()` so `src` must be a valid local `/outputs` raster or a valid data URL; an `http://` or `https://` value raises HTTP 400 rather than calling `requests.get`.

Use `read_limited_chunks(response.iter_content(64 * 1024), max_bytes=REMOTE_RESULT_MAX_BYTES)` in `download_remote_image()` and the generated-image save path. Require strict magic after download even when upstream sends `Content-Type: image/png`.

Call `validate_bind_host(args.host)` before `uvicorn.run()`.

- [ ] **Step 8: Run security tests and existing backend regression suite**

Run:

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_security_boundaries tests.test_studio_sessions tests.test_release_cache_busting -v
python -m py_compile .\app.py .\image_safety.py
```

Expected: all tests pass and compilation exits 0.

- [ ] **Step 9: Commit phase one**

```powershell
git add app.py image_safety.py tests/test_security_boundaries.py
git commit -m "Harden local API and image boundaries"
```

---

### Task 2: Make browser persistence and visible behavior truthful

**Files:**
- Create: `studio-web/src/clientSafety.ts`
- Create: `studio-web/src/clientSafety.test.mjs`
- Create: `studio-web/src/chatCapabilities.ts`
- Create: `studio-web/src/chatCapabilities.test.mjs`
- Create: `tests/test_classic_frontend_security.py`
- Modify: `studio-web/src/App.tsx`
- Modify: `studio-web/src/i18n.ts`
- Modify: `studio-web/src/uiPolish.test.mjs`
- Modify: `static/index.html`
- Modify: `static/app.js`
- Modify: `app.py`
- Test: frontend Node tests and `tests/test_classic_frontend_security.py`

- [ ] **Step 1: Write failing localStorage sanitization tests**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeForBrowserStorage, sanitizeStoredJson } from "./clientSafety.js";

test("browser persistence recursively removes API keys", () => {
  const value = {
    api_key: "root-secret",
    profiles: [{ form: { api_key: "profile-secret", model: "gpt-image-2" } }],
    keep: "yes",
  };
  assert.deepEqual(sanitizeForBrowserStorage(value), {
    profiles: [{ form: { model: "gpt-image-2" } }],
    keep: "yes",
  });
});

test("legacy stored JSON is returned without API keys", () => {
  assert.deepEqual(
    sanitizeStoredJson('{"api_key":"old","model":"gpt-image-2"}', {}),
    { model: "gpt-image-2" },
  );
});
```

- [ ] **Step 2: Run and verify RED**

Run from `studio-web`:

```powershell
node --test .\src\clientSafety.test.mjs
```

Expected: FAIL because `clientSafety.js` does not exist.

- [ ] **Step 3: Implement browser sanitization and wire Studio persistence**

```typescript
export function sanitizeForBrowserStorage<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForBrowserStorage(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key.toLowerCase() !== "api_key")
        .map(([key, item]) => [key, sanitizeForBrowserStorage(item)]),
    ) as T;
  }
  return value;
}

export function sanitizeStoredJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return sanitizeForBrowserStorage(JSON.parse(raw)) as T;
  } catch {
    return fallback;
  }
}
```

In `App.tsx`, initialize GPT/Banana forms through `sanitizeStoredJson`, immediately rewrite legacy values without keys, and persist `sanitizeForBrowserStorage(gptForm)` / `sanitizeForBrowserStorage(bananaForm)`. Do not sanitize `buildConfigPayload()` sent to `/api/config/local-file`; that file remains the deliberate local secret store.

- [ ] **Step 4: Write and implement Classic persistence tests**

Create source-level tests:

```python
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ClassicFrontendSecurityTests(unittest.TestCase):
    def test_classic_local_storage_sanitizes_api_keys(self) -> None:
        source = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
        self.assertIn("function sanitizeBrowserConfig", source)
        self.assertIn("sanitizeBrowserConfig(collectFormState(form))", source)
        self.assertIn("sanitizeBrowserConfig(profiles)", source)

    def test_classic_hides_unsupported_edit_controls(self) -> None:
        html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn('name="edit_mode"', html)
        self.assertNotIn('name="reference_strength"', html)
```

Implement in `static/app.js`:

```javascript
function sanitizeBrowserConfig(value) {
  if (Array.isArray(value)) return value.map(sanitizeBrowserConfig);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => String(key).toLowerCase() !== "api_key")
        .map(([key, item]) => [key, sanitizeBrowserConfig(item)])
    );
  }
  return value;
}
```

Use it in `saveFormState`, `restoreFormState` migration and `writeConfigProfiles`. Remove the `edit_mode` and `reference_strength` fields from `static/index.html`.

- [ ] **Step 5: Write failing chat truthfulness tests**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { referencesForSubmitMode, referenceUiState } from "./chatCapabilities.js";

test("chat never snapshots or sends composer references", () => {
  const refs = [{ name: "a.png" }];
  assert.deepEqual(referencesForSubmitMode("chat", refs), []);
  assert.deepEqual(referencesForSubmitMode("generate", refs), refs);
});

test("chat keeps existing references but disables adding more", () => {
  assert.deepEqual(referenceUiState("chat", 2), {
    canAdd: false,
    noticeKey: "reference.chatNotSent",
  });
});
```

Run:

```powershell
node --test .\src\chatCapabilities.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement chat capability helpers and Studio behavior**

```typescript
export type SubmitMode = "generate" | "chat";

export function referencesForSubmitMode<T>(mode: SubmitMode, references: T[]): T[] {
  return mode === "chat" ? [] : references;
}

export function referenceUiState(mode: SubmitMode, count: number) {
  return {
    canAdd: mode !== "chat",
    noticeKey: mode === "chat" && count > 0 ? "reference.chatNotSent" : "",
  };
}
```

In `App.tsx`:

- Calculate reference snapshots only after the chat branch or pass `[]` for chat.
- Store `reference_count: 0` and omit `referenceSnapshots` on chat turns.
- Disable the add-reference button and drag/drop intake while `submitMode === "chat"`.
- Keep current composer files visible and show `reference.chatNotSent`.
- Replace `status.chatRepliedWithRefs` with the ordinary chat success message.
- Remove `edit` and `strength` from `composerPopover`, remove both rendered controls, and keep legacy form fields only in normalization/history compatibility.

Add Chinese and English i18n strings:

```typescript
"reference.chatNotSent": "聊天暂不发送参考图；这些图片会保留，切回生图后仍可使用。",
"submit.chatTooltip": "调用聊天接口，仅发送文字上下文；当前不发送参考图。",
"config.generationDiagnosticBilling": "生图诊断会发起一次最小真实请求，上游可能计费。",
```

- [ ] **Step 7: Write failing Banana contract test**

In `tests/test_upstream_jobs.py`:

```python
def test_banana_generation_diagnostic_uses_generation_headers_and_named_payload(self) -> None:
    captured = {}

    class Response:
        ok = True
        status_code = 200
        content = b'{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"' + PNG_1X1.encode() + b'"}}]}}]}'
        text = ""

        def json(self):
            return json.loads(self.content.decode("utf-8"))

    class Session:
        def post(self, url, **kwargs):
            captured.update(url=url, **kwargs)
            return Response()

    with patch.object(webapp, "create_requests_session", return_value=Session()):
        response = self.client.post("/api/diagnostics", json={
            "engine": "banana",
            "checks": ["generation"],
            "api_key": "banana-secret",
            "api_base_url": "https://example.com",
            "model_type": "gemini-image",
        })
    self.assertEqual(200, response.status_code)
    self.assertEqual("banana-secret", captured["headers"]["x-goog-api-key"])
    self.assertEqual("Bearer banana-secret", captured["headers"]["Authorization"])
    self.assertEqual("IMAGE", captured["json"]["generationConfig"]["responseModalities"][0])
```

- [ ] **Step 8: Reuse one Banana request contract**

Add this helper to `app.py` in Task 2; Task 3 moves it unchanged into `upstream.py` and updates the import:

```python
def banana_headers(api_key: str) -> Dict[str, str]:
    key = api_key.strip()
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "X-API-Key": key,
        "x-goog-api-key": key,
        "X-Banana-Client": "image-generate-web-tool",
    }
```

Call `build_banana_request()` with named arguments in diagnostics and reuse `banana_headers()` in diagnostic, chat and generation requests. Add the diagnostic billing warning to the config drawer before the test button.

- [ ] **Step 9: Run phase-two tests**

```powershell
Push-Location .\studio-web
node --test .\src\clientSafety.test.mjs .\src\chatCapabilities.test.mjs .\src\uiPolish.test.mjs .\src\i18n.test.mjs
npm run build
Pop-Location
$env:PYTHONUTF8='1'
python -m unittest tests.test_classic_frontend_security tests.test_upstream_jobs -v
```

Expected: all targeted tests and the Vite build pass.

- [ ] **Step 10: Commit phase two**

```powershell
git add app.py static/index.html static/app.js studio-web/src/App.tsx studio-web/src/i18n.ts studio-web/src/uiPolish.test.mjs studio-web/src/clientSafety.ts studio-web/src/clientSafety.test.mjs studio-web/src/chatCapabilities.ts studio-web/src/chatCapabilities.test.mjs tests/test_classic_frontend_security.py tests/test_upstream_jobs.py static/studio
git commit -m "Make chat and diagnostics behavior truthful"
```

---

### Task 3: Add bounded upstream execution, cancellable jobs and atomic persistence

**Files:**
- Create: `upstream.py`
- Create: `storage.py`
- Create: `studio-web/src/jobProtocol.ts`
- Create: `studio-web/src/jobProtocol.test.mjs`
- Create: `studio-web/src/sessionRevision.ts`
- Create: `studio-web/src/sessionRevision.test.mjs`
- Create: `tests/test_storage_concurrency.py`
- Modify: `tests/test_upstream_jobs.py`
- Modify: `app.py`
- Modify: `studio-web/src/App.tsx`
- Modify: `studio-web/src/i18n.ts`
- Test: `tests/test_upstream_jobs.py`, `tests/test_storage_concurrency.py`, frontend protocol tests

- [ ] **Step 1: Write failing upstream executor and job registry tests**

```python
import asyncio
import time
import unittest

from upstream import JobCancelled, JobRegistry, UpstreamExecutor


class UpstreamUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_blocking_call_does_not_block_event_loop(self) -> None:
        executor = UpstreamExecutor(generation_limit=1, chat_limit=1, download_limit=1)
        started = time.monotonic()
        task = asyncio.create_task(executor.run("chat", time.sleep, 0.2))
        await asyncio.sleep(0.02)
        self.assertLess(time.monotonic() - started, 0.1)
        await task

    async def test_canceled_job_is_detected_before_and_after_upstream(self) -> None:
        registry = JobRegistry(ttl_seconds=60)
        registry.register("job-1")
        registry.cancel("job-1")
        with self.assertRaises(JobCancelled):
            registry.raise_if_canceled("job-1")
```

Run:

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_upstream_jobs.UpstreamUnitTests -v
```

Expected: FAIL because `upstream.py` does not exist.

- [ ] **Step 2: Implement `upstream.py`**

```python
from __future__ import annotations

import asyncio
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Literal, TypeVar

T = TypeVar("T")
RequestKind = Literal["generation", "chat", "download"]


class JobCancelled(RuntimeError):
    pass


@dataclass
class JobState:
    canceled: bool
    touched_at: float


class JobRegistry:
    def __init__(self, ttl_seconds: int = 3600) -> None:
        self.ttl_seconds = ttl_seconds
        self._items: Dict[str, JobState] = {}
        self._lock = threading.RLock()

    def _prune(self) -> None:
        cutoff = time.monotonic() - self.ttl_seconds
        for key in [key for key, state in self._items.items() if state.touched_at < cutoff]:
            self._items.pop(key, None)

    def register(self, job_id: str) -> None:
        with self._lock:
            self._prune()
            self._items[job_id] = JobState(False, time.monotonic())

    def cancel(self, job_id: str) -> bool:
        with self._lock:
            self._prune()
            state = self._items.setdefault(job_id, JobState(False, time.monotonic()))
            state.canceled = True
            state.touched_at = time.monotonic()
            return True

    def raise_if_canceled(self, job_id: str) -> None:
        if not job_id:
            return
        with self._lock:
            state = self._items.get(job_id)
            if state and state.canceled:
                raise JobCancelled("任务已取消")

    def forget(self, job_id: str) -> None:
        with self._lock:
            self._items.pop(job_id, None)


class UpstreamExecutor:
    def __init__(self, generation_limit: int = 2, chat_limit: int = 4, download_limit: int = 4) -> None:
        self._limits = {
            "generation": asyncio.Semaphore(generation_limit),
            "chat": asyncio.Semaphore(chat_limit),
            "download": asyncio.Semaphore(download_limit),
        }

    async def run(self, kind: RequestKind, function: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        async with self._limits[kind]:
            return await asyncio.to_thread(function, *args, **kwargs)
```

Also move `banana_headers()` and add `gpt_headers()` here so all supplier calls use one header contract.

- [ ] **Step 3: Write failing API non-blocking and cancellation tests**

```python
def test_slow_chat_does_not_block_health(self) -> None:
    entered = threading.Event()
    release = threading.Event()

    def slow_post(*args, **kwargs):
        entered.set()
        release.wait(2)
        return GoodChatResponse()

    with patch.object(webapp.requests, "post", side_effect=slow_post):
        with ThreadPoolExecutor(max_workers=2) as pool:
            chat_future = pool.submit(self.client.post, "/api/chat/gpt-image-2", json=GPT_CHAT_PAYLOAD)
            self.assertTrue(entered.wait(1))
            started = time.monotonic()
            health = self.client.get("/api/health")
            self.assertLess(time.monotonic() - started, 0.25)
            release.set()
            self.assertEqual(200, chat_future.result().status_code)
    self.assertEqual(200, health.status_code)

def test_cancel_after_upstream_started_does_not_save_image_or_history(self) -> None:
    entered = threading.Event()
    release = threading.Event()

    def slow_post(*args, **kwargs):
        entered.set()
        release.wait(2)
        return GoodImageResponse()

    with patch.object(webapp.requests, "post", side_effect=slow_post):
        with ThreadPoolExecutor(max_workers=2) as pool:
            future = pool.submit(post_gpt_generation, self.client, "job-cancel")
            self.assertTrue(entered.wait(1))
            cancel = self.client.post("/api/jobs/job-cancel/cancel")
            release.set()
            response = future.result()
    self.assertEqual(200, cancel.status_code)
    self.assertTrue(response.json()["canceled"])
    self.assertFalse((self.outputs / "history.json").exists())
    self.assertEqual([], list(self.outputs.glob("*.png")))
```

Define the helpers used by those API tests in `tests/test_upstream_jobs.py`:

```python
GPT_CHAT_PAYLOAD = {
    "prompt": "hello",
    "api_key": "sk-test",
    "base_url": "https://example.com/v1",
    "chat_model": "gpt-5.5",
    "job_id": "job-chat",
}


class GoodChatResponse:
    ok = True
    status_code = 200
    content = b'{"choices":[{"message":{"content":"ok"}}]}'
    text = content.decode("utf-8")

    def json(self):
        return json.loads(self.text)


class GoodImageResponse:
    ok = True
    status_code = 200
    content = json.dumps({"data": [{"b64_json": PNG_1X1}]}).encode("utf-8")
    text = content.decode("utf-8")

    def json(self):
        return json.loads(self.text)


def post_gpt_generation(client: TestClient, job_id: str):
    return client.post(
        "/api/generate/gpt-image-2",
        data={
            "api_key": "sk-test",
            "base_url": "https://example.com/v1",
            "model": "gpt-image-2",
            "prompt": "test",
            "job_id": job_id,
        },
    )
```

- [ ] **Step 4: Make every upstream call asynchronous and bounded**

Create module-level `UPSTREAM_EXECUTOR` and `JOB_REGISTRY`. Convert diagnostics to async functions and `await UPSTREAM_EXECUTOR.run(...)` for GPT/Banana diagnostic calls. Convert GPT/Banana chat and Banana generation requests the same way. Keep the existing GPT generation `to_thread` behavior but route it through `UPSTREAM_EXECUTOR.run("generation", ...)`. Run generated-image URL downloads through the download semaphore.

Clamp timeouts instead of `None`:

```python
MAX_CHAT_TIMEOUT = 600
MAX_GENERATION_TIMEOUT = 1800


def bounded_timeout(value: int, *, default: int, maximum: int) -> int:
    parsed = int(value or default)
    return max(10, min(parsed if parsed > 0 else maximum, maximum))
```

Replace the global exception response with a stable message that does not expose exception class, absolute path or raw upstream text:

```python
return JSONResponse(status_code=500, content={"detail": "后端内部错误，请重试。", "error_code": "E_INTERNAL"})
```

- [ ] **Step 5: Add backend job protocol**

Add `job_id` to both generation forms and chat JSON payloads. Register at endpoint start, check before upstream, between retries/batches, before saving images, and before appending history. Always `forget()` in `finally`.

```python
@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> Dict[str, Any]:
    normalized = re.sub(r"[^a-zA-Z0-9._:-]+", "-", job_id).strip("-")[:160]
    if not normalized:
        raise HTTPException(status_code=400, detail="job_id 无效")
    JOB_REGISTRY.cancel(normalized)
    return {
        "ok": True,
        "job_id": normalized,
        "canceled": True,
        "warning": "任务已在本地取消；如果上游已经接单，仍可能继续执行或计费。",
    }
```

Catch `JobCancelled` and return `{"ok": False, "canceled": True, "images": [], "history_entry": None}` with HTTP 200.

- [ ] **Step 6: Write and implement frontend job protocol tests**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { appendJobId, cancelJobUrl, cancellationNotice } from "./jobProtocol.js";

test("generation and chat requests carry the same job id", () => {
  const form = new FormData();
  appendJobId(form, "job-123");
  assert.equal(form.get("job_id"), "job-123");
  assert.equal(cancelJobUrl("job-123"), "/api/jobs/job-123/cancel");
  assert.match(cancellationNotice("zh-CN"), /仍可能.*计费/);
});
```

Implement:

```typescript
export function appendJobId(form: FormData, jobId: string) {
  form.set("job_id", jobId);
  return form;
}

export function cancelJobUrl(jobId: string) {
  return `/api/jobs/${encodeURIComponent(jobId)}/cancel`;
}

export function cancellationNotice(language: "zh-CN" | "en") {
  return language === "en"
    ? "Canceled locally. If the provider already accepted the request, it may still run or be billed."
    : "已在本地取消；如果上游已经接单，仍可能继续执行或计费。";
}
```

In `App.tsx`, call the cancel endpoint before aborting the local fetch, append queue `jobId` to `FormData`, include a generated `job_id` in chat JSON, and treat backend `canceled: true` as canceled rather than generic error.

- [ ] **Step 7: Write failing atomic storage tests**

```python
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from storage import atomic_write_json, mutate_json, read_json


class StorageUnitTests(unittest.TestCase):
    def test_concurrent_mutations_do_not_lose_entries(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "history.json"

            def add(index: int) -> None:
                mutate_json(
                    path,
                    lambda: {"version": 1, "entries": []},
                    lambda payload: {**payload, "entries": [{"id": index}, *payload["entries"]]},
                )

            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(add, range(40)))
            payload = read_json(path, lambda: {"entries": []})
            self.assertEqual(40, len(payload["entries"]))

    def test_backup_and_uuid_temp_are_used(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "config.local.json"
            atomic_write_json(path, {"version": 1}, backup=True)
            atomic_write_json(path, {"version": 2}, backup=True)
            self.assertEqual(1, json.loads(path.with_suffix(".json.bak").read_text(encoding="utf-8"))["version"])
            self.assertEqual([], list(path.parent.glob("*.tmp")))
```

- [ ] **Step 8: Implement `storage.py`**

```python
from __future__ import annotations

import json
import os
import shutil
import threading
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, TypeVar

T = TypeVar("T")
_LOCKS: Dict[str, threading.RLock] = {}
_LOCKS_GUARD = threading.RLock()


def path_lock(path: Path) -> threading.RLock:
    key = os.path.normcase(str(path.resolve()))
    with _LOCKS_GUARD:
        return _LOCKS.setdefault(key, threading.RLock())


def _read_unlocked(path: Path, default_factory: Callable[[], T]) -> T:
    if not path.exists():
        return default_factory()
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, TypeError):
        return default_factory()


def read_json(path: Path, default_factory: Callable[[], T]) -> T:
    with path_lock(path):
        return _read_unlocked(path, default_factory)


def _write_unlocked(path: Path, payload: Any, *, backup: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if backup and path.exists():
        shutil.copy2(path, path.with_suffix(path.suffix + ".bak"))
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temp.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        try:
            temp.unlink()
        except FileNotFoundError:
            pass


def atomic_write_json(path: Path, payload: Any, *, backup: bool = False) -> None:
    with path_lock(path):
        _write_unlocked(path, payload, backup=backup)


def mutate_json(
    path: Path,
    default_factory: Callable[[], T],
    mutator: Callable[[T], T],
    *,
    backup: bool = False,
) -> T:
    with path_lock(path):
        next_value = mutator(_read_unlocked(path, default_factory))
        _write_unlocked(path, next_value, backup=backup)
        return next_value
```

- [ ] **Step 9: Refactor config/history/session mutations under one lock**

Use `atomic_write_json(..., backup=True)` for `config.local.json`. Rewrite history append/update/delete with `mutate_json()` so read-modify-write happens under one lock. Delete output files only after the new history JSON commits; if file deletion fails, keep the committed history deletion and return only successfully deleted paths.

For sessions, default legacy revision to 1. Add `expected_revision` and return 409 on mismatch:

```python
class SessionRevisionConflict(RuntimeError):
    def __init__(self, current: Dict[str, Any]) -> None:
        super().__init__("session revision conflict")
        self.current = current


def write_studio_session_state(payload: Dict[str, Any]) -> Dict[str, Any]:
    expected = payload.get("expected_revision")

    def update(current: Dict[str, Any]) -> Dict[str, Any]:
        current_revision = max(1, int(current.get("revision") or 1))
        if expected is not None and int(expected) != current_revision:
            raise SessionRevisionConflict({**current, "revision": current_revision})
        normalized = normalize_studio_session_state(payload)
        normalized["revision"] = current_revision + 1
        validate_session_reference_capacity(normalized["sessions"])
        return normalized

    state = mutate_json(STUDIO_SESSIONS_FILE, empty_session_state, update)
    prune_session_reference_files(state["sessions"])
    return state
```

Referenced files over count/byte capacity must raise HTTP 413; never delete a still-referenced file to make room. Run pruning only after JSON commit.

- [ ] **Step 10: Write and implement frontend revision merge tests**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionSavePayload, mergeSessionsByUpdatedAt } from "./sessionRevision.js";

test("session payload includes expected revision", () => {
  assert.deepEqual(buildSessionSavePayload(7, "s1", [{ id: "s1" }]), {
    expected_revision: 7,
    active_session_id: "s1",
    sessions: [{ id: "s1" }],
  });
});

test("revision conflict keeps the newest version of each session", () => {
  const local = [{ id: "a", updatedAt: "2026-07-10T10:00:00Z", value: "local" }];
  const server = [
    { id: "a", updatedAt: "2026-07-10T09:00:00Z", value: "server-old" },
    { id: "b", updatedAt: "2026-07-10T11:00:00Z", value: "server" },
  ];
  assert.deepEqual(mergeSessionsByUpdatedAt(local, server).map((item) => item.value), ["server", "local"]);
});
```

Implement exact helpers and keep `sessionRevisionRef`. On a 409 response, read `payload.current`, merge once by `updatedAt`, set the server revision, and issue one retry with that revision. A second 409 shows the refresh warning and stops; it must not loop.

- [ ] **Step 11: Run phase-three tests**

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_upstream_jobs tests.test_storage_concurrency tests.test_studio_sessions -v
python -m py_compile .\app.py .\storage.py .\upstream.py .\image_safety.py
Push-Location .\studio-web
node --test .\src\jobProtocol.test.mjs .\src\sessionRevision.test.mjs .\src\queueSessionBoundaries.test.mjs .\src\generationQueue.test.mjs .\src\uiPolish.test.mjs
npm run build
Pop-Location
```

Expected: all tests pass, TypeScript/Vite build exits 0, and no concurrency temp-file errors appear.

- [ ] **Step 12: Commit phase three**

```powershell
git add app.py storage.py upstream.py tests/test_upstream_jobs.py tests/test_storage_concurrency.py tests/test_studio_sessions.py studio-web/src/App.tsx studio-web/src/i18n.ts studio-web/src/jobProtocol.ts studio-web/src/jobProtocol.test.mjs studio-web/src/sessionRevision.ts studio-web/src/sessionRevision.test.mjs studio-web/src/uiPolish.test.mjs static/studio
git commit -m "Add cancellable jobs and atomic persistence"
```

---

### Task 4: Harden Windows packaging, runtime reuse and release order

**Files:**
- Modify: `start_web.ps1`
- Modify: `package_web_tool.ps1`
- Modify: `release_one_click.ps1`
- Modify: `release_preflight.ps1`
- Create: `release_package_smoke.ps1`
- Modify: `tests/test_release_cache_busting.py`
- Test: `tests/test_release_cache_busting.py`

- [ ] **Step 1: Write failing Windows hardening tests**

Add:

```python
def test_release_powershell_files_use_utf8_bom(self) -> None:
    for name in [
        "start_web.ps1",
        "package_web_tool.ps1",
        "release_one_click.ps1",
        "release_preflight.ps1",
        "release_package_smoke.ps1",
        "sync_release_to_g.ps1",
    ]:
        self.assertTrue((ROOT / name).read_bytes().startswith(b"\xef\xbb\xbf"), name)

def test_start_script_keeps_vendor_zip_and_uses_runtime_fingerprint(self) -> None:
    script = (ROOT / "start_web.ps1").read_text(encoding="utf-8-sig")
    self.assertIn("function Get-RuntimeFingerprint", script)
    self.assertIn("runtime.fingerprint", script)
    self.assertNotRegex(script, r"Remove-Item\s+-LiteralPath\s+\$PortablePythonZip")
    self.assertIn("instance_id", script)

def test_package_uses_explicit_release_whitelist(self) -> None:
    script = (ROOT / "package_web_tool.ps1").read_text(encoding="utf-8-sig")
    self.assertIn("$ReleaseFiles", script)
    self.assertIn("$ReleaseTrees", script)
    self.assertNotIn("Get-ChildItem -LiteralPath $ScriptDir -Recurse -Force -File", script)

def test_local_smoke_and_preflight_run_before_sync(self) -> None:
    script = (ROOT / "release_one_click.ps1").read_text(encoding="utf-8-sig")
    self.assertLess(script.index("Package smoke"), script.index("Sync clean package"))
    self.assertLess(script.index("Local release preflight"), script.index("Sync clean package"))
    self.assertLess(script.index("Sync clean package"), script.index("Destination verification"))
```

- [ ] **Step 2: Run and verify RED**

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_release_cache_busting -v
```

Expected: BOM, fingerprint, whitelist and release-order tests fail.

- [ ] **Step 3: Add instance ID and runtime fingerprint**

In `app.py`:

```python
import hashlib


def compute_instance_id(root: Path = ROOT_DIR) -> str:
    normalized = str(root.resolve()).replace("/", "\\").rstrip("\\").casefold()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:20]
```

Return `instance_id` from `/api/health`.

In `start_web.ps1`, calculate the same SHA-256 from normalized lowercase project root and require it in `Test-BackendVersion`. Add:

```powershell
function Get-RuntimeFingerprint {
  $Sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $Rows = @()
    $Rows += "python=" + (Get-FileHash -LiteralPath $PortablePythonZip -Algorithm SHA256).Hash.ToLowerInvariant()
    $Rows += "requirements=" + (Get-FileHash -LiteralPath $RequirementsPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Get-ChildItem -LiteralPath $WheelDir -Filter "*.whl" -File | Sort-Object Name | ForEach-Object {
      $Rows += $_.Name + "=" + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $Bytes = [System.Text.Encoding]::UTF8.GetBytes(($Rows -join "`n"))
    return ([BitConverter]::ToString($Sha.ComputeHash($Bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $Sha.Dispose()
  }
}
```

Store the value in `.runtime/runtime.fingerprint` only after dependency verification succeeds. Rebuild `.runtime` when missing or different. If `Expand-Archive` fails, remove only `.runtime`, keep the vendor ZIP and throw a clear extraction error.

Add `-PrepareOnly` and `-NoBrowser` switches. `-PrepareOnly` exits after runtime dependency verification and fingerprint write.

- [ ] **Step 4: Replace blacklist packaging with an allowlist**

Use:

```powershell
$ReleaseFiles = @(
  "app.py",
  "image_safety.py",
  "storage.py",
  "upstream.py",
  "requirements.txt",
  "VERSION",
  "config.example.json",
  "start_web.ps1",
  "start_web.bat",
  "stop_web.ps1",
  "stop_web.bat",
  "一键启动.bat",
  "一键停止.bat"
)
$ReleaseTrees = @("static", "vendor")
```

For each listed file/tree, fail if missing and copy only that source into `$TempAppDir`. Keep `Write-PackageReadme()` and final ZIP manifest validation. Do not enumerate the repository and filter unknown files.

- [ ] **Step 5: Add extracted-package smoke test**

`release_package_smoke.ps1` accepts `-ZipPath`, extracts into a GUID temp directory, runs packaged `start_web.ps1 -PrepareOnly -NoBrowser`, chooses a free local port, starts packaged `app.py`, polls `/api/health`, verifies `version` and `instance_id`, then stops only the started PID and removes the temp directory.

Core launch:

```powershell
$Process = Start-Process -FilePath $RuntimePython -ArgumentList @($AppPath, "--host", "127.0.0.1", "--port", "$Port") -WorkingDirectory $AppDir -WindowStyle Hidden -PassThru
try {
  $Health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2
  $Payload = $Health.Content | ConvertFrom-Json
  if ($Payload.version -ne $Version -or [string]::IsNullOrWhiteSpace($Payload.instance_id)) {
    throw "Extracted package health metadata did not match."
  }
} finally {
  if ($Process -and -not $Process.HasExited) { Stop-Process -Id $Process.Id -Force }
}
```

- [ ] **Step 6: Reorder release gates**

Add `-LocalOnly` to `release_preflight.ps1`. Local mode checks version, Studio assets, local ZIP cleanliness/hash and exits before resolving G:. Full mode also checks the destination.

`release_one_click.ps1` order must be:

1. Frontend tests.
2. Frontend build.
3. Backend checks.
4. Package clean ZIP.
5. Package smoke.
6. Local release preflight with `-LocalOnly`.
7. Sync clean package.
8. Destination verification using full preflight.

- [ ] **Step 7: Encode PowerShell release scripts as UTF-8 BOM and parse with PowerShell 5.1**

After content edits, mechanically rewrite the six release/start/sync scripts with UTF-8 BOM. Verify parsing without executing release mutations:

```powershell
$files = @('start_web.ps1','package_web_tool.ps1','release_one_click.ps1','release_preflight.ps1','release_package_smoke.ps1','sync_release_to_g.ps1')
foreach($file in $files) {
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $file), [ref]$null, [ref]$errors)
  if($errors.Count -gt 0) { throw "$file parse failed: $($errors[0].Message)" }
}
```

- [ ] **Step 8: Run Windows phase verification**

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_release_cache_busting -v
python -m py_compile .\app.py .\image_safety.py .\storage.py .\upstream.py
powershell -NoProfile -ExecutionPolicy Bypass -File .\package_web_tool.ps1 -OutputPath (Join-Path $env:TEMP 'NM_web_imagen-v1.0.6-plan-check.zip')
powershell -NoProfile -ExecutionPolicy Bypass -File .\release_package_smoke.ps1 -ZipPath (Join-Path $env:TEMP 'NM_web_imagen-v1.0.6-plan-check.zip')
Remove-Item -LiteralPath (Join-Path $env:TEMP 'NM_web_imagen-v1.0.6-plan-check.zip') -Force
```

Expected: tests, compile, package and extracted-package smoke all exit 0.

- [ ] **Step 9: Commit phase four**

```powershell
git add app.py start_web.ps1 package_web_tool.ps1 release_one_click.ps1 release_preflight.ps1 release_package_smoke.ps1 sync_release_to_g.ps1 tests/test_release_cache_busting.py
git commit -m "Harden Windows packaging and runtime reuse"
```

---

### Task 5: Build and verify the v1.0.6 release candidate

**Files:**
- Modify: `VERSION`
- Modify: `PROJECT_STATUS.md`
- Modify: `NEXT_ACTIONS.md`
- Modify: `DECISIONS.md`
- Modify: generated `static/studio/index.html`
- Modify: generated `static/studio/assets/*`
- Test: complete backend/frontend/release matrix

- [ ] **Step 1: Bump version and add release-cache RED test**

Change `VERSION` to:

```text
1.0.6
```

Update the existing version assertion so the local release candidate must report `1.0.6`. Run it before rebuilding and confirm the stale built asset/package check fails.

- [ ] **Step 2: Run complete local test matrix**

```powershell
$env:PYTHONUTF8='1'
python -m unittest tests.test_security_boundaries tests.test_classic_frontend_security tests.test_upstream_jobs tests.test_storage_concurrency tests.test_studio_sessions tests.test_release_cache_busting -v
python -m py_compile .\app.py .\image_safety.py .\storage.py .\upstream.py
Push-Location .\studio-web
node --test .\src\configProfiles.test.mjs .\src\configProfileSelection.test.mjs .\src\generationQueue.test.mjs .\src\queuePersistence.test.mjs .\src\queueSessionBoundaries.test.mjs .\src\sessionDrafts.test.mjs .\src\submissionPayload.test.mjs .\src\uiPolish.test.mjs .\src\gptSizeSelection.test.mjs .\src\i18n.test.mjs .\src\clientSafety.test.mjs .\src\chatCapabilities.test.mjs .\src\jobProtocol.test.mjs .\src\sessionRevision.test.mjs
npm run test:size
npm run build
Pop-Location
```

Expected: zero failures, TypeScript/Vite build exits 0, and built Studio assets are updated.

- [ ] **Step 3: Run local release gates before any G drive write**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\package_web_tool.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\release_package_smoke.ps1 -ZipPath ..\NM_web_imagen-v1.0.6.zip
powershell -NoProfile -ExecutionPolicy Bypass -File .\release_preflight.ps1 -ExpectedVersion 1.0.6 -LocalOnly
```

Expected: ZIP creation, clean-manifest validation, fresh portable-runtime smoke and local preflight pass.

- [ ] **Step 4: Run local browser smoke**

Start on an unused temporary port, then verify:

- `/api/health` returns `version=1.0.6` and non-empty `instance_id`.
- `/outputs/history.json` and an SVG return 404 while a valid PNG returns 200 with `nosniff`.
- Studio loads without a white screen.
- Chat mode disables new reference uploads and shows the “暂不发送参考图” notice.
- GPT advanced controls do not show edit mode or reference strength.
- `/classic` loads and does not render those two fields.

- [ ] **Step 5: Sync only after local gates pass, then verify destination**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync_release_to_g.ps1 -SkipPackage
powershell -NoProfile -ExecutionPolicy Bypass -File .\release_preflight.ps1 -ExpectedVersion 1.0.6
```

Expected: clean package folder and versioned ZIP are synchronized to the allowed G: target, hashes match, and internal ledger/local runtime files are absent.

- [ ] **Step 6: Update ledger with fresh evidence**

Record exact test counts, current asset names, package SHA256, local smoke port, G: target and remaining limitations:

- Cancel cannot guarantee provider-side stop or refund after upstream acceptance.
- Chat remains text-only.
- Session concurrency remains file-based with one automatic merge retry.

Set `PROJECT_STATUS.md` to release-candidate verified, make `NEXT_ACTIONS.md` start with the merge/review decision, and keep these decisions active in `DECISIONS.md`.

- [ ] **Step 7: Run final verification and commit**

```powershell
python "C:\Users\mumengfei\.cc-switch\skills\project-ledger-loop\scripts\check_ledger.py" (Get-Location).Path
git diff --check
git status --short --branch
git diff --stat HEAD~1
```

After confirming the evidence and intended files:

```powershell
git add VERSION static/studio PROJECT_STATUS.md NEXT_ACTIONS.md DECISIONS.md
git commit -m "Build and verify v1.0.6 release candidate"
```

---

## Requirements coverage map

| P1 requirement | Plan task |
|---|---|
| Key/CORS/outputs metadata exposure | Task 1 CORS/outputs; Task 2 browser persistence |
| SSRF, fake image, SVG and capacity | Task 1 |
| Chat references falsely claimed | Task 2 |
| Ineffective edit mode/reference strength | Task 2 |
| Banana diagnostic contract | Task 2 |
| Blocking synchronous requests | Task 3 upstream executor |
| AbortController does not stop backend save | Task 3 job registry/protocol |
| Concurrent JSON loss and fixed temp collision | Task 3 storage/revision |
| PowerShell encoding, package/runtime/instance/release order | Task 4 |
| Version, build, package and G: clean sync | Task 5 |
