import base64
import io
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

    def test_index_disables_cache(self) -> None:
        response = self.client.get("/")
        cache_control = response.headers.get("cache-control", "")

        self.assertEqual(200, response.status_code)
        for token in ["no-store", "no-cache", "must-revalidate", "max-age=0"]:
            self.assertIn(token, cache_control)
        self.assertEqual("no-cache", response.headers.get("pragma"))
        self.assertEqual("0", response.headers.get("expires"))

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
        self.assertEqual("https://yuzapi.fun/v1/images/generations", response.json()["meta"]["api_url"])

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

        self.assertEqual(502, response.status_code)
        detail = response.json()["detail"]
        self.assertIn("524", detail)
        self.assertIn("上游网关超时", detail)
        self.assertIn("稍后重试", detail)

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
