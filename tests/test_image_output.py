import base64
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

import app as webapp


def image_bytes(animated=True):
    buffer = io.BytesIO()
    first = Image.new("RGB", (32, 32), "red")
    if animated:
        first.save(buffer, format="GIF", save_all=True, append_images=[Image.new("RGB", (32, 32), "blue")], duration=200, loop=0)
    else:
        first.save(buffer, format="PNG")
    return buffer.getvalue()


def response(payload, status=200):
    result = webapp.requests.Response()
    result.status_code = status
    result._content = json.dumps(payload).encode("utf-8")
    result.headers["Content-Type"] = "application/json"
    return result


class ImageOutputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.outputs = self.root / "outputs"
        static = self.root / "static"
        (static / "studio" / "assets").mkdir(parents=True)
        (static / "index.html").write_text("classic", encoding="utf-8")
        values = {
            "ROOT_DIR": self.root, "STATIC_DIR": static, "STUDIO_STATIC_DIR": static / "studio",
            "OUTPUTS_DIR": self.outputs, "HISTORY_FILE": self.outputs / "history.json",
            "STUDIO_SESSIONS_FILE": self.outputs / "studio_sessions.json",
            "PRIMARY_CONFIG_FILE": self.root / "config.local.json",
            "CONFIG_FILE_CANDIDATES": [self.root / "config.local.json"],
        }
        self.patchers = [patch.object(webapp, name, value) for name, value in values.items()]
        self.patchers.append(patch.dict(os.environ, {"IMAGE_TOOL_DESKTOP_MODE": "", "IMAGE_TOOL_DESKTOP_TOKEN": ""}))
        for item in self.patchers: item.start()
        self.client = TestClient(webapp.create_app())

    def tearDown(self):
        self.client.close()
        for item in reversed(self.patchers): item.stop()
        self.temp.cleanup()

    def generate(self, **fields):
        files = fields.pop("files", None)
        return self.client.post("/api/generate/gpt-image-2", data={
            "api_key": "sk-test", "base_url": "https://relay.example", "model": "「YQ」gpt-image-2.6-sunburst",
            "prompt": "小狗挥手，无缝循环", **fields,
        }, files=files)

    def gif_response(self):
        return response({"data": [{"b64_json": base64.b64encode(image_bytes()).decode()}]})

    def test_gif_parameters_save_download_and_history_preserve_animation(self):
        with patch.object(webapp.requests, "post", return_value=self.gif_response()) as upstream:
            result = self.generate(output_format="gif", frame_count=9, frame_duration_ms=200).json()
        self.assertTrue(result["ok"], result)
        payload = upstream.call_args.kwargs["json"]
        self.assertEqual(("gif", 9, 200), (payload["output_format"], payload["frame_count"], payload["frame_duration_ms"]))
        self.assertTrue(result["meta"]["gif_validation"]["valid"])
        image = result["images"][0]
        self.assertTrue(image["saved_name"].endswith(".gif"))
        saved = (self.outputs / image["saved_name"]).read_bytes()
        self.assertEqual(image_bytes(), saved)
        downloaded = self.client.get(image["saved_url"] + "?download=1")
        self.assertEqual(saved, downloaded.content)
        self.assertIn("image/gif", downloaded.headers["content-type"])
        self.assertEqual(2, Image.open(io.BytesIO(downloaded.content)).n_frames)
        self.assertEqual("gif", result["history_entry"]["form_state"]["output_format"])

    def test_auto_preserves_old_request_and_ignores_stale_frame_settings(self):
        with patch.object(webapp.requests, "post", return_value=self.gif_response()) as upstream:
            self.generate(frame_count=99, frame_duration_ms=0)
        sent = upstream.call_args.kwargs["json"]
        self.assertNotIn("output_format", sent)
        self.assertNotIn("frame_count", sent)

    def test_responses_places_extensions_and_format_inside_image_tool(self):
        with patch.object(webapp.requests, "post", return_value=self.gif_response()) as upstream:
            result = self.generate(api_endpoint="/v1/responses", output_format="gif", extra_body='{"complexity":"low","future":{"level":2}}')
        self.assertTrue(result.json()["ok"])
        sent = upstream.call_args.kwargs["json"]
        self.assertNotIn("complexity", sent)
        self.assertEqual("gif", sent["tools"][0]["output_format"])
        self.assertEqual({"level": 2}, sent["tools"][0]["future"])

    def test_reference_edit_encodes_nested_extensions_as_json_multipart(self):
        with patch.object(webapp.requests, "post", return_value=self.gif_response()) as upstream:
            result = self.generate(output_format="gif", extra_body='{"future":{"enabled":true},"flag":false,"optional":null}', files={"reference_files": ("reference.png", image_bytes(False), "image/png")})
        self.assertTrue(result.json()["ok"], result.text)
        self.assertTrue(upstream.call_args.args[0].endswith("/images/edits"))
        sent = upstream.call_args.kwargs["data"]
        self.assertEqual({"enabled": True}, json.loads(sent["future"]))
        self.assertEqual("false", sent["flag"])
        self.assertEqual("null", sent["optional"])
        self.assertEqual("gif", sent["output_format"])

    def test_invalid_extensions_or_gif_settings_never_reach_upstream(self):
        cases = [
            {"extra_body": "[]"}, {"extra_body": "{bad}"}, {"extra_body": '{"model":"other"}'},
            {"extra_body": '{"stream":true}'}, {"extra_body": '{"x":NaN}'}, {"extra_body": '{"x":1e999}'},
            {"extra_body": '{"x":"' + "x" * 17000 + '"}'}, {"output_format": "svg"},
            {"output_format": "gif", "frame_count": 17}, {"output_format": "gif", "frame_duration_ms": 10},
            {"output_format": "gif", "extra_body": '{"output_compression":50}'},
        ]
        for fields in cases:
            with self.subTest(fields=list(fields)), patch.object(webapp.requests, "post") as upstream:
                self.assertEqual(400, self.generate(**fields).status_code)
                upstream.assert_not_called()

    def test_explicit_extensions_and_animation_settings_are_not_silently_dropped(self):
        for name, fields in [("complexity", {"extra_body": '{"complexity":"low"}'}), ("frame_count", {"output_format": "gif"})]:
            with self.subTest(name=name), patch.object(webapp.requests, "post", return_value=response({"error": {"message": f"Unknown parameter: '{name}'"}}, 400)) as upstream:
                result = self.generate(**fields)
            self.assertEqual(400, result.status_code)
            self.assertEqual(1, upstream.call_count)

    def test_static_upstream_result_is_retained_but_not_reported_as_gif_success(self):
        reply = response({"data": [{"b64_json": base64.b64encode(image_bytes(False)).decode()}]})
        with patch.object(webapp.requests, "post", return_value=reply) as upstream:
            result = self.generate(output_format="gif").json()
        self.assertFalse(result["ok"])
        self.assertFalse(result["meta"]["gif_validation"]["valid"])
        self.assertIn("不是有效多帧 GIF", result["meta"]["empty_result_reason"])
        self.assertEqual(1, upstream.call_count)
        self.assertTrue((self.outputs / result["images"][0]["saved_name"]).exists())

    def test_extensions_persist_in_profile_and_history_with_json_types(self):
        extra = '{"complexity":"low","future":{"enabled":true}}'
        normalized = webapp.normalize_config_form("gpt-image-2-form", {"base_url": "https://relay.example", "extra_body": extra})
        self.assertEqual(extra, normalized["extra_body"])
        with patch.object(webapp.requests, "post", return_value=self.gif_response()) as upstream:
            result = self.generate(extra_body=extra).json()
        self.assertEqual({"enabled": True}, upstream.call_args.kwargs["json"]["future"])
        self.assertEqual(extra, result["history_entry"]["form_state"]["extra_body"])
