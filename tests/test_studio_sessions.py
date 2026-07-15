import base64
from concurrent.futures import ThreadPoolExecutor
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as webapp
import storage as storage_module


PNG_1X1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfeA\x89\x81\xb5"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")
PNG_1X1_RAW = base64.b64decode(PNG_1X1)
_MISSING = object()


def studio_session_payload(
    title: str,
    *,
    expected_revision=_MISSING,
    references=None,
) -> dict:
    now = "2026-07-10T10:00:00Z"
    turn = {
        "id": "turn-1",
        "engine": "gpt-image-2",
        "mode": "generate",
        "prompt": title,
        "createdAt": now,
        "status": "success",
        "images": [],
    }
    if references is not None:
        turn["referenceSnapshots"] = references
    payload = {
        "active_session_id": "session-1",
        "sessions": [
            {
                "id": "session-1",
                "title": title,
                "createdAt": now,
                "updatedAt": now,
                "turns": [turn],
            }
        ],
    }
    if expected_revision is not _MISSING:
        payload["expected_revision"] = expected_revision
    return payload


def raster_data_url(raw: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


class StudioSessionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.outputs = self.root / "outputs"
        (self.root / "static" / "studio").mkdir(parents=True, exist_ok=True)
        (self.root / "static" / "studio" / "assets").mkdir(parents=True, exist_ok=True)
        (self.root / "static" / "index.html").write_text("<div>classic</div>", encoding="utf-8")
        (self.root / "static" / "studio" / "index.html").write_text("<div>studio</div>", encoding="utf-8")
        (self.root / "static" / "studio" / "assets" / "probe.js").write_text(
            "console.log('studio asset');\n",
            encoding="utf-8",
        )
        (self.root / "VERSION").write_text("9.8.7\n", encoding="utf-8")
        patches = {
            "ROOT_DIR": self.root,
            "STATIC_DIR": self.root / "static",
            "STUDIO_STATIC_DIR": self.root / "static" / "studio",
            "OUTPUTS_DIR": self.outputs,
            "VERSION_FILE": self.root / "VERSION",
            "HISTORY_FILE": self.outputs / "history.json",
            "STUDIO_SESSIONS_FILE": self.outputs / "studio_sessions.json",
            "SESSION_REFS_DIR": self.outputs / "session_refs",
            "PRIMARY_CONFIG_FILE": self.root / "config.local.json",
            "CONFIG_FILE_CANDIDATES": [self.root / "config.local.json", self.root / "config.defaults.json"],
        }
        self.patchers = [patch.object(webapp, key, value) for key, value in patches.items()]
        for item in self.patchers:
            item.start()
        self.client = TestClient(webapp.create_app())

    def tearDown(self) -> None:
        for item in reversed(self.patchers):
            item.stop()
        self.temp_dir.cleanup()

    def seed_session_reference(self, raw: bytes = PNG_1X1_RAW):
        response = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload(
                "初始会话",
                expected_revision=1,
                references=[
                    {
                        "id": "ref-1",
                        "name": "same-name.png",
                        "mime_type": "image/png",
                        "src": raster_data_url(raw),
                    }
                ],
            ),
        )
        self.assertEqual(200, response.status_code)
        body = response.json()
        src = body["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
        path = webapp.path_from_output_url(src)
        self.assertIsNotNone(path)
        assert path is not None
        self.assertTrue(path.exists())
        return body, path

    def test_studio_session_get_defaults_and_legacy_state_use_revision_one(self) -> None:
        empty_response = self.client.get("/api/studio/sessions")

        self.assertEqual(200, empty_response.status_code)
        self.assertEqual(1, empty_response.json()["revision"])

        self.outputs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "studio_sessions.json").write_text(
            json.dumps(
                {
                    "version": 1,
                    "active_session_id": "legacy-session",
                    "sessions": [{"id": "legacy-session", "title": "旧会话", "turns": []}],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        legacy_response = self.client.get("/api/studio/sessions")

        self.assertEqual(200, legacy_response.status_code)
        self.assertEqual(1, legacy_response.json()["revision"])
        self.assertEqual("legacy-session", legacy_response.json()["active_session_id"])

    def test_studio_session_revision_conflict_returns_current_without_overwrite(self) -> None:
        first = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload("第一版", expected_revision=1),
        )
        self.assertEqual(200, first.status_code)
        self.assertEqual(2, first.json()["revision"])
        committed = (self.outputs / "studio_sessions.json").read_bytes()

        stale = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload("过期覆盖", expected_revision=1),
        )

        self.assertEqual(409, stale.status_code)
        body = stale.json()
        self.assertIsInstance(body["detail"], str)
        self.assertEqual(2, body["current"]["revision"])
        self.assertEqual("第一版", body["current"]["sessions"][0]["title"])
        self.assertEqual(committed, (self.outputs / "studio_sessions.json").read_bytes())

    def test_legacy_session_meta_is_sanitized_for_get_and_conflict_without_rewrite(self) -> None:
        sensitive_url = "https://url-user:url-pass@example.com/v1?token=query-secret#fragment"
        windows_path = r"C:\Users\Alice\private\token.txt"
        posix_path = "/home/alice/private/token.txt"
        legacy_payload = {
            "version": 1,
            "revision": 7,
            "updated_at": "2026-07-11T10:00:00",
            "active_session_id": "session-legacy-meta",
            "sessions": [
                {
                    "id": "session-legacy-meta",
                    "title": "旧元数据会话",
                    "createdAt": "2026-07-11T09:00:00",
                    "updatedAt": "2026-07-11T10:00:00",
                    "unknown_session_field": {"keep": [1, 2, 3]},
                    "turns": [
                        {
                            "id": "turn-legacy-meta",
                            "engine": "gpt-image-2",
                            "mode": "generate",
                            "prompt": "legacy",
                            "createdAt": "2026-07-11T09:00:00",
                            "status": "success",
                            "images": [],
                            "unknown_turn_field": {"keep": "turn"},
                            "referenceSnapshots": [
                                {
                                    "id": "ref-legacy",
                                    "name": "legacy.png",
                                    "src": "/outputs/session_refs/legacy.png",
                                    "unknown_reference_field": "keep-reference",
                                }
                            ],
                            "meta": {
                                "api_url": sensitive_url,
                                "api_url_host": windows_path,
                                "api_base_url": posix_path,
                                "api_base_url_host": sensitive_url.removeprefix("https://"),
                                "custom_meta": {"keep": "session"},
                            },
                        }
                    ],
                }
            ],
        }
        self.outputs.mkdir(parents=True, exist_ok=True)
        session_file = self.outputs / "studio_sessions.json"
        session_file.write_text(json.dumps(legacy_payload, ensure_ascii=False), encoding="utf-8")
        original_bytes = session_file.read_bytes()

        response = self.client.get("/api/studio/sessions")

        self.assertEqual(200, response.status_code)
        self.assertEqual(original_bytes, session_file.read_bytes())
        body = response.json()
        self.assertEqual(7, body["revision"])
        self.assertEqual("session-legacy-meta", body["active_session_id"])
        session = body["sessions"][0]
        turn = session["turns"][0]
        self.assertEqual({"keep": [1, 2, 3]}, session["unknown_session_field"])
        self.assertEqual({"keep": "turn"}, turn["unknown_turn_field"])
        self.assertEqual(legacy_payload["sessions"][0]["turns"][0]["referenceSnapshots"], turn["referenceSnapshots"])
        self.assertEqual(
            {
                "custom_meta": {"keep": "session"},
                "api_base_url_host": "[invalid endpoint]",
                "api_url_host": "example.com",
            },
            turn["meta"],
        )
        response_text = json.dumps(body, ensure_ascii=False)
        for marker in ("url-user", "url-pass", "query-secret", windows_path, posix_path):
            self.assertNotIn(marker, response_text)

        conflict = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload("过期覆盖", expected_revision=6),
        )

        self.assertEqual(409, conflict.status_code)
        self.assertEqual(original_bytes, session_file.read_bytes())
        current = conflict.json()["current"]
        self.assertEqual(7, current["revision"])
        current_session = current["sessions"][0]
        current_turn = current_session["turns"][0]
        self.assertEqual({"keep": [1, 2, 3]}, current_session["unknown_session_field"])
        self.assertEqual({"keep": "turn"}, current_turn["unknown_turn_field"])
        self.assertEqual(legacy_payload["sessions"][0]["turns"][0]["referenceSnapshots"], current_turn["referenceSnapshots"])
        conflict_text = json.dumps(conflict.json(), ensure_ascii=False)
        for marker in ("url-user", "url-pass", "query-secret", windows_path, posix_path):
            self.assertNotIn(marker, conflict_text)

    def test_studio_session_write_persists_only_host_port_metadata_hints(self) -> None:
        payload = studio_session_payload("会话 URL 脱敏")
        payload["sessions"][0]["turns"][0]["meta"] = {
            "api_url": "https://user:pass@Example.COM:8443/proxy/path-token?key=secret#fragment",
            "api_base_url": "https://[2001:DB8::1]:443/private?arbitrary=query-secret",
            "custom_meta": {"keep": True},
        }

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        meta = response.json()["sessions"][0]["turns"][0]["meta"]
        self.assertEqual(
            {
                "custom_meta": {"keep": True},
                "api_base_url_host": "[2001:db8::1]",
                "api_url_host": "example.com:8443",
            },
            meta,
        )
        persisted = json.loads((self.outputs / "studio_sessions.json").read_text(encoding="utf-8"))
        self.assertEqual(meta, persisted["sessions"][0]["turns"][0]["meta"])
        serialized = json.dumps(persisted, ensure_ascii=False)
        for marker in ("user", "pass", "path-token", "secret", "fragment", "/proxy", "/private"):
            self.assertNotIn(marker, serialized)

    def test_studio_session_write_bounds_turn_and_draft_text_fields(self) -> None:
        text_limit = 200_000
        error_limit = 8_000
        payload = studio_session_payload("文本边界")
        session = payload["sessions"][0]
        turn = session["turns"][0]
        turn.update(
            {
                "prompt": "提" * (text_limit + 1),
                "negativePrompt": "负" * (text_limit + 1),
                "posterText": "字" * (text_limit + 1),
                "reply": "答" * (text_limit + 1),
                "error": "错" * (error_limit + 1),
            }
        )
        session["drafts"] = {
            "shared": {"fixed_prompt": "固" * (text_limit + 1)},
            "gpt": {
                "prompt": "画" * (text_limit + 1),
                "negative_prompt": "避" * (text_limit + 1),
                "poster_text": "文" * (text_limit + 1),
            },
            "banana": {"prompt": "蕉" * (text_limit + 1)},
        }

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        saved_session = response.json()["sessions"][0]
        saved_turn = saved_session["turns"][0]
        for key in ("prompt", "negativePrompt", "posterText", "reply"):
            self.assertEqual(text_limit, len(saved_turn[key]), key)
        self.assertEqual(error_limit, len(saved_turn["error"]))
        self.assertEqual(text_limit, len(saved_session["drafts"]["shared"]["fixed_prompt"]))
        self.assertEqual(text_limit, len(saved_session["drafts"]["gpt"]["prompt"]))
        self.assertEqual(text_limit, len(saved_session["drafts"]["gpt"]["negative_prompt"]))
        self.assertEqual(text_limit, len(saved_session["drafts"]["gpt"]["poster_text"]))
        self.assertEqual(text_limit, len(saved_session["drafts"]["banana"]["prompt"]))

    def test_studio_session_write_compacts_generated_images_to_bounded_whitelist(self) -> None:
        string_limit = 8_192
        oversized = "x" * (string_limit + 1)
        payload = studio_session_payload("图片字段边界")
        payload["sessions"][0]["turns"][0]["images"] = [
            {
                "id": oversized,
                "name": oversized,
                "saved_name": oversized,
                "saved_path": oversized,
                "url": f"https://example.com/{oversized}",
                "mime_type": oversized,
                "dimensions": {"width": 1024, "height": 768, "unknown": oversized},
                "b64_json": oversized,
                "data_url": f"data:image/png;base64,{oversized}",
                "unknown_large_field": {"nested": oversized},
            },
            {
                "id": "canonical-image",
                "saved_url": "/outputs/canonical.png",
                "url": "https://provider.example.com/private/result.png?token=secret",
                "b64_json": oversized,
                "data_url": f"data:image/png;base64,{oversized}",
                "unknown_large_field": oversized,
            },
        ]

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        images = response.json()["sessions"][0]["turns"][0]["images"]
        self.assertEqual(2, len(images))
        first = images[0]
        self.assertEqual(
            {"id", "name", "saved_name", "saved_path", "url", "mime_type", "dimensions"},
            set(first),
        )
        for key, value in first.items():
            if isinstance(value, str):
                self.assertLessEqual(len(value), string_limit, key)
        self.assertEqual({"width": 1024, "height": 768}, first["dimensions"])
        second = images[1]
        self.assertEqual(
            {"id": "canonical-image", "saved_url": "/outputs/canonical.png"},
            second,
        )

    def test_studio_session_write_bounds_turn_metadata_shape(self) -> None:
        string_limit = 8_192
        payload = studio_session_payload("元数据结构边界")
        payload["sessions"][0]["turns"][0]["meta"] = {
            "mapping": {f"key-{index:02d}": index for index in range(55)},
            "array": list(range(55)),
            "long_text": "m" * (string_limit + 1),
            "deep": {
                "level_1": {
                    "level_2": {
                        "level_3": {
                            "level_4": {"level_5": "must-not-survive"},
                        }
                    }
                }
            },
        }

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        meta = response.json()["sessions"][0]["turns"][0]["meta"]
        self.assertEqual(50, len(meta["mapping"]))
        self.assertEqual(50, len(meta["array"]))
        self.assertEqual(string_limit, len(meta["long_text"]))
        self.assertNotIn("must-not-survive", json.dumps(meta, ensure_ascii=False))

    def test_studio_session_write_bounds_each_turn_metadata_to_64_kib(self) -> None:
        payload = studio_session_payload("元数据容量边界")
        payload["sessions"][0]["turns"][0]["meta"] = {
            f"field-{index:02d}": "m" * 8_192
            for index in range(50)
        }

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        meta = response.json()["sessions"][0]["turns"][0]["meta"]
        encoded = json.dumps(
            meta,
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
        self.assertLessEqual(len(encoded), 64 * 1024)
        self.assertIn("field-00", meta)

    def test_studio_session_normalized_json_limit_rolls_back_new_reference(self) -> None:
        current, old_path = self.seed_session_reference()
        current_json = (self.outputs / "studio_sessions.json").read_bytes()
        old_bytes = old_path.read_bytes()
        payload = studio_session_payload(
            "规范化 JSON 超限",
            expected_revision=current["revision"],
            references=[
                {
                    "id": "ref-new",
                    "name": "new.png",
                    "mime_type": "image/png",
                    "src": raster_data_url(PNG_1X1_RAW + b"normalized-json-limit"),
                }
            ],
        )

        with patch.object(
            webapp,
            "STUDIO_SESSION_JSON_MAX_BYTES",
            1,
            create=True,
        ):
            response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(413, response.status_code)
        self.assertEqual("会话数据超过容量限制", response.json()["detail"])
        self.assertEqual(current_json, (self.outputs / "studio_sessions.json").read_bytes())
        self.assertTrue(old_path.exists())
        self.assertEqual(old_bytes, old_path.read_bytes())
        self.assertEqual(
            {old_path.resolve()},
            {path.resolve() for path in (self.outputs / "session_refs").iterdir()},
        )

    def test_legacy_writes_increment_revision_and_invalid_expected_values_are_400(self) -> None:
        first = self.client.put("/api/studio/sessions", json=studio_session_payload("旧客户端一"))
        second = self.client.put("/api/studio/sessions", json=studio_session_payload("旧客户端二"))

        self.assertEqual(2, first.json()["revision"])
        self.assertEqual(3, second.json()["revision"])
        committed = (self.outputs / "studio_sessions.json").read_bytes()

        for invalid in ("1", "not-a-number", 0, -1, 1.5, True):
            with self.subTest(expected_revision=invalid):
                response = self.client.put(
                    "/api/studio/sessions",
                    json=studio_session_payload("非法 revision", expected_revision=invalid),
                )
                self.assertEqual(400, response.status_code)
                self.assertIn("expected_revision", str(response.json().get("detail", "")))
                self.assertEqual(committed, (self.outputs / "studio_sessions.json").read_bytes())

    def test_two_threads_with_same_expected_revision_have_one_winner(self) -> None:
        start = threading.Barrier(2)

        def write(title: str):
            start.wait(timeout=3)
            try:
                return "ok", webapp.write_studio_session_state(
                    studio_session_payload(title, expected_revision=1),
                )
            except Exception as exc:
                return "error", exc

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(write, "并发甲"), pool.submit(write, "并发乙")]
            outcomes = [future.result(timeout=10) for future in futures]

        successes = [value for status, value in outcomes if status == "ok"]
        failures = [value for status, value in outcomes if status == "error"]
        self.assertEqual(1, len(successes))
        self.assertEqual(1, len(failures))
        self.assertEqual("SessionRevisionConflict", type(failures[0]).__name__)
        self.assertEqual(2, failures[0].current["revision"])
        saved = json.loads((self.outputs / "studio_sessions.json").read_text(encoding="utf-8"))
        self.assertEqual(2, saved["revision"])
        self.assertEqual(successes[0]["sessions"], saved["sessions"])

    def test_revision_conflict_happens_before_data_url_creates_reference_file(self) -> None:
        committed = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload("当前版本", expected_revision=1),
        )
        self.assertEqual(2, committed.json()["revision"])

        conflict = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload(
                "过期带图版本",
                expected_revision=1,
                references=[
                    {
                        "id": "ref-stale",
                        "name": "stale.png",
                        "src": raster_data_url(PNG_1X1_RAW),
                    }
                ],
            ),
        )

        self.assertEqual(409, conflict.status_code)
        self.assertFalse((self.outputs / "session_refs").exists())

    def test_session_reference_count_capacity_failure_keeps_current_state_and_files(self) -> None:
        current, old_path = self.seed_session_reference()
        current_json = (self.outputs / "studio_sessions.json").read_bytes()
        old_bytes = old_path.read_bytes()
        old_snapshot = current["sessions"][0]["turns"][0]["referenceSnapshots"][0]
        payload = studio_session_payload(
            "超出文件数量",
            expected_revision=current["revision"],
            references=[
                old_snapshot,
                {
                    "id": "ref-2",
                    "name": "second.png",
                    "src": raster_data_url(PNG_1X1_RAW + b"second"),
                },
            ],
        )

        with (
            patch.object(webapp, "STUDIO_MAX_REF_FILES", 1),
            patch.object(webapp, "STUDIO_MAX_REF_BYTES", 10_000),
            patch.object(webapp, "REFERENCE_REQUEST_MAX_BYTES", 10_000),
        ):
            response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(413, response.status_code)
        self.assertEqual(current_json, (self.outputs / "studio_sessions.json").read_bytes())
        self.assertEqual(old_bytes, old_path.read_bytes())
        self.assertEqual(
            {old_path.resolve()},
            {path.resolve() for path in (self.outputs / "session_refs").iterdir()},
        )

    def test_session_reference_byte_capacity_failure_keeps_current_state_and_files(self) -> None:
        current, old_path = self.seed_session_reference()
        current_json = (self.outputs / "studio_sessions.json").read_bytes()
        old_bytes = old_path.read_bytes()
        new_raw = PNG_1X1_RAW + b"larger-reference"
        old_snapshot = current["sessions"][0]["turns"][0]["referenceSnapshots"][0]
        payload = studio_session_payload(
            "超出字节容量",
            expected_revision=current["revision"],
            references=[
                old_snapshot,
                {
                    "id": "ref-2",
                    "name": "second.png",
                    "src": raster_data_url(new_raw),
                },
            ],
        )

        with (
            patch.object(webapp, "STUDIO_MAX_REF_FILES", 10),
            patch.object(webapp, "STUDIO_MAX_REF_BYTES", len(old_bytes) + len(new_raw) - 1),
            patch.object(webapp, "REFERENCE_REQUEST_MAX_BYTES", 10_000),
        ):
            response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(413, response.status_code)
        self.assertEqual(current_json, (self.outputs / "studio_sessions.json").read_bytes())
        self.assertEqual(old_bytes, old_path.read_bytes())
        self.assertEqual(
            {old_path.resolve()},
            {path.resolve() for path in (self.outputs / "session_refs").iterdir()},
        )

    def test_atomic_session_json_failure_rolls_back_new_reference_without_overwriting_old(self) -> None:
        current, old_path = self.seed_session_reference()
        current_json = (self.outputs / "studio_sessions.json").read_bytes()
        old_bytes = old_path.read_bytes()
        replacement_raw = PNG_1X1_RAW + b"different-content"
        payload = studio_session_payload(
            "替换同逻辑文件名",
            expected_revision=current["revision"],
            references=[
                {
                    "id": "ref-1",
                    "name": "same-name.png",
                    "mime_type": "image/png",
                    "src": raster_data_url(replacement_raw),
                }
            ],
        )
        original_replace = storage_module.os.replace

        def fail_session_json_replace(source, destination):
            if Path(destination).resolve() == (self.outputs / "studio_sessions.json").resolve():
                raise OSError("session json replace failed")
            return original_replace(source, destination)

        with (
            patch.object(storage_module.os, "replace", side_effect=fail_session_json_replace),
            patch.object(
                webapp,
                "prune_session_reference_files",
                wraps=webapp.prune_session_reference_files,
            ) as prune,
        ):
            with self.assertRaisesRegex(OSError, "session json replace failed"):
                webapp.write_studio_session_state(payload)

        prune.assert_not_called()
        self.assertEqual(current_json, (self.outputs / "studio_sessions.json").read_bytes())
        self.assertEqual(old_bytes, old_path.read_bytes())
        self.assertEqual(
            {old_path.resolve()},
            {path.resolve() for path in (self.outputs / "session_refs").iterdir()},
        )
        self.assertEqual([], list(self.outputs.rglob("*.tmp")))

    def test_session_reference_write_failure_retries_transient_cleanup(self) -> None:
        current, old_path = self.seed_session_reference()
        current_json = (self.outputs / "studio_sessions.json").read_bytes()
        old_bytes = old_path.read_bytes()
        payload = studio_session_payload(
            "写入失败回滚",
            expected_revision=current["revision"],
            references=[
                {
                    "id": "ref-1",
                    "name": "replacement.png",
                    "mime_type": "image/png",
                    "src": raster_data_url(PNG_1X1_RAW + b"partial-write"),
                }
            ],
        )
        reference_root = (self.outputs / "session_refs").resolve()
        old_resolved = old_path.resolve()
        new_unlink_attempts = []
        path_type = type(old_path)
        original_unlink = path_type.unlink

        def flaky_new_reference_unlink(path, *args, **kwargs):
            resolved = path.resolve()
            if resolved != old_resolved and reference_root in resolved.parents:
                new_unlink_attempts.append(resolved)
                if len(new_unlink_attempts) == 1:
                    raise OSError("transient unlink failure")
            return original_unlink(path, *args, **kwargs)

        with (
            patch.object(webapp.os, "fsync", side_effect=OSError("reference fsync failed")),
            patch.object(
                path_type,
                "unlink",
                autospec=True,
                side_effect=flaky_new_reference_unlink,
            ),
        ):
            with self.assertRaisesRegex(OSError, "reference fsync failed"):
                webapp.write_studio_session_state(payload)

        self.assertGreaterEqual(len(new_unlink_attempts), 2)
        self.assertEqual(current_json, (self.outputs / "studio_sessions.json").read_bytes())
        self.assertTrue(old_path.exists())
        self.assertEqual(old_bytes, old_path.read_bytes())
        self.assertEqual(
            {old_resolved},
            {path.resolve() for path in (self.outputs / "session_refs").iterdir()},
        )

    def test_repeated_data_url_reference_reuses_stable_file(self) -> None:
        raw = PNG_1X1_RAW + b"stable-reference"
        payload = studio_session_payload(
            "稳定参考图",
            expected_revision=1,
            references=[
                {
                    "id": "ref-stable",
                    "name": "stable.png",
                    "mime_type": "image/png",
                    "src": raster_data_url(raw),
                }
            ],
        )
        first = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, first.status_code)
        first_body = first.json()
        first_url = first_body["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
        first_path = webapp.path_from_output_url(first_url)
        self.assertIsNotNone(first_path)
        assert first_path is not None
        self.assertRegex(first_url, r"^/outputs/session_refs/ref-[0-9a-f]{32}\.png$")
        before_files = {
            path.resolve()
            for path in (self.outputs / "session_refs").iterdir()
            if path.is_file()
        }
        unlinked_reference_paths = []
        path_type = type(first_path)
        original_unlink = path_type.unlink

        def record_reference_unlink(path, *args, **kwargs):
            resolved = path.resolve()
            if (self.outputs / "session_refs").resolve() in resolved.parents:
                unlinked_reference_paths.append(resolved)
            return original_unlink(path, *args, **kwargs)

        payload["expected_revision"] = first_body["revision"]
        with patch.object(
            path_type,
            "unlink",
            autospec=True,
            side_effect=record_reference_unlink,
        ):
            second = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, second.status_code)
        second_url = second.json()["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
        after_files = {
            path.resolve()
            for path in (self.outputs / "session_refs").iterdir()
            if path.is_file()
        }
        self.assertEqual(first_url, second_url)
        self.assertEqual(before_files, after_files)
        self.assertEqual([], unlinked_reference_paths)
        self.assertEqual(raw, first_path.read_bytes())

    def test_different_reference_content_gets_different_stable_url(self) -> None:
        current, old_path = self.seed_session_reference(PNG_1X1_RAW + b"first-content")
        old_url = current["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
        replacement_raw = PNG_1X1_RAW + b"second-content"
        response = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload(
                "不同内容",
                expected_revision=current["revision"],
                references=[
                    {
                        "id": "ref-1",
                        "name": "same-name.png",
                        "mime_type": "image/png",
                        "src": raster_data_url(replacement_raw),
                    }
                ],
            ),
        )

        self.assertEqual(200, response.status_code)
        new_url = response.json()["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
        new_path = webapp.path_from_output_url(new_url)
        self.assertIsNotNone(new_path)
        assert new_path is not None
        self.assertNotEqual(old_url, new_url)
        self.assertRegex(new_url, r"^/outputs/session_refs/ref-[0-9a-f]{32}\.png$")
        self.assertFalse(old_path.exists())
        self.assertEqual(replacement_raw, new_path.read_bytes())

    def test_existing_uuid_reference_url_is_preserved(self) -> None:
        reference_dir = self.outputs / "session_refs"
        reference_dir.mkdir(parents=True, exist_ok=True)
        legacy_path = reference_dir / (
            "session-1-turn-1-01-"
            + ("a" * 32)
            + "-legacy-reference.png"
        )
        legacy_path.write_bytes(PNG_1X1_RAW)
        legacy_url = webapp.output_url_for_path(legacy_path)

        response = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload(
                "旧 UUID 参考图",
                expected_revision=1,
                references=[
                    {
                        "id": "ref-legacy",
                        "name": "legacy-reference.png",
                        "mime_type": "image/png",
                        "src": legacy_url,
                    }
                ],
            ),
        )

        self.assertEqual(200, response.status_code)
        saved_url = response.json()["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
        self.assertEqual(legacy_url, saved_url)
        self.assertTrue(legacy_path.exists())
        self.assertEqual(PNG_1X1_RAW, legacy_path.read_bytes())

    def test_stable_reference_content_collision_never_overwrites_current_file(self) -> None:
        current, old_path = self.seed_session_reference()
        current_json = (self.outputs / "studio_sessions.json").read_bytes()
        collision_bytes = b"occupied-by-different-content"
        old_path.write_bytes(collision_bytes)
        payload = studio_session_payload(
            "稳定文件内容冲突",
            expected_revision=current["revision"],
            references=[
                {
                    "id": "ref-1",
                    "name": "same-name.png",
                    "mime_type": "image/png",
                    "src": raster_data_url(PNG_1X1_RAW),
                }
            ],
        )

        with patch.object(
            webapp,
            "prune_session_reference_files",
            wraps=webapp.prune_session_reference_files,
        ) as prune:
            response = self.client.put("/api/studio/sessions", json=payload)

        prune.assert_not_called()
        self.assertEqual(409, response.status_code)
        self.assertEqual("会话参考图文件内容冲突", response.json()["detail"])
        self.assertEqual(current_json, (self.outputs / "studio_sessions.json").read_bytes())
        self.assertTrue(old_path.exists())
        self.assertEqual(collision_bytes, old_path.read_bytes())
        self.assertEqual(
            {old_path.resolve()},
            {path.resolve() for path in (self.outputs / "session_refs").iterdir()},
        )

    def test_concurrent_identical_reference_writes_reuse_stable_file(self) -> None:
        raw = PNG_1X1_RAW + b"concurrent-stable-reference"
        payload = studio_session_payload(
            "并发稳定参考图",
            references=[
                {
                    "id": "ref-concurrent",
                    "name": "concurrent.png",
                    "mime_type": "image/png",
                    "src": raster_data_url(raw),
                }
            ],
        )
        start = threading.Barrier(2)

        def write():
            start.wait(timeout=3)
            return webapp.write_studio_session_state(payload)

        with ThreadPoolExecutor(max_workers=2) as pool:
            states = [future.result(timeout=10) for future in [pool.submit(write), pool.submit(write)]]

        urls = {
            state["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
            for state in states
        }
        self.assertEqual({2, 3}, {state["revision"] for state in states})
        self.assertEqual(1, len(urls))
        stable_url = next(iter(urls))
        stable_path = webapp.path_from_output_url(stable_url)
        self.assertIsNotNone(stable_path)
        assert stable_path is not None
        self.assertTrue(stable_path.exists())
        self.assertEqual(raw, stable_path.read_bytes())
        self.assertEqual(
            {stable_path.resolve()},
            {path.resolve() for path in (self.outputs / "session_refs").iterdir()},
        )
        saved = json.loads((self.outputs / "studio_sessions.json").read_text(encoding="utf-8"))
        self.assertEqual(3, saved["revision"])
        self.assertEqual(stable_url, saved["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"])

    def test_successful_session_json_commit_happens_before_prune(self) -> None:
        current, old_path = self.seed_session_reference()
        events = []
        original_replace = storage_module.os.replace
        original_prune = webapp.prune_session_reference_files

        def record_replace(source, destination):
            if Path(destination).resolve() == (self.outputs / "studio_sessions.json").resolve():
                events.append("replace")
            return original_replace(source, destination)

        def record_prune(sessions):
            events.append("prune")
            return original_prune(sessions)

        with (
            patch.object(storage_module.os, "replace", side_effect=record_replace),
            patch.object(webapp, "prune_session_reference_files", side_effect=record_prune),
        ):
            response = self.client.put(
                "/api/studio/sessions",
                json={
                    "expected_revision": current["revision"],
                    "active_session_id": "",
                    "sessions": [],
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(["replace", "prune"], events)
        self.assertFalse(old_path.exists())

    def test_prune_failure_after_commit_does_not_report_session_write_failure(self) -> None:
        first = self.client.put(
            "/api/studio/sessions",
            json=studio_session_payload("提交前", expected_revision=1),
        )
        self.assertEqual(2, first.json()["revision"])

        with patch.object(
            webapp,
            "prune_session_reference_files",
            side_effect=OSError("prune failed after commit"),
        ):
            response = self.client.put(
                "/api/studio/sessions",
                json=studio_session_payload("已提交", expected_revision=2),
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(3, response.json()["revision"])
        saved = json.loads((self.outputs / "studio_sessions.json").read_text(encoding="utf-8"))
        self.assertEqual(3, saved["revision"])
        self.assertEqual("已提交", saved["sessions"][0]["title"])

    def test_index_disables_cache(self) -> None:
        response = self.client.get("/")
        cache_control = response.headers.get("cache-control", "")

        self.assertEqual(200, response.status_code)
        for token in ["no-store", "no-cache", "must-revalidate", "max-age=0"]:
            self.assertIn(token, cache_control)
        self.assertEqual("no-cache", response.headers.get("pragma"))
        self.assertEqual("0", response.headers.get("expires"))

    def test_health_returns_app_version(self) -> None:
        response = self.client.get("/api/health")

        self.assertEqual(200, response.status_code)
        self.assertEqual("9.8.7", response.json()["version"])

    def test_config_defaults_wraps_legacy_forms_as_profiles(self) -> None:
        (self.root / "config.local.json").write_text(
            json.dumps(
                {
                    "version": 1,
                    "active_engine": "gpt-image-2",
                    "forms": {
                        "gpt-image-2-form": {
                            "api_key": "sk-old",
                            "base_url": "https://api.openai.com/v1",
                            "model": "gpt-image-2",
                            "chat_model": "gpt-5.4",
                        },
                        "banana-form": {
                            "api_key": "banana-old",
                            "api_base_url": "https://banana.example.cn/v1",
                            "model_type": "gemini-3-pro-image-preview",
                        },
                    },
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        response = self.client.get("/api/config/defaults")

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertEqual("gpt-image-2", payload["active_engine"])
        self.assertEqual("sk-old", payload["forms"]["gpt-image-2-form"]["api_key"])
        self.assertEqual("gpt-image-2-default", payload["active_profile_ids"]["gpt-image-2"])
        profiles = {item["id"]: item for item in payload["profiles"]}
        self.assertEqual("api.openai", profiles["gpt-image-2-default"]["name"])
        self.assertEqual("banana.example", profiles["banana-default"]["name"])
        self.assertEqual("https://api.openai.com/v1", profiles["gpt-image-2-default"]["form"]["base_url"])

    def test_saving_profiles_keeps_legacy_forms_for_v102_compatibility(self) -> None:
        payload = {
            "version": 2,
            "active_engine": "gpt-image-2",
            "active_profile_ids": {
                "gpt-image-2": "gpt-work",
                "banana": "banana-work",
            },
            "profiles": [
                {
                    "id": "gpt-work",
                    "engine": "gpt-image-2",
                    "name": "公司接口",
                    "form": {
                        "api_key": "sk-new",
                        "base_url": "https://api.company.com/v1",
                        "model": "gpt-image-2",
                        "chat_model": "gpt-5.4",
                    },
                },
                {
                    "id": "banana-work",
                    "engine": "banana",
                    "name": "备用号",
                    "form": {
                        "api_key": "banana-new",
                        "api_base_url": "https://banana.company.com/v1",
                        "model_type": "gemini-3-pro-image-preview",
                    },
                },
            ],
        }

        response = self.client.post("/api/config/local-file", json=payload)

        self.assertEqual(200, response.status_code)
        saved = json.loads((self.root / "config.local.json").read_text(encoding="utf-8"))
        self.assertEqual(2, saved["version"])
        self.assertEqual("公司接口", saved["profiles"][0]["name"])
        self.assertEqual("sk-new", saved["forms"]["gpt-image-2-form"]["api_key"])
        self.assertEqual("banana-new", saved["forms"]["banana-form"]["api_key"])

    def test_studio_assets_are_available_from_root_relative_url(self) -> None:
        response = self.client.get("/assets/probe.js")

        self.assertEqual(200, response.status_code)
        self.assertEqual("console.log('studio asset');\n", response.text.replace("\r\n", "\n"))

    def test_legacy_output_history_ids_are_unique_per_filename(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        (self.outputs / "same.png").write_bytes(b"png")
        (self.outputs / "same.jpg").write_bytes(b"jpg")

        response = self.client.get("/api/history", params={"limit": "20"})

        self.assertEqual(200, response.status_code)
        entries = response.json()["entries"]
        legacy_ids = {
            entry["images"][0]["name"]: entry["id"]
            for entry in entries
            if entry.get("legacy") and entry.get("images")
        }
        self.assertEqual({"same.png", "same.jpg"}, set(legacy_ids))
        self.assertNotEqual(legacy_ids["same.png"], legacy_ids["same.jpg"])

    def test_legacy_output_delete_removes_only_the_requested_file(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        same_png = self.outputs / "same.png"
        same_jpg = self.outputs / "same.jpg"
        same_png.write_bytes(b"png")
        same_jpg.write_bytes(b"jpg")
        history_response = self.client.get("/api/history", params={"limit": "20"})
        entries = history_response.json()["entries"]
        png_entry = next(
            entry
            for entry in entries
            if entry.get("legacy") and entry.get("images", [{}])[0].get("name") == "same.png"
        )

        response = self.client.delete(
            f"/api/history/{png_entry['id']}",
            params={"delete_files": "true", "legacy_path": "outputs/same.png"},
        )

        self.assertEqual(200, response.status_code)
        self.assertFalse(same_png.exists())
        self.assertTrue(same_jpg.exists())
        self.assertEqual(["outputs/same.png"], response.json()["deleted_files"])

    def test_legacy_output_delete_rejects_forged_legacy_path(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        target = self.outputs / "other.png"
        target.write_bytes(b"png")

        response = self.client.delete(
            "/api/history/legacy-forged",
            params={"delete_files": "true", "legacy_path": "outputs/other.png"},
        )

        self.assertEqual(404, response.status_code)
        self.assertTrue(target.exists())

    def test_legacy_output_delete_rejects_matching_id_for_nested_outputs_file(self) -> None:
        nested_dir = self.outputs / "session_refs"
        nested_dir.mkdir(parents=True, exist_ok=True)
        target = nested_dir / "secret.png"
        target.write_bytes(b"png")
        forged_id = webapp.legacy_output_entry_id("secret.png")

        response = self.client.delete(
            f"/api/history/{forged_id}",
            params={"delete_files": "true", "legacy_path": "outputs/session_refs/secret.png"},
        )

        self.assertEqual(404, response.status_code)
        self.assertTrue(target.exists())

    def test_studio_sessions_persist_reference_files_outside_json(self) -> None:
        references = [
            {
                "id": f"ref-{index}",
                "name": f"参考图-{index}.png",
                "mime_type": "image/png",
                "src": f"data:image/png;base64,{PNG_1X1}",
            }
            for index in range(10)
        ]
        payload = {
            "active_session_id": "session-1",
            "sessions": [
                {
                    "id": "session-1",
                    "title": "测试会话",
                    "createdAt": "2026-05-11T00:00:00",
                    "updatedAt": "2026-05-11T00:00:01",
                    "turns": [
                        {
                            "id": "turn-1",
                            "engine": "gpt-image-2",
                            "mode": "chat",
                            "prompt": "测试",
                            "createdAt": "2026-05-11T00:00:01",
                            "status": "success",
                            "images": [],
                            "referenceSnapshots": references,
                        }
                    ],
                }
            ],
        }

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        body = response.json()
        saved_refs = body["sessions"][0]["turns"][0]["referenceSnapshots"]
        self.assertEqual(8, len(saved_refs))
        self.assertTrue(saved_refs[0]["src"].startswith("/outputs/session_refs/"))
        self.assertTrue((self.outputs / "studio_sessions.json").exists())
        self.assertTrue(list((self.outputs / "session_refs").glob("*.png")))
        raw_json = (self.outputs / "studio_sessions.json").read_text(encoding="utf-8")
        self.assertNotIn("data:image", raw_json)

        get_response = self.client.get("/api/studio/sessions")
        self.assertEqual(body["sessions"], get_response.json()["sessions"])

    def test_studio_sessions_prune_deleted_session_reference_files(self) -> None:
        first_payload = {
            "active_session_id": "session-1",
            "sessions": [
                {
                    "id": "session-1",
                    "title": "会话一",
                    "createdAt": "2026-05-14T00:00:00",
                    "updatedAt": "2026-05-14T00:00:01",
                    "turns": [
                        {
                            "id": "turn-1",
                            "engine": "gpt-image-2",
                            "mode": "generate",
                            "prompt": "第一轮",
                            "createdAt": "2026-05-14T00:00:01",
                            "status": "success",
                            "images": [],
                            "referenceSnapshots": [
                                {
                                    "id": "ref-1",
                                    "name": "参考图.png",
                                    "mime_type": "image/png",
                                    "src": f"data:image/png;base64,{PNG_1X1}",
                                }
                            ],
                        }
                    ],
                }
            ],
        }

        first_response = self.client.put("/api/studio/sessions", json=first_payload)
        self.assertEqual(200, first_response.status_code)
        saved_ref = first_response.json()["sessions"][0]["turns"][0]["referenceSnapshots"][0]["src"]
        saved_path = self.root / saved_ref.lstrip("/").replace("/", "\\")
        self.assertTrue(saved_path.exists())

        second_response = self.client.put(
            "/api/studio/sessions",
            json={"active_session_id": "", "sessions": []},
        )

        self.assertEqual(200, second_response.status_code)
        self.assertFalse(saved_path.exists())

    def test_studio_sessions_preserve_drafts_payload(self) -> None:
        payload = {
            "active_session_id": "session-1",
            "sessions": [
                {
                    "id": "session-1",
                    "title": "测试草稿",
                    "createdAt": "2026-05-14T00:00:00",
                    "updatedAt": "2026-05-14T00:00:01",
                    "drafts": {
                        "shared": {
                            "fixed_prompt": "偏二次元技能海报，高完成度",
                        },
                        "gpt": {
                            "prompt": "蓝色闪电斩击",
                            "negative_prompt": "blurry, low quality",
                            "poster_text": "雷光",
                        },
                        "banana": {
                            "prompt": "橙色爆炸波",
                        },
                    },
                    "turns": [],
                }
            ],
        }

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        session = response.json()["sessions"][0]
        self.assertEqual("偏二次元技能海报，高完成度", session["drafts"]["shared"]["fixed_prompt"])
        self.assertEqual("蓝色闪电斩击", session["drafts"]["gpt"]["prompt"])
        self.assertEqual("blurry, low quality", session["drafts"]["gpt"]["negative_prompt"])
        self.assertEqual("雷光", session["drafts"]["gpt"]["poster_text"])
        self.assertEqual("橙色爆炸波", session["drafts"]["banana"]["prompt"])

    def test_studio_sessions_preserve_turn_poster_text(self) -> None:
        payload = {
            "active_session_id": "session-1",
            "sessions": [
                {
                    "id": "session-1",
                    "title": "测试文本",
                    "createdAt": "2026-05-14T00:00:00",
                    "updatedAt": "2026-05-14T00:00:01",
                    "turns": [
                        {
                            "id": "turn-1",
                            "engine": "gpt-image-2",
                            "mode": "generate",
                            "prompt": "测试海报",
                            "posterText": "雷光",
                            "createdAt": "2026-05-14T00:00:01",
                            "status": "success",
                            "images": [],
                        }
                    ],
                }
            ],
        }

        response = self.client.put("/api/studio/sessions", json=payload)

        self.assertEqual(200, response.status_code)
        session = response.json()["sessions"][0]
        self.assertEqual("雷光", session["turns"][0]["posterText"])

    def test_gpt_chat_forwards_reasoning_effort(self) -> None:
        captured = {}

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"choices": [{"message": {"content": "好的"}}], "usage": {"total_tokens": 3}}

        def fake_post(*_args, **kwargs):
            captured["json"] = kwargs["json"]
            return FakeResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/chat/gpt-image-2",
                json={
                    "prompt": "聊一下提示词",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "chat_model": "gpt-5.5",
                    "reasoning_effort": "high",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual("gpt-5.5", captured["json"]["model"])
        self.assertEqual("high", captured["json"]["reasoning_effort"])
        self.assertEqual("high", response.json()["meta"]["reasoning_effort"])

    def test_gpt_chat_forwards_conversation_context(self) -> None:
        captured = {}

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"choices": [{"message": {"content": "继续这个方向"}}]}

        def fake_post(*_args, **kwargs):
            captured["json"] = kwargs["json"]
            return FakeResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/chat/gpt-image-2",
                json={
                    "prompt": "那第二版怎么改？",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "chat_model": "gpt-5.5",
                    "messages": [
                        {"role": "user", "content": "我要做蓝色闪电刀光。"},
                        {"role": "assistant", "content": "可以强化方向性和边缘高光。"},
                    ],
                },
            )

        self.assertEqual(200, response.status_code)
        messages = captured["json"]["messages"]
        self.assertEqual("system", messages[0]["role"])
        self.assertEqual(
            [
                ("user", "我要做蓝色闪电刀光。"),
                ("assistant", "可以强化方向性和边缘高光。"),
                ("user", "那第二版怎么改？"),
            ],
            [(item["role"], item["content"]) for item in messages[1:]],
        )

    def test_gpt_chat_decodes_utf8_json_even_when_upstream_charset_is_wrong(self) -> None:
        class FakeResponse:
            ok = True
            status_code = 200
            headers = {"Content-Type": "application/json; charset=latin-1"}
            content = json.dumps(
                {"choices": [{"message": {"content": "中文回复：可以继续加强剪影。"}}]},
                ensure_ascii=False,
            ).encode("utf-8")
            encoding = "latin-1"

            @property
            def text(self):
                return self.content.decode(self.encoding)

            def json(self):
                return json.loads(self.text)

        with patch.object(webapp.requests, "post", return_value=FakeResponse()):
            response = self.client.post(
                "/api/chat/gpt-image-2",
                json={
                    "prompt": "聊一下提示词",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "chat_model": "gpt-5.5",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual("中文回复：可以继续加强剪影。", response.json()["reply"])

    def test_gpt_diagnostics_reports_generation_and_chat_separately(self) -> None:
        calls = []

        class FakeImageResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"data": [{"b64_json": PNG_1X1}]}

        class FakeChatResponse:
            ok = False
            status_code = 401
            text = "bad key sk-test-secret"

            def json(self):
                return {"error": {"message": "bad key sk-test-secret"}}

        def fake_post(url, *_args, **_kwargs):
            calls.append(url)
            if url.endswith("/v1/images/generations"):
                return FakeImageResponse()
            return FakeChatResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/diagnostics",
                json={
                    "engine": "gpt-image-2",
                    "api_key": "sk-test-secret",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "chat_model": "gpt-5.5",
                },
            )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertIn("生图可用，聊天失败", payload["warning"])
        results = {item["capability"]: item for item in payload["results"]}
        self.assertTrue(results["generation"]["ok"])
        self.assertFalse(results["chat"]["ok"])
        self.assertEqual("gpt-image-2", results["generation"]["model"])
        self.assertEqual("gpt-5.5", results["chat"]["model"])
        self.assertEqual("https://example.com", results["generation"]["endpoint"])
        self.assertEqual("https://example.com", results["chat"]["endpoint"])
        self.assertNotIn("sk-test-secret", json.dumps(payload, ensure_ascii=False))
        self.assertEqual(
            [
                "https://example.com/v1/images/generations",
                "https://example.com/v1/chat/completions",
            ],
            calls,
        )

    def test_diagnostics_redacts_secrets_from_returned_endpoint(self) -> None:
        class FakeImageResponse:
            ok = False
            status_code = 401
            text = "bad key sk-test-secret"

            def json(self):
                return {"error": {"message": "bad key sk-test-secret"}}

        with patch.object(webapp.requests, "post", return_value=FakeImageResponse()):
            response = self.client.post(
                "/api/diagnostics",
                json={
                    "engine": "gpt-image-2",
                    "checks": ["generation"],
                    "api_key": "sk-test-secret",
                    "base_url": "https://url-token@example.com/v1?api_key=query-secret",
                    "model": "gpt-image-2",
                },
            )

        self.assertEqual(200, response.status_code)
        payload_text = json.dumps(response.json(), ensure_ascii=False)
        self.assertNotIn("sk-test-secret", payload_text)
        self.assertNotIn("url-token", payload_text)
        self.assertNotIn("query-secret", payload_text)
        self.assertNotIn("/v1", payload_text)
        self.assertNotIn("api_key", payload_text)
        self.assertIn("https://example.com", payload_text)

    def test_banana_chat_forwards_conversation_context(self) -> None:
        captured = {}

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"text": "可以继续加强剪影。"}],
                            }
                        }
                    ]
                }

        class FakeSession:
            def post(self, *_args, **kwargs):
                captured["json"] = kwargs["json"]
                return FakeResponse()

        with patch.object(webapp, "create_requests_session", return_value=FakeSession()):
            response = self.client.post(
                "/api/chat/banana",
                json={
                    "prompt": "那下一轮呢？",
                    "api_key": "sk-test",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                    "messages": [
                        {"role": "user", "content": "做一个火焰冲击波。"},
                        {"role": "assistant", "content": "重点放在圆形范围和中心亮点。"},
                    ],
                },
            )

        self.assertEqual(200, response.status_code)
        contents = captured["json"]["contents"]
        self.assertEqual(
            [
                ("user", "做一个火焰冲击波。"),
                ("model", "重点放在圆形范围和中心亮点。"),
                ("user", "那下一轮呢？"),
            ],
            [(item["role"], item["parts"][0]["text"]) for item in contents],
        )

    def test_gpt_generation_prepends_context_prompt(self) -> None:
        captured = {}

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"data": [{"b64_json": PNG_1X1}]}

        def fake_post(*_args, **kwargs):
            captured["json"] = kwargs["json"]
            return FakeResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "生成第二版",
                    "context_prompt": "上一轮方向：蓝色闪电刀光，边缘高光更强。",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "size": "auto",
                    "quality": "auto",
                    "n": "1",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertIn("当前会话上下文", captured["json"]["prompt"])
        self.assertIn("蓝色闪电刀光", captured["json"]["prompt"])
        self.assertTrue(captured["json"]["prompt"].rstrip().endswith("生成第二版"))

    def test_gpt_generation_defaults_quality_to_auto(self) -> None:
        captured = {}

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"data": [{"b64_json": PNG_1X1}]}

        def fake_post(*_args, **kwargs):
            captured["json"] = kwargs["json"]
            return FakeResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "默认质量生成",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "size": "auto",
                    "n": "1",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertNotIn("quality", captured["json"])

    def test_gpt_generation_retries_remaining_images_when_upstream_returns_fewer_than_requested(self) -> None:
        requests = []

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"data": [{"b64_json": PNG_1X1}], "usage": {"total_tokens": 10}}

        def fake_post(*_args, **kwargs):
            requests.append(dict(kwargs["json"]))
            return FakeResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "两张测试图",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "size": "auto",
                    "n": "2",
                },
            )

        payload = response.json()
        self.assertEqual(200, response.status_code)
        self.assertEqual(2, len(requests))
        self.assertEqual(2, requests[0]["n"])
        self.assertEqual(1, requests[1]["n"])
        self.assertEqual(2, len(payload["images"]))
        self.assertEqual(2, payload["meta"]["image_count"])
        self.assertEqual(20, payload["meta"]["tokens_used"])

    def test_yuzapi_image_requests_use_image_host(self) -> None:
        self.assertEqual(
            "https://image.yuzapi.fun/v1/images/generations",
            webapp.build_gpt_api_url("https://yuzapi.fun", "/v1/images/generations"),
        )
        self.assertEqual(
            "https://image.yuzapi.fun/v1/responses",
            webapp.build_gpt_api_url("https://yuzapi.fun/v1", "/v1/responses"),
        )

    def test_yuzapi_chat_requests_use_main_host(self) -> None:
        self.assertEqual(
            "https://yuzapi.fun/v1/chat/completions",
            webapp.build_openai_chat_url("https://yuzapi.fun"),
        )
        self.assertEqual(
            "https://yuzapi.fun/v1/chat/completions",
            webapp.build_openai_chat_url("https://image.yuzapi.fun"),
        )

    def test_non_yuzapi_urls_keep_existing_host(self) -> None:
        self.assertEqual(
            "https://example.com/v1/images/generations",
            webapp.build_gpt_api_url("https://example.com/v1", "/v1/images/generations"),
        )
        self.assertEqual(
            "https://image.example.com/v1/chat/completions",
            webapp.build_openai_chat_url("https://image.example.com/v1"),
        )

    def test_yuzapi_generation_falls_back_to_main_host_on_network_error(self) -> None:
        urls = []

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"data": [{"b64_json": PNG_1X1}]}

        def fake_post(url, *_args, **_kwargs):
            urls.append(url)
            if url.startswith("https://image.yuzapi.fun/"):
                raise webapp.requests.ConnectionError("image host unavailable")
            return FakeResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "带回退生成",
                    "api_key": "sk-test",
                    "base_url": "https://yuzapi.fun",
                    "model": "gpt-image-2",
                    "size": "auto",
                    "n": "1",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(
            [
                "https://image.yuzapi.fun/v1/images/generations",
                "https://yuzapi.fun/v1/images/generations",
            ],
            urls,
        )
        self.assertEqual("yuzapi.fun", response.json()["meta"]["api_url"])

    def test_gpt_generation_reports_upstream_524_timeout_clearly(self) -> None:
        class FakeResponse:
            ok = False
            status_code = 524
            text = "<html><body>Cloudflare timeout</body></html>"

            def json(self):
                raise ValueError("not json")

        with patch.object(webapp.requests, "post", return_value=FakeResponse()):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "测试上游超时",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "size": "auto",
                    "n": "1",
                },
            )

        self.assertEqual(504, response.status_code)
        self.assertEqual(
            {
                "detail": webapp.CLIENT_ERROR_DETAILS["E_UPSTREAM_TIMEOUT"],
                "error_code": "E_UPSTREAM_TIMEOUT",
            },
            response.json(),
        )

    def test_gpt_generation_uses_ascii_multipart_filename_for_reference_upload(self) -> None:
        captured = {}

        class FakeResponse:
            ok = True
            status_code = 200
            text = ""

            def json(self):
                return {"data": [{"b64_json": PNG_1X1}]}

        def fake_post(*_args, **kwargs):
            captured["files"] = kwargs["files"]
            return FakeResponse()

        with patch.object(webapp.requests, "post", side_effect=fake_post):
            response = self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "用参考图生成一版",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "size": "auto",
                    "n": "1",
                },
                files={
                    "reference_files": (
                        "参考图.png",
                        io.BytesIO(base64.b64decode(PNG_1X1)),
                        "image/png",
                    )
                },
            )

        self.assertEqual(200, response.status_code)
        request_filename = captured["files"][0][1][0]
        request_filename.encode("ascii")
        self.assertNotIn("参考图", request_filename)
