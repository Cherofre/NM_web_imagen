import asyncio
import base64
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from urllib.parse import quote
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from starlette.datastructures import FormData
from starlette.requests import Request as StarletteRequest

import app as webapp
import image_safety as image_safety_module
from image_safety import (
    ALLOWED_RASTER_MIMES,
    REFERENCE_IMAGE_MAX_BYTES,
    REFERENCE_REQUEST_MAX_BYTES,
    REMOTE_RESULT_MAX_BYTES,
    ImageSafetyError,
    decode_raster_data_url,
    read_limited_chunks,
    resolve_output_image,
    validate_raster_bytes,
)


RASTER_SAMPLES = {
    "image/png": b"\x89PNG\r\n\x1a\n" + b"x" * 32,
    "image/jpeg": b"\xff\xd8\xff\xe0" + b"x" * 32,
    "image/gif": b"GIF89a" + b"x" * 32,
    "image/webp": b"RIFF\x18\x00\x00\x00WEBP" + b"x" * 24,
    "image/bmp": b"BM" + b"x" * 32,
}
PNG_RAW = RASTER_SAMPLES["image/png"]
PNG_BASE64 = base64.b64encode(PNG_RAW).decode("ascii")
WEBP_RAW = RASTER_SAMPLES["image/webp"]
WEBP_BASE64 = base64.b64encode(WEBP_RAW).decode("ascii")


def session_payload(reference_src: str) -> dict:
    now = "2026-07-10T10:00:00Z"
    return {
        "active_session_id": "session-1",
        "sessions": [
            {
                "id": "session-1",
                "title": "安全测试",
                "createdAt": now,
                "updatedAt": now,
                "turns": [
                    {
                        "id": "turn-1",
                        "engine": "gpt-image-2",
                        "mode": "generate",
                        "prompt": "test",
                        "createdAt": now,
                        "status": "success",
                        "images": [],
                        "referenceSnapshots": [
                            {
                                "id": "ref-1",
                                "name": "a.png",
                                "src": reference_src,
                            }
                        ],
                    }
                ],
            }
        ],
    }


class FakeGenerationResponse:
    ok = True
    status_code = 200
    text = ""
    headers = {"Content-Type": "application/json"}
    content = b""

    def json(self):
        return {"data": [{"b64_json": PNG_BASE64}]}


