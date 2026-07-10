import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as webapp


PNG_1X1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfeA\x89\x81\xb5"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


class FakeBananaImageResponse:
    ok = True
    status_code = 200
    text = ""

    def json(self):
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": "image/png",
                                    "data": PNG_1X1,
                                }
                            }
                        ]
                    }
                }
            ]
        }


class FakeBananaTextResponse:
    ok = True
    status_code = 200
    text = ""

    def json(self):
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [{"text": "OK"}],
                    }
                }
            ]
        }


class BananaUpstreamContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.outputs = self.root / "outputs"
        (self.root / "static" / "studio" / "assets").mkdir(parents=True, exist_ok=True)
        (self.root / "static" / "index.html").write_text("<div>classic</div>", encoding="utf-8")
        (self.root / "static" / "studio" / "index.html").write_text("<div>studio</div>", encoding="utf-8")
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

    def assert_complete_banana_headers(self, headers) -> None:
        self.assertEqual("application/json", headers["Accept"])
        self.assertEqual("application/json", headers["Content-Type"])
        self.assertEqual("Bearer banana-test-key", headers["Authorization"])
        self.assertEqual("banana-test-key", headers["X-API-Key"])
        self.assertEqual("banana-test-key", headers["x-goog-api-key"])
        self.assertEqual("image-generate-web-tool", headers["X-Banana-Client"])

    def test_generation_diagnostic_uses_complete_banana_contract(self) -> None:
        captured = {}

        class FakeSession:
            def post(self, url, **kwargs):
                captured["url"] = url
                captured.update(kwargs)
                return FakeBananaImageResponse()

        with patch.object(webapp, "create_requests_session", return_value=FakeSession()) as session_factory:
            response = self.client.post(
                "/api/diagnostics",
                json={
                    "engine": "banana",
                    "checks": ["generation"],
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["results"][0]["ok"])
        session_factory.assert_called_once()
        self.assert_complete_banana_headers(captured["headers"])
        self.assertEqual("IMAGE", captured["json"]["generationConfig"]["responseModalities"][0])
        self.assertIn("IMAGE", captured["json"]["generationConfig"]["responseModalities"])

    def test_banana_headers_include_every_supported_auth_alias(self) -> None:
        self.assertEqual(
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": "Bearer banana-test-key",
                "X-API-Key": "banana-test-key",
                "x-goog-api-key": "banana-test-key",
                "X-Banana-Client": "image-generate-web-tool",
            },
            webapp.banana_headers("banana-test-key"),
        )

    def test_chat_diagnostic_uses_complete_banana_headers(self) -> None:
        captured = {}

        class FakeSession:
            def post(self, url, **kwargs):
                captured["url"] = url
                captured.update(kwargs)
                return FakeBananaTextResponse()

        with patch.object(webapp, "create_requests_session", return_value=FakeSession()):
            response = self.client.post(
                "/api/diagnostics",
                json={
                    "engine": "banana",
                    "checks": ["chat"],
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["results"][0]["ok"])
        self.assert_complete_banana_headers(captured["headers"])

    def test_chat_endpoint_uses_complete_banana_headers(self) -> None:
        captured = {}

        class FakeSession:
            def post(self, url, **kwargs):
                captured["url"] = url
                captured.update(kwargs)
                return FakeBananaTextResponse()

        with patch.object(webapp, "create_requests_session", return_value=FakeSession()):
            response = self.client.post(
                "/api/chat/banana",
                json={
                    "prompt": "hello",
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual("OK", response.json()["reply"])
        self.assert_complete_banana_headers(captured["headers"])

    def test_generation_endpoint_uses_complete_banana_headers(self) -> None:
        captured = {}

        class FakeSession:
            def post(self, url, **kwargs):
                captured["url"] = url
                captured.update(kwargs)
                return FakeBananaImageResponse()

        with patch.object(webapp, "create_requests_session", return_value=FakeSession()):
            response = self.client.post(
                "/api/generate/banana",
                data={
                    "prompt": "simple square",
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                    "batch_size": "1",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(1, len(response.json()["images"]))
        self.assert_complete_banana_headers(captured["headers"])
        self.assertTrue((self.outputs / "history.json").exists())


if __name__ == "__main__":
    unittest.main()
