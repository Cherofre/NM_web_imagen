import base64
import json
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


class StudioSessionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.outputs = self.root / "outputs"
        (self.root / "static" / "studio").mkdir(parents=True, exist_ok=True)
        (self.root / "static" / "index.html").write_text("<div>classic</div>", encoding="utf-8")
        (self.root / "static" / "studio" / "index.html").write_text("<div>studio</div>", encoding="utf-8")
        patches = {
            "ROOT_DIR": self.root,
            "STATIC_DIR": self.root / "static",
            "STUDIO_STATIC_DIR": self.root / "static" / "studio",
            "OUTPUTS_DIR": self.outputs,
            "HISTORY_FILE": self.outputs / "history.json",
            "STUDIO_SESSIONS_FILE": self.outputs / "studio_sessions.json",
            "SESSION_REFS_DIR": self.outputs / "session_refs",
        }
        self.patchers = [patch.object(webapp, key, value) for key, value in patches.items()]
        for item in self.patchers:
            item.start()
        self.client = TestClient(webapp.create_app())

    def tearDown(self) -> None:
        for item in reversed(self.patchers):
            item.stop()
        self.temp_dir.cleanup()

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
