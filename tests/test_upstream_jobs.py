import base64
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


class BananaUpstreamContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(webapp.create_app())

    def test_generation_diagnostic_uses_complete_banana_contract(self) -> None:
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

        class FakeSession:
            def post(self, url, **kwargs):
                captured["url"] = url
                captured.update(kwargs)
                return FakeResponse()

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
        self.assertEqual("banana-test-key", captured["headers"]["x-goog-api-key"])
        self.assertEqual("Bearer banana-test-key", captured["headers"]["Authorization"])
        self.assertEqual("banana-test-key", captured["headers"]["X-API-Key"])
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

    def test_all_banana_request_paths_reuse_the_shared_headers(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "app.py").read_text(encoding="utf-8")

        self.assertGreaterEqual(source.count("headers=banana_headers(api_key)"), 4)


if __name__ == "__main__":
    unittest.main()