class ImageSafetyTests(unittest.TestCase):
    def test_raster_extension_is_deterministic_and_empty_for_unknown_mime(self) -> None:
        self.assertEqual(".png", image_safety_module.raster_extension("image/png"))
        self.assertEqual(".jpg", image_safety_module.raster_extension("image/jpeg"))
        self.assertEqual(".webp", image_safety_module.raster_extension("image/webp"))
        self.assertEqual("", image_safety_module.raster_extension("text/plain"))

    def test_public_limits_and_allowed_raster_mimes(self) -> None:
        self.assertEqual(25 * 1024 * 1024, REFERENCE_IMAGE_MAX_BYTES)
        self.assertEqual(150 * 1024 * 1024, REFERENCE_REQUEST_MAX_BYTES)
        self.assertEqual(50 * 1024 * 1024, REMOTE_RESULT_MAX_BYTES)
        self.assertEqual(
            {
                "image/png": ".png",
                "image/jpeg": ".jpg",
                "image/gif": ".gif",
                "image/webp": ".webp",
                "image/bmp": ".bmp",
            },
            ALLOWED_RASTER_MIMES,
        )

    def test_validate_raster_bytes_accepts_supported_magic(self) -> None:
        for expected_mime, raw in RASTER_SAMPLES.items():
            with self.subTest(expected_mime=expected_mime):
                self.assertEqual(
                    expected_mime,
                    validate_raster_bytes(raw, max_bytes=len(raw)),
                )

    def test_validate_raster_bytes_rejects_active_and_fake_images(self) -> None:
        payloads = (
            b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
            b"<html><body>not an image</body></html>",
            b'{"not":"an image"}',
        )
        for raw in payloads:
            with self.subTest(raw=raw[:16]):
                with self.assertRaises(ImageSafetyError) as error:
                    validate_raster_bytes(
                        raw,
                        max_bytes=1024,
                        claimed_mime="image/png",
                    )
                self.assertEqual(400, error.exception.status_code)

    def test_decode_raster_data_url_preflights_size_before_base64_decode(self) -> None:
        encoded = base64.b64encode(b"x" * 33).decode("ascii")
        with patch("image_safety.base64.b64decode") as decoder:
            with self.assertRaises(ImageSafetyError) as error:
                decode_raster_data_url(
                    f"data:image/png;base64,{encoded}",
                    max_bytes=32,
                )
        self.assertEqual(413, error.exception.status_code)
        decoder.assert_not_called()

    def test_decode_raster_data_url_rejects_invalid_base64(self) -> None:
        with self.assertRaises(ImageSafetyError) as error:
            decode_raster_data_url(
                "data:image/png;base64,%%%not-base64%%%",
                max_bytes=1024,
            )
        self.assertEqual(400, error.exception.status_code)

    def test_resolve_output_image_allows_existing_raster_and_subdirectory(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            nested = root / "session_refs"
            nested.mkdir()
            top_level = root / "ok.png"
            child = nested / "参考 图.png"
            top_level.write_bytes(RASTER_SAMPLES["image/png"])
            child.write_bytes(RASTER_SAMPLES["image/png"])

            self.assertEqual(top_level.resolve(), resolve_output_image(root, "ok.png"))
            self.assertEqual(
                child.resolve(),
                resolve_output_image(root, "session_refs/参考 图.png"),
            )

    def test_resolve_output_image_rejects_non_raster_and_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            outside = root.parent / "secret.png"
            outside.write_bytes(RASTER_SAMPLES["image/png"])
            (root / "history.json").write_text("{}", encoding="utf-8")
            (root / "active.svg").write_text("<svg/>", encoding="utf-8")
            (root / "fake.png").write_text("<html/>", encoding="utf-8")

            try:
                for relative_path in (
                    "history.json",
                    "active.svg",
                    "fake.png",
                    "../secret.png",
                    "missing.png",
                ):
                    with self.subTest(relative_path=relative_path):
                        with self.assertRaises(ImageSafetyError):
                            resolve_output_image(root, relative_path)
            finally:
                outside.unlink(missing_ok=True)

    def test_resolve_output_image_rejects_oversized_file_from_stat(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            oversized = root / "huge.png"
            with oversized.open("wb") as handle:
                handle.write(RASTER_SAMPLES["image/png"])
                handle.truncate(REMOTE_RESULT_MAX_BYTES + 1)

            with self.assertRaises(ImageSafetyError) as error:
                resolve_output_image(root, "huge.png")

            self.assertEqual(413, error.exception.status_code)

    def test_read_limited_chunks_rejects_as_soon_as_limit_is_exceeded(self) -> None:
        consumed_after_overflow = False

        def chunks():
            nonlocal consumed_after_overflow
            yield b"abc"
            yield b"def"
            consumed_after_overflow = True
            yield b"never"

        with self.assertRaises(ImageSafetyError) as error:
            read_limited_chunks(chunks(), max_bytes=5)

        self.assertEqual(413, error.exception.status_code)
        self.assertFalse(consumed_after_overflow)


class SecurityBoundaryApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.outputs = self.root / "outputs"
        self.static = self.root / "static"
        self.studio = self.static / "studio"
        (self.studio / "assets").mkdir(parents=True, exist_ok=True)
        (self.static / "index.html").write_text("<div>classic</div>", encoding="utf-8")
        (self.studio / "index.html").write_text("<div>studio</div>", encoding="utf-8")
        (self.root / "VERSION").write_text("1.0.6\n", encoding="utf-8")

        values = {
            "ROOT_DIR": self.root,
            "STATIC_DIR": self.static,
            "STUDIO_STATIC_DIR": self.studio,
            "OUTPUTS_DIR": self.outputs,
            "VERSION_FILE": self.root / "VERSION",
            "HISTORY_FILE": self.outputs / "history.json",
            "STUDIO_SESSIONS_FILE": self.outputs / "studio_sessions.json",
            "SESSION_REFS_DIR": self.outputs / "session_refs",
            "PRIMARY_CONFIG_FILE": self.root / "config.local.json",
            "CONFIG_FILE_CANDIDATES": [
                self.root / "config.local.json",
                self.root / "config.defaults.json",
            ],
        }
        self.environment = patch.dict(
            os.environ,
            {"IMAGE_TOOL_DEV_CORS_ORIGINS": ""},
        )
        self.environment.start()
        self.patchers = [patch.object(webapp, name, value) for name, value in values.items()]
        for item in self.patchers:
            item.start()
        self.client = TestClient(webapp.create_app())

    def tearDown(self) -> None:
        self.client.close()
        for item in reversed(self.patchers):
            item.stop()
        self.environment.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def cors_preflight(client: TestClient, origin: str):
        return client.options(
            "/api/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )

    def test_production_cors_does_not_echo_arbitrary_localhost_origin(self) -> None:
        response = self.cors_preflight(self.client, "http://localhost:9999")

        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_dev_cors_allows_only_configured_exact_origin(self) -> None:
        with patch.dict(
            os.environ,
            {"IMAGE_TOOL_DEV_CORS_ORIGINS": "http://127.0.0.1:5173"},
        ):
            with TestClient(webapp.create_app()) as client:
                allowed = self.cors_preflight(client, "http://127.0.0.1:5173")
                wrong_port = self.cors_preflight(client, "http://127.0.0.1:5174")
                localhost = self.cors_preflight(client, "http://localhost:5173")

        self.assertEqual(
            "http://127.0.0.1:5173",
            allowed.headers.get("access-control-allow-origin"),
        )
        self.assertNotIn("access-control-allow-origin", wrong_port.headers)
        self.assertNotIn("access-control-allow-origin", localhost.headers)

    def test_dev_cors_origins_parses_comma_separated_exact_values(self) -> None:
        with patch.dict(
            os.environ,
            {
                "IMAGE_TOOL_DEV_CORS_ORIGINS": (
                    " http://127.0.0.1:5173/, http://localhost:4173 ,, "
                )
            },
        ):
            self.assertEqual(
                ["http://127.0.0.1:5173", "http://localhost:4173"],
                webapp.dev_cors_origins(),
            )

    def test_foreign_origin_multipart_is_rejected_before_form_parse_or_executor(self) -> None:
        with (
            patch.object(
                StarletteRequest,
                "form",
                side_effect=AssertionError("foreign origin reached multipart parsing"),
            ) as request_form,
            patch.object(webapp.UPSTREAM_EXECUTOR, "run", new_callable=AsyncMock) as executor_run,
        ):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                headers={"Origin": "https://attacker.example"},
                data={"api_key": "secret", "prompt": "test"},
                files={"reference_files": ("probe.png", PNG_RAW, "image/png")},
            )

        self.assertEqual(403, response.status_code)
        self.assertEqual("不允许的请求来源", response.json()["detail"])
        request_form.assert_not_called()
        executor_run.assert_not_awaited()

    def test_generation_accepts_same_origin_configured_dev_origin_and_no_origin(self) -> None:
        original_form = StarletteRequest.form
        form_calls = []

        def tracking_form(request, *args, **kwargs):
            form_calls.append(dict(kwargs))
            return original_form(request, *args, **kwargs)

        with (
            patch.object(StarletteRequest, "form", tracking_form),
            patch.object(
                webapp.UPSTREAM_EXECUTOR,
                "run",
                new_callable=AsyncMock,
                return_value=FakeGenerationResponse(),
            ) as executor_run,
        ):
            same_origin = self.client.post(
                "/api/generate/gpt-image-2",
                headers={"Origin": "http://testserver"},
                data={"api_key": "secret", "prompt": "same origin"},
            )
            no_origin = self.client.post(
                "/api/generate/gpt-image-2",
                data={"api_key": "secret", "prompt": "local script"},
            )
            with patch.dict(
                os.environ,
                {"IMAGE_TOOL_DEV_CORS_ORIGINS": "http://127.0.0.1:5173"},
            ):
                with TestClient(webapp.create_app()) as dev_client:
                    dev_origin = dev_client.post(
                        "/api/generate/gpt-image-2",
                        headers={"Origin": "http://127.0.0.1:5173"},
                        data={"api_key": "secret", "prompt": "dev origin"},
                    )

        self.assertEqual(200, same_origin.status_code)
        self.assertEqual(200, no_origin.status_code)
        self.assertEqual(200, dev_origin.status_code)
        self.assertEqual("http://127.0.0.1:5173", dev_origin.headers.get("access-control-allow-origin"))
        self.assertEqual(3, executor_run.await_count)
        self.assertTrue(
            any(
                call.get("max_files") == 16
                and call.get("max_fields") == 64
                and call.get("max_part_size") == 1024 * 1024
                for call in form_calls
            ),
            form_calls,
        )

    def test_null_and_malformed_origins_are_rejected_before_body_parse(self) -> None:
        for origin in ("null", "not-an-origin", "http://testserver/path"):
            with self.subTest(origin=origin), patch.object(
                StarletteRequest,
                "form",
                side_effect=AssertionError("invalid origin reached multipart parsing"),
            ) as request_form:
                response = self.client.post(
                    "/api/generate/gpt-image-2",
                    headers={"Origin": origin},
                    data={"api_key": "secret", "prompt": "test"},
                )

            self.assertEqual(403, response.status_code)
            request_form.assert_not_called()

    def test_generation_multipart_content_length_limit_rejects_before_form_parse(self) -> None:
        with patch.object(webapp, "GENERATION_MULTIPART_MAX_BYTES", 64, create=True):
            with TestClient(webapp.create_app()) as client, patch.object(
                StarletteRequest,
                "form",
                side_effect=AssertionError("oversized body reached multipart parsing"),
            ) as request_form:
                response = client.post(
                    "/api/generate/gpt-image-2",
                    content=b"x",
                    headers={
                        "Content-Type": "multipart/form-data; boundary=limit-test",
                        "Content-Length": "65",
                    },
                )

        self.assertEqual(413, response.status_code)
        self.assertEqual("上传请求超过容量限制", response.json()["detail"])
        request_form.assert_not_called()

    def test_generation_urlencoded_content_length_limit_rejects_before_form_parse(self) -> None:
        with patch.object(webapp, "GENERATION_MULTIPART_MAX_BYTES", 64, create=True):
            with TestClient(webapp.create_app()) as client, patch.object(
                StarletteRequest,
                "form",
                side_effect=AssertionError("oversized urlencoded body reached form parsing"),
            ) as request_form, patch.object(
                webapp.UPSTREAM_EXECUTOR,
                "run",
                new_callable=AsyncMock,
            ) as executor_run:
                response = client.post(
                    "/api/generate/gpt-image-2",
                    content=b"x",
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Content-Length": "65",
                    },
                )

        self.assertEqual(413, response.status_code)
        self.assertEqual("上传请求超过容量限制", response.json()["detail"])
        request_form.assert_not_called()
        executor_run.assert_not_awaited()

    def test_generation_chunked_limit_stops_before_overflow_chunk_reaches_parser(self) -> None:
        parser_chunks = []

        async def probe_form(request, *args, **kwargs):
            del args, kwargs
            if request._form is not None:
                return request._form
            async for chunk in request.stream():
                parser_chunks.append(chunk)
            request._form = FormData()
            return request._form

        async def invoke_chunked(app):
            incoming = iter(
                [
                    {"type": "http.request", "body": b"a" * 16, "more_body": True},
                    {"type": "http.request", "body": b"b" * 32, "more_body": False},
                ]
            )
            sent = []

            async def receive():
                try:
                    return next(incoming)
                except StopIteration:
                    return {"type": "http.disconnect"}

            async def send(message):
                sent.append(message)

            await app(
                {
                    "type": "http",
                    "asgi": {"version": "3.0"},
                    "http_version": "1.1",
                    "method": "POST",
                    "scheme": "http",
                    "path": "/api/generate/gpt-image-2",
                    "raw_path": b"/api/generate/gpt-image-2",
                    "query_string": b"",
                    "headers": [
                        (b"host", b"testserver"),
                        (b"content-type", b"multipart/form-data; boundary=limit-test"),
                    ],
                    "client": ("127.0.0.1", 12345),
                    "server": ("testserver", 80),
                },
                receive,
                send,
            )
            return sent

        with (
            patch.object(webapp, "GENERATION_MULTIPART_MAX_BYTES", 32, create=True),
            patch.object(StarletteRequest, "form", probe_form),
            patch.object(webapp.UPSTREAM_EXECUTOR, "run", new_callable=AsyncMock) as executor_run,
        ):
            sent = asyncio.run(invoke_chunked(webapp.create_app()))

        response_start = next(message for message in sent if message["type"] == "http.response.start")
        response_body = b"".join(
            message.get("body", b"")
            for message in sent
            if message["type"] == "http.response.body"
        )
        self.assertEqual(413, response_start["status"])
        self.assertEqual("上传请求超过容量限制", json.loads(response_body)["detail"])
        self.assertEqual([b"a" * 16], parser_chunks)
        executor_run.assert_not_awaited()

    def test_generation_urlencoded_chunked_limit_stops_before_overflow_chunk_reaches_parser(self) -> None:
        parser_chunks = []

        async def probe_form(request, *args, **kwargs):
            del args, kwargs
            if request._form is not None:
                return request._form
            async for chunk in request.stream():
                parser_chunks.append(chunk)
            request._form = FormData()
            return request._form

        async def invoke_chunked(app):
            incoming = iter(
                [
                    {"type": "http.request", "body": b"a" * 16, "more_body": True},
                    {"type": "http.request", "body": b"b" * 32, "more_body": False},
                ]
            )
            sent = []

            async def receive():
                try:
                    return next(incoming)
                except StopIteration:
                    return {"type": "http.disconnect"}

            async def send(message):
                sent.append(message)

            await app(
                {
                    "type": "http",
                    "asgi": {"version": "3.0"},
                    "http_version": "1.1",
                    "method": "POST",
                    "scheme": "http",
                    "path": "/api/generate/gpt-image-2",
                    "raw_path": b"/api/generate/gpt-image-2",
                    "query_string": b"",
                    "headers": [
                        (b"host", b"testserver"),
                        (b"content-type", b"application/x-www-form-urlencoded"),
                    ],
                    "client": ("127.0.0.1", 12345),
                    "server": ("testserver", 80),
                },
                receive,
                send,
            )
            return sent

        with (
            patch.object(webapp, "GENERATION_MULTIPART_MAX_BYTES", 32, create=True),
            patch.object(StarletteRequest, "form", probe_form),
            patch.object(webapp.UPSTREAM_EXECUTOR, "run", new_callable=AsyncMock) as executor_run,
        ):
            sent = asyncio.run(invoke_chunked(webapp.create_app()))

        response_start = next(message for message in sent if message["type"] == "http.response.start")
        response_body = b"".join(
            message.get("body", b"")
            for message in sent
            if message["type"] == "http.response.body"
        )
        self.assertEqual(413, response_start["status"])
        self.assertEqual("上传请求超过容量限制", json.loads(response_body)["detail"])
        self.assertEqual([b"a" * 16], parser_chunks)
        executor_run.assert_not_awaited()

    def test_outputs_serves_only_valid_rasters_with_private_headers(self) -> None:
        session_refs = self.outputs / "session_refs"
        session_refs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "ok.png").write_bytes(PNG_RAW)
        child_name = "参考 图.png"
        (session_refs / child_name).write_bytes(PNG_RAW)
        (self.outputs / "history.json").write_text("{}", encoding="utf-8")
        (self.outputs / "studio_sessions.json").write_text("{}", encoding="utf-8")
        (self.outputs / "active.svg").write_text("<svg/>", encoding="utf-8")
        (self.outputs / "page.html").write_text("<html/>", encoding="utf-8")
        (self.outputs / "fake.png").write_text("<html/>", encoding="utf-8")
        (self.root / "secret.png").write_bytes(PNG_RAW)

        ok = self.client.get("/outputs/ok.png")
        child = self.client.get(f"/outputs/session_refs/{quote(child_name)}")

        self.assertEqual(200, ok.status_code)
        self.assertEqual("image/png", ok.headers["content-type"])
        self.assertEqual("nosniff", ok.headers["x-content-type-options"])
        self.assertEqual("private, max-age=3600", ok.headers["cache-control"])
        self.assertEqual(200, child.status_code)
        self.assertEqual(PNG_RAW, child.content)
        for relative_path in (
            "history.json",
            "studio_sessions.json",
            "active.svg",
            "page.html",
            "fake.png",
            "%2e%2e/secret.png",
        ):
            with self.subTest(relative_path=relative_path):
                self.assertEqual(
                    404,
                    self.client.get(f"/outputs/{relative_path}").status_code,
                )

    def test_outputs_rejects_valid_raster_with_unknown_extension(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "valid.bin").write_bytes(PNG_RAW)

        response = self.client.get("/outputs/valid.bin")

        self.assertEqual(404, response.status_code)

    def test_outputs_rejects_extension_and_magic_mismatch(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "mismatch.jpg").write_bytes(PNG_RAW)

        response = self.client.get("/outputs/mismatch.jpg")

        self.assertEqual(404, response.status_code)

    def test_generated_webp_uses_webp_extension_and_remains_served(self) -> None:
        image = {
            "src": f"data:image/webp;base64,{WEBP_BASE64}",
            "mime_type": "image/webp",
        }

        saved_count = webapp.save_generated_images("test", [image])

        self.assertEqual(1, saved_count)
        self.assertTrue(image["saved_name"].endswith(".webp"))
        response = self.client.get(image["saved_url"])
        self.assertEqual(200, response.status_code)
        self.assertEqual("image/webp", response.headers["content-type"])

    def test_session_webp_uses_webp_extension_and_remains_served(self) -> None:
        response = self.client.put(
            "/api/studio/sessions",
            json=session_payload(f"data:image/webp;base64,{WEBP_BASE64}"),
        )

        self.assertEqual(200, response.status_code)
        snapshot = response.json()["sessions"][0]["turns"][0]["referenceSnapshots"][0]
        self.assertTrue(snapshot["src"].endswith(".webp"))
        served = self.client.get(snapshot["src"])
        self.assertEqual(200, served.status_code)
        self.assertEqual("image/webp", served.headers["content-type"])

    def test_session_reference_accepts_encoded_local_output_raster(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        filename = "中文 空格.png"
        (self.outputs / filename).write_bytes(PNG_RAW)
        source = f"/outputs/{quote(filename)}"

        response = self.client.put(
            "/api/studio/sessions",
            json=session_payload(source),
        )

        self.assertEqual(200, response.status_code)
        saved = response.json()["sessions"][0]["turns"][0]["referenceSnapshots"][0]
        self.assertEqual(source, saved["src"])

    def test_session_reference_rejects_invalid_local_output(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "fake.png").write_text("<svg/>", encoding="utf-8")

        response = self.client.put(
            "/api/studio/sessions",
            json=session_payload("/outputs/fake.png"),
        )

        self.assertEqual(400, response.status_code)

    def test_session_reference_rejects_remote_url_without_fetching(self) -> None:
        with patch.object(webapp.requests, "get", return_value=None) as remote_get:
            response = self.client.put(
                "/api/studio/sessions",
                json=session_payload("https://example.com/a.png"),
            )

        self.assertEqual(400, response.status_code)
        remote_get.assert_not_called()

    def test_session_reference_rejects_oversized_data_url(self) -> None:
        encoded = base64.b64encode(
            PNG_RAW + b"x" * (REFERENCE_IMAGE_MAX_BYTES + 1),
        ).decode("ascii")

        response = self.client.put(
            "/api/studio/sessions",
            json=session_payload(f"data:image/png;base64,{encoded}"),
        )

        self.assertEqual(413, response.status_code)

    def test_session_put_rejects_cumulative_data_url_references_without_orphans(self) -> None:
        first_raw = PNG_RAW + b"a" * 8
        second_raw = PNG_RAW + b"b" * 8
        first_src = "data:image/png;base64," + base64.b64encode(first_raw).decode("ascii")
        second_src = "data:image/png;base64," + base64.b64encode(second_raw).decode("ascii")
        payload = session_payload(first_src)
        payload["sessions"][0]["turns"][0]["referenceSnapshots"].append(
            {
                "id": "ref-2",
                "name": "b.png",
                "src": second_src,
            }
        )

        with (
            patch.object(webapp, "REFERENCE_IMAGE_MAX_BYTES", 64),
            patch.object(webapp, "REFERENCE_REQUEST_MAX_BYTES", 80),
        ):
            response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(413, response.status_code)
        self.assertFalse((self.outputs / "studio_sessions.json").exists())
        session_refs = self.outputs / "session_refs"
        self.assertFalse(session_refs.exists() and any(session_refs.iterdir()))

    def test_session_put_counts_reused_output_reference_bytes(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        first_raw = PNG_RAW + b"a" * 8
        second_raw = PNG_RAW + b"b" * 8
        (self.outputs / "one.png").write_bytes(first_raw)
        (self.outputs / "two.png").write_bytes(second_raw)
        payload = session_payload("/outputs/one.png")
        payload["sessions"][0]["turns"][0]["referenceSnapshots"].append(
            {
                "id": "ref-2",
                "name": "two.png",
                "src": "/outputs/two.png",
            }
        )

        with patch.object(webapp, "REFERENCE_REQUEST_MAX_BYTES", 80):
            response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(413, response.status_code)
        self.assertFalse((self.outputs / "studio_sessions.json").exists())

    def test_local_output_reference_rejects_single_file_over_reference_limit(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "large.png").write_bytes(PNG_RAW + b"x" * 32)

        with patch.object(webapp, "REFERENCE_IMAGE_MAX_BYTES", 64):
            response = self.client.put(
                "/api/studio/sessions",
                json=session_payload("/outputs/large.png"),
            )

        self.assertEqual(413, response.status_code)
        self.assertFalse((self.outputs / "studio_sessions.json").exists())
        self.assertFalse((self.outputs / "session_refs").exists())

    def test_inspect_local_output_reference_enforces_single_file_limit(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "large.png").write_bytes(PNG_RAW + b"x" * 32)

        with patch.object(webapp, "REFERENCE_IMAGE_MAX_BYTES", 64):
            with self.assertRaises(ImageSafetyError) as error:
                webapp.inspect_studio_reference_source("/outputs/large.png")

        self.assertEqual(413, error.exception.status_code)

    def test_gpt_upload_rejects_fake_png_before_upstream(self) -> None:
        common = {
            "api_key": "sk-test",
            "base_url": "https://example.com/v1",
            "prompt": "x",
        }
        with patch.object(
            webapp.requests,
            "post",
            return_value=FakeGenerationResponse(),
        ) as upstream:
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data=common,
                files={"reference_files": ("fake.png", b"<svg/>", "image/png")},
            )

        self.assertEqual(400, response.status_code)
        upstream.assert_not_called()

    def test_banana_upload_rejects_fake_png_before_upstream(self) -> None:
        with patch.object(webapp, "create_requests_session") as session_factory:
            response = self.client.post(
                "/api/generate/banana",
                data={
                    "api_key": "banana-test",
                    "api_base_url": "https://example.com",
                    "prompt": "x",
                },
                files={"reference_files": ("fake.png", b"<html/>", "image/png")},
            )

        self.assertEqual(400, response.status_code)
        session_factory.assert_not_called()

    def test_upload_rejects_single_file_over_25_mib(self) -> None:
        oversized = PNG_RAW + b"x" * (REFERENCE_IMAGE_MAX_BYTES + 1)
        with patch.object(
            webapp.requests,
            "post",
            return_value=FakeGenerationResponse(),
        ) as upstream:
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "prompt": "x",
                },
                files={
                    "reference_files": (
                        "large.png",
                        io.BytesIO(oversized),
                        "image/png",
                    )
                },
            )

        self.assertEqual(413, response.status_code)
        upstream.assert_not_called()

    def test_upload_rejects_cumulative_request_overflow(self) -> None:
        first = PNG_RAW + b"a" * 16
        second = PNG_RAW + b"b" * 16
        with (
            patch.object(webapp, "REFERENCE_IMAGE_MAX_BYTES", 64, create=True),
            patch.object(webapp, "REFERENCE_REQUEST_MAX_BYTES", 80, create=True),
            patch.object(
                webapp.requests,
                "post",
                return_value=FakeGenerationResponse(),
            ) as upstream,
        ):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "prompt": "x",
                },
                files=[
                    ("reference_files", ("one.png", first, "image/png")),
                    ("reference_files", ("two.png", second, "image/png")),
                ],
            )

        self.assertEqual(413, response.status_code)
        upstream.assert_not_called()

    def test_read_upload_assets_caps_each_file_read(self) -> None:
        class UploadProbe:
            filename = "probe.png"
            content_type = "image/png"

            def __init__(self) -> None:
                self.read_sizes = []

            async def read(self, size: int = -1) -> bytes:
                self.read_sizes.append(size)
                return PNG_RAW

        upload = UploadProbe()
        with patch.object(webapp, "REFERENCE_IMAGE_MAX_BYTES", 64, create=True):
            assets = asyncio.run(webapp.read_upload_assets([upload], limit=1))

        self.assertEqual([65], upload.read_sizes)
        self.assertEqual(PNG_RAW, assets[0]["bytes"])

    def test_download_remote_image_streams_and_validates_magic(self) -> None:
        class StreamingResponse:
            status_code = 200
            headers = {
                "Content-Type": "image/png",
                "Content-Length": str(len(PNG_RAW)),
            }

            def __init__(self) -> None:
                self.chunk_size = None
                self.close_calls = 0

            def raise_for_status(self) -> None:
                return None

            def iter_content(self, chunk_size: int):
                self.chunk_size = chunk_size
                yield PNG_RAW[:8]
                yield PNG_RAW[8:]

            def close(self) -> None:
                self.close_calls += 1
                raise RuntimeError("close failed")

            @property
            def content(self):
                raise AssertionError("remote image body must be streamed")

        remote = StreamingResponse()
        with patch.object(webapp.requests, "get", return_value=remote) as remote_get:
            downloaded = webapp.download_remote_image("https://example.com/image.png")

        self.assertIsNotNone(downloaded)
        self.assertEqual("image/png", downloaded["mime_type"])
        self.assertEqual(64 * 1024, remote.chunk_size)
        self.assertTrue(remote_get.call_args.kwargs["stream"])
        self.assertEqual(1, remote.close_calls)

    def test_extract_image_bytes_accepts_only_strict_data_urls(self) -> None:
        valid = webapp.extract_image_bytes(
            f"data:image/png;base64,{PNG_BASE64}",
        )
        fake = webapp.extract_image_bytes(
            "data:image/png;base64,"
            + base64.b64encode(b"<svg/>").decode("ascii"),
        )

        self.assertEqual((PNG_RAW, "image/png"), valid)
        self.assertIsNone(fake)

    def test_extract_image_bytes_never_fetches_remote_urls(self) -> None:
        with patch.object(webapp.requests, "get") as remote_get:
            extracted = webapp.extract_image_bytes("https://example.com/image.png")

        self.assertIsNone(extracted)
        remote_get.assert_not_called()

    def test_download_remote_image_rejects_oversized_content_length(self) -> None:
        class OversizedResponse:
            status_code = 200
            headers = {
                "Content-Type": "image/png",
                "Content-Length": str(REMOTE_RESULT_MAX_BYTES + 1),
            }
            content = PNG_RAW

            def __init__(self) -> None:
                self.iterated = False
                self.close_calls = 0

            def raise_for_status(self) -> None:
                return None

            def iter_content(self, chunk_size: int):
                del chunk_size
                self.iterated = True
                yield PNG_RAW

            def close(self) -> None:
                self.close_calls += 1

        remote = OversizedResponse()
        with patch.object(webapp.requests, "get", return_value=remote):
            downloaded = webapp.download_remote_image("https://example.com/image.png")

        self.assertIsNone(downloaded)
        self.assertFalse(remote.iterated)
        self.assertEqual(1, remote.close_calls)

    def test_download_remote_image_rejects_chunk_overflow(self) -> None:
        class ChunkedResponse:
            status_code = 200
            headers = {"Content-Type": "image/png"}
            content = PNG_RAW

            def __init__(self) -> None:
                self.close_calls = 0

            def raise_for_status(self) -> None:
                return None

            def iter_content(self, chunk_size: int):
                del chunk_size
                yield PNG_RAW[:8]
                yield b"x" * 16

            def close(self) -> None:
                self.close_calls += 1

        remote = ChunkedResponse()
        with (
            patch.object(webapp, "REMOTE_RESULT_MAX_BYTES", 16, create=True),
            patch.object(webapp.requests, "get", return_value=remote),
        ):
            downloaded = webapp.download_remote_image("https://example.com/image.png")

        self.assertIsNone(downloaded)
        self.assertEqual(1, remote.close_calls)

    def test_non_raster_remote_results_are_not_counted_as_images(self) -> None:
        class HtmlResponse:
            status_code = 200
            headers = {"Content-Type": "image/png", "Content-Length": "7"}
            content = b"<html/>"

            def raise_for_status(self) -> None:
                return None

            def iter_content(self, chunk_size: int):
                del chunk_size
                yield self.content

        with patch.object(webapp.requests, "get", return_value=HtmlResponse()):
            gpt_images = webapp.build_gpt_images_from_response(
                {"data": [{"url": "https://example.com/fake.png"}]},
            )
            banana_images = webapp.extract_banana_images(
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "fileData": {
                                            "fileUri": "https://example.com/fake.png",
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            )["images"]

        self.assertEqual([], gpt_images)
        self.assertEqual([], banana_images)

    def test_gpt_non_raster_inline_result_is_not_counted_as_image(self) -> None:
        svg_base64 = base64.b64encode(b"<svg/>").decode("ascii")

        gpt_images = webapp.build_gpt_images_from_response(
            {
                "data": [
                    {
                        "url": f"data:image/svg+xml;base64,{svg_base64}",
                    }
                ]
            },
        )

        self.assertEqual([], gpt_images)

    def test_banana_non_raster_inline_result_is_not_counted_as_image(self) -> None:
        svg_base64 = base64.b64encode(b"<svg/>").decode("ascii")

        banana_images = webapp.extract_banana_images(
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "inlineData": {
                                        "mimeType": "image/png",
                                        "data": svg_base64,
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )["images"]

        self.assertEqual([], banana_images)

    def test_validate_bind_host_allows_only_loopback(self) -> None:
        for host in ("127.0.0.1", "localhost", "::1", "[::1]"):
            with self.subTest(host=host):
                self.assertEqual(host, webapp.validate_bind_host(host))

        for host in ("0.0.0.0", "192.168.1.25", "10.0.0.8"):
            with self.subTest(host=host):
                with self.assertRaises(ValueError):
                    webapp.validate_bind_host(host)

    def test_main_validates_bind_host_before_starting_uvicorn(self) -> None:
        with (
            patch.object(
                webapp,
                "validate_bind_host",
                side_effect=ValueError("blocked"),
                create=True,
            ) as validate,
            patch.object(webapp.uvicorn, "run") as run,
            patch.object(webapp.sys, "argv", ["app.py", "--host", "0.0.0.0"]),
        ):
            with self.assertRaisesRegex(ValueError, "blocked"):
                webapp.main()

        validate.assert_called_once_with("0.0.0.0")
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
