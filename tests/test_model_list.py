import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as webapp


class FakeModelResponse:
    def __init__(self, payload=None, status_code=200, content=None) -> None:
        self.payload = payload
        self.status_code = status_code
        self.ok = status_code < 400
        if content is None:
            content = json.dumps(payload).encode("utf-8") if payload is not None else b""
        self.content = content
        self.text = content.decode("utf-8", errors="replace")

    def json(self):
        if self.payload is None:
            raise ValueError("no json payload")
        return self.payload


class ModelListEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.outputs = self.root / "outputs"
        self.static = self.root / "static"
        (self.static / "studio" / "assets").mkdir(parents=True, exist_ok=True)
        (self.static / "index.html").write_text("<div>classic</div>", encoding="utf-8")
        self.config_path = self.root / "config.local.json"

        values = {
            "ROOT_DIR": self.root,
            "STATIC_DIR": self.static,
            "STUDIO_STATIC_DIR": self.static / "studio",
            "OUTPUTS_DIR": self.outputs,
            "PRIMARY_CONFIG_FILE": self.config_path,
            "CONFIG_FILE_CANDIDATES": [self.config_path],
        }
        self.patchers = [patch.object(webapp, name, value) for name, value in values.items()]
        for item in self.patchers:
            item.start()
        self.environment = patch.dict(os.environ, {"IMAGE_TOOL_DESKTOP_MODE": ""})
        self.environment.start()
        self.client = TestClient(webapp.create_app())

    def tearDown(self) -> None:
        self.client.close()
        for item in reversed(self.patchers):
            item.stop()
        self.environment.stop()
        self.temp_dir.cleanup()

    def test_model_list_returns_deduped_upstream_models_without_the_api_key(self) -> None:
        payload = {
            "object": "list",
            "data": [{"id": "「YS」gpt-image-2.5-flare"}, {"id": "「YS」gpt-image-2.5-sunburst"}, {"id": "「YS」gpt-image-2.5-flare"}],
        }
        with patch.object(webapp.requests, "get", return_value=FakeModelResponse(payload)) as upstream_get:
            response = self.client.post(
                "/api/models",
                json={
                    "engine": "gpt-image-2",
                    "base_url": "http://relay.local:12001",
                    "api_key": "sk-model-list-secret",
                },
            )

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(["「YS」gpt-image-2.5-flare", "「YS」gpt-image-2.5-sunburst"], body["models"])
        self.assertEqual(2, body["count"])
        self.assertNotIn("sk-model-list-secret", response.text)
        self.assertNotIn("sk-model-list-secret", json.dumps(body, ensure_ascii=False))

        upstream_get.assert_called_once()
        url = upstream_get.call_args.args[0]
        self.assertEqual("http://relay.local:12001/v1/models", url)
        headers = upstream_get.call_args.kwargs["headers"]
        self.assertEqual("Bearer sk-model-list-secret", headers["Authorization"])

    def test_gemini_side_reads_the_same_catalogue_with_its_own_address_field(self) -> None:
        payload = {
            "object": "list",
            "data": [
                {"id": "gemini-3-pro-image-preview"},
                {"id": "gemini-2.5-flash-image"},
                {"id": "gemini-3-pro-image-preview"},
            ],
        }
        with patch.object(webapp.requests, "get", return_value=FakeModelResponse(payload)) as upstream_get:
            response = self.client.post(
                "/api/models",
                json={
                    "engine": "banana",
                    "api_base_url": "http://relay.local:12001",
                    "api_key": "sk-gemini-secret",
                },
            )

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertTrue(body["ok"])
        self.assertEqual(["gemini-3-pro-image-preview", "gemini-2.5-flash-image"], body["models"])
        self.assertNotIn("sk-gemini-secret", response.text)
        self.assertEqual("http://relay.local:12001/v1/models", upstream_get.call_args.args[0])

    def test_gemini_model_options_are_normalized_and_saved(self) -> None:
        normalized = webapp.normalize_config_form(
            "banana-form",
            {
                "api_base_url": "http://relay.local:12001",
                "api_key": "sk-secret",
                "model_type": "gemini-3-pro-image-preview",
                "model_type_options": ["gemini-2.5-flash-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
            },
        )
        self.assertEqual(
            "gemini-2.5-flash-image\ngemini-3-pro-image-preview",
            normalized["model_type_options"],
        )

    def test_model_list_requires_an_api_key_before_calling_upstream(self) -> None:
        with patch.object(webapp.requests, "get") as upstream_get:
            response = self.client.post(
                "/api/models",
                json={"base_url": "http://relay.local:12001", "api_key": "   "},
            )

        self.assertEqual(200, response.status_code)
        body = response.json()
        self.assertFalse(body["ok"])
        self.assertEqual("E_UPSTREAM_AUTH", body["error_code"])
        self.assertEqual(401, body["status_code"])
        self.assertEqual([], body["models"])
        upstream_get.assert_not_called()

    def test_model_list_maps_upstream_failures_to_client_error_codes(self) -> None:
        cases = [
            (FakeModelResponse({"error": {"message": "bad key"}}, 401), "E_UPSTREAM_AUTH"),
            (FakeModelResponse({"error": {"message": "slow down"}}, 429), "E_UPSTREAM_RATE_LIMIT"),
            (FakeModelResponse({"error": {"message": "nope"}}, 404), "E_UPSTREAM_REQUEST"),
            (FakeModelResponse({"error": {"message": "boom"}}, 500), "E_UPSTREAM_RESPONSE"),
        ]
        for upstream_response, expected_code in cases:
            with self.subTest(expected_code=expected_code):
                with patch.object(webapp.requests, "get", return_value=upstream_response):
                    response = self.client.post(
                        "/api/models",
                        json={"base_url": "http://relay.local:12001", "api_key": "sk-x"},
                    )
                body = response.json()
                self.assertFalse(body["ok"])
                self.assertEqual(expected_code, body["error_code"])
                self.assertEqual([], body["models"])

    def test_model_list_maps_network_and_timeout_failures(self) -> None:
        import requests as requests_module

        cases = [
            (requests_module.Timeout("timed out"), "E_UPSTREAM_TIMEOUT", 504),
            (requests_module.ConnectionError("refused"), "E_UPSTREAM_NETWORK", 502),
        ]
        for error, expected_code, expected_status in cases:
            with self.subTest(expected_code=expected_code):
                with patch.object(webapp.requests, "get", side_effect=error):
                    response = self.client.post(
                        "/api/models",
                        json={"base_url": "http://relay.local:12001", "api_key": "sk-x"},
                    )
                body = response.json()
                self.assertFalse(body["ok"])
                self.assertEqual(expected_code, body["error_code"])
                self.assertEqual(expected_status, body["status_code"])

    def test_model_list_rejects_non_json_and_empty_catalogues(self) -> None:
        cases = [
            FakeModelResponse(content=b"<!doctype html><title>New API</title>"),
            FakeModelResponse({"object": "list", "data": []}),
            FakeModelResponse({"success": True}),
        ]
        for upstream_response in cases:
            with self.subTest(content=upstream_response.content[:40]):
                with patch.object(webapp.requests, "get", return_value=upstream_response):
                    response = self.client.post(
                        "/api/models",
                        json={"base_url": "http://relay.local:12001", "api_key": "sk-x"},
                    )
                body = response.json()
                self.assertFalse(body["ok"])
                self.assertEqual("E_UPSTREAM_RESPONSE", body["error_code"])
                self.assertEqual([], body["models"])

    def test_model_list_requires_a_base_url(self) -> None:
        with patch.object(webapp.requests, "get") as upstream_get:
            response = self.client.post("/api/models", json={"base_url": "", "api_key": "sk-x"})

        self.assertEqual(400, response.status_code)
        self.assertIn("Base URL", response.json()["detail"])
        upstream_get.assert_not_called()


class ModelOptionsConfigTests(unittest.TestCase):
    def test_model_ids_are_normalized_deduped_and_capped(self) -> None:
        self.assertEqual(
            ["flare", "sunburst"],
            webapp.model_ids_from_values([" flare ", "sunburst", "flare", "", None]),
        )
        self.assertEqual(["a", "b"], webapp.model_ids_from_values([{"id": "a"}, {"name": "b"}, {}]))
        self.assertEqual(["a", "b"], webapp.model_ids_from_values("a\nb\na"))
        self.assertEqual([], webapp.model_ids_from_values(None))
        self.assertEqual(2, len(webapp.model_ids_from_values(["a", "b", "c"], limit=2)))

    def test_model_options_are_encoded_as_a_bounded_newline_string(self) -> None:
        self.assertEqual("flare\nsunburst", webapp.encode_model_options(["flare", "sunburst", "flare"]))
        self.assertEqual("", webapp.encode_model_options([]))
        long_list = [f"model-{index}-{'x' * 60}" for index in range(400)]
        encoded = webapp.encode_model_options(long_list)
        self.assertLessEqual(len(encoded), webapp.MODEL_OPTIONS_MAX_CHARS)
        self.assertLessEqual(len(encoded.split("\n")), webapp.MODEL_LIST_MAX_ITEMS)
        for model_id in encoded.split("\n"):
            self.assertIn(model_id, long_list)

    def test_upstream_model_payloads_are_parsed_from_every_supported_shape(self) -> None:
        self.assertEqual(["a"], webapp.parse_upstream_model_list({"data": [{"id": "a"}]}))
        self.assertEqual(["a", "b"], webapp.parse_upstream_model_list({"models": ["a", "b"]}))
        self.assertEqual(["a"], webapp.parse_upstream_model_list(["a"]))
        self.assertEqual([], webapp.parse_upstream_model_list({"success": True}))
        self.assertEqual([], webapp.parse_upstream_model_list("nonsense"))

    def test_normalized_config_keeps_a_canonical_model_list_per_profile(self) -> None:
        normalized = webapp.normalize_config_payload(
            {
                "active_engine": "gpt-image-2",
                "active_profile_ids": {"gpt-image-2": "flare-profile", "banana": "banana-default"},
                "profiles": [
                    {
                        "id": "flare-profile",
                        "engine": "gpt-image-2",
                        "name": "YS",
                        "form": {
                            "base_url": "http://relay.local:12001",
                            "api_key": "sk-secret",
                            "model": "「YS」gpt-image-2.5-flare",
                            "model_options": ["flare", "flare", "  sunburst  "],
                        },
                    },
                    {
                        "id": "other-profile",
                        "engine": "gpt-image-2",
                        "name": "other",
                        "form": {
                            "base_url": "http://other.local",
                            "api_key": "sk-other",
                            "model": "gpt-image-2",
                            "model_options": "alpha\nalpha\nbeta",
                        },
                    },
                ],
            }
        )

        forms = {profile["id"]: profile["form"] for profile in normalized["profiles"]}
        self.assertEqual("flare\nsunburst", forms["flare-profile"]["model_options"])
        self.assertEqual("alpha\nbeta", forms["other-profile"]["model_options"])
        self.assertEqual("flare\nsunburst", normalized["forms"]["gpt-image-2-form"]["model_options"])

    def test_config_file_round_trip_keeps_model_options(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "config.local.json"
            with patch.object(webapp, "PRIMARY_CONFIG_FILE", config_path), patch.object(
                webapp, "ROOT_DIR", root
            ), patch.dict(os.environ, {"IMAGE_TOOL_DESKTOP_MODE": ""}):
                with TestClient(webapp.create_app()) as client:
                    response = client.post(
                        "/api/config/local-file",
                        json={
                            "active_engine": "gpt-image-2",
                            "active_profile_ids": {"gpt-image-2": "p1", "banana": "banana-default"},
                            "profiles": [
                                {
                                    "id": "p1",
                                    "engine": "gpt-image-2",
                                    "name": "YS",
                                    "form": {
                                        "base_url": "http://relay.local:12001",
                                        "api_key": "sk-secret",
                                        "model": "flare",
                                        "model_options": "flare\nsunburst",
                                    },
                                }
                            ],
                        },
                    )

            self.assertEqual(200, response.status_code)
            written = json.loads(config_path.read_text(encoding="utf-8"))
            profile = next(item for item in written["profiles"] if item["id"] == "p1")
            self.assertEqual("flare\nsunburst", profile["form"]["model_options"])
            self.assertEqual("flare\nsunburst", written["forms"]["gpt-image-2-form"]["model_options"])

    def test_config_defaults_return_the_cached_model_list(self) -> None:
        """The drawer and composer hydrate from /api/config/defaults, so a saved
        model catalogue must survive a reload instead of collapsing to one id."""
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "config.local.json"
            outputs = root / "outputs"
            static = root / "static"
            (static / "studio" / "assets").mkdir(parents=True, exist_ok=True)
            (static / "index.html").write_text("<div>classic</div>", encoding="utf-8")
            config_path.write_text(
                json.dumps(
                    {
                        "version": 2,
                        "active_engine": "gpt-image-2",
                        "active_profile_ids": {"gpt-image-2": "p1"},
                        "profiles": [
                            {
                                "id": "p1",
                                "engine": "gpt-image-2",
                                "name": "YS",
                                "form": {
                                    "base_url": "http://relay.local:12001",
                                    "api_key": "sk-secret",
                                    "model": "flare",
                                    "model_options": "flare\nsunburst",
                                },
                            }
                        ],
                        "forms": {
                            "gpt-image-2-form": {"model": "flare", "model_options": "flare\nsunburst"}
                        },
                    }
                ),
                encoding="utf-8",
            )
            with patch.object(webapp, "PRIMARY_CONFIG_FILE", config_path), patch.object(
                webapp, "ROOT_DIR", root
            ), patch.object(webapp, "CONFIG_FILE_CANDIDATES", [config_path]), patch.object(
                webapp, "OUTPUTS_DIR", outputs
            ), patch.object(webapp, "STATIC_DIR", static), patch.object(
                webapp, "STUDIO_STATIC_DIR", static / "studio"
            ), patch.dict(os.environ, {"IMAGE_TOOL_DESKTOP_MODE": ""}):
                with TestClient(webapp.create_app()) as client:
                    payload = client.get("/api/config/defaults").json()

        self.assertTrue(payload["ok"])
        self.assertEqual("flare\nsunburst", payload["forms"]["gpt-image-2-form"]["model_options"])
        profile = next(item for item in payload["profiles"] if item["id"] == "p1")
        self.assertEqual("flare\nsunburst", profile["form"]["model_options"])

    def test_credential_ref_is_a_shared_switch_between_engines(self) -> None:
        for raw, expected in [
            ("shared", "shared"),
            (" shared ", "shared"),
            ("gpt-image-2", "shared"),
            ("banana", "shared"),
            ("banana-form", ""),
            ("", ""),
            (None, ""),
        ]:
            with self.subTest(raw=raw):
                self.assertEqual(expected, webapp.encode_credential_ref(raw))
        normalized = webapp.normalize_config_payload(
            {
                "active_engine": "banana",
                "profiles": [
                    {
                        "id": "b1",
                        "engine": "banana",
                        "name": "Gemini",
                        "form": {
                            "api_base_url": "http://relay.local:12001",
                            "api_key": "sk-secret",
                            "model_type": "gemini-3-pro-image-preview",
                            "credential_ref": "shared",
                        },
                    }
                ],
            }
        )
        profile = next(item for item in normalized["profiles"] if item["id"] == "b1")
        self.assertEqual("shared", profile["form"]["credential_ref"])
        self.assertEqual("shared", normalized["forms"]["banana-form"]["credential_ref"])

    def test_keyless_exported_config_can_be_imported_and_saved(self) -> None:
        """Export/import shares everything but the key, so the endpoint must accept
        profiles whose api_key is blank and keep them blank on disk."""
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "config.local.json"
            with patch.object(webapp, "PRIMARY_CONFIG_FILE", config_path), patch.object(
                webapp, "ROOT_DIR", root
            ), patch.dict(os.environ, {"IMAGE_TOOL_DESKTOP_MODE": ""}):
                with TestClient(webapp.create_app()) as client:
                    response = client.post(
                        "/api/config/local-file",
                        json={
                            "active_engine": "gpt-image-2",
                            "active_profile_ids": {"gpt-image-2": "shared", "banana": "banana-default"},
                            "profiles": [
                                {
                                    "id": "shared",
                                    "engine": "gpt-image-2",
                                    "name": "同事的配置",
                                    "form": {
                                        "base_url": "http://relay.local:12001",
                                        "api_key": "",
                                        "model": "sunburst",
                                        "model_options": "flare\nsunburst",
                                        "chat_model": "gpt-5.6-luna",
                                        "chat_model_options": "luna",
                                        "chat_enabled": "0",
                                    },
                                }
                            ],
                        },
                    )

            self.assertEqual(200, response.status_code)
            written = json.loads(config_path.read_text(encoding="utf-8"))
            profile = next(item for item in written["profiles"] if item["id"] == "shared")
            self.assertEqual("", profile["form"].get("api_key", ""))
            self.assertEqual("flare\nsunburst", profile["form"]["model_options"])
            self.assertEqual("luna", profile["form"]["chat_model_options"])
            self.assertEqual("0", profile["form"]["chat_enabled"])

    def test_shared_pair_and_gemini_catalogue_survive_save_and_reload(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_path = root / "config.local.json"
            gpt = {"base_url": "https://relay.invalid", "api_key": "synthetic",
                   "credential_ref": "shared", "credential_pair_id": "pair-1", "chat_enabled": "0"}
            banana = {"api_base_url": "https://relay.invalid", "api_key": "synthetic",
                      "credential_ref": "shared", "credential_pair_id": "pair-1",
                      "model_type_options": "gemini-a\ngemini-b"}
            payload = {"active_engine": "banana",
                       "active_profile_ids": {"gpt-image-2": "g", "banana": "b"},
                       "profiles": [{"id": "g", "engine": "gpt-image-2", "name": "pair", "form": gpt},
                                    {"id": "b", "engine": "banana", "name": "pair", "form": banana}],
                       "forms": {"gpt-image-2-form": gpt, "banana-form": banana}}
            with patch.object(webapp, "PRIMARY_CONFIG_FILE", config_path), patch.object(
                webapp, "ROOT_DIR", root
            ), patch.dict(os.environ, {"IMAGE_TOOL_DESKTOP_MODE": ""}):
                with TestClient(webapp.create_app()) as client:
                    response = client.post("/api/config/local-file", json=payload)
                    self.assertEqual(200, response.status_code)
            reloaded = webapp.normalize_config_payload(json.loads(config_path.read_text(encoding="utf-8")))
            for form in reloaded["forms"].values():
                self.assertEqual("shared", form["credential_ref"])
                self.assertEqual("pair-1", form["credential_pair_id"])
            self.assertEqual("gemini-a\ngemini-b", reloaded["forms"]["banana-form"]["model_type_options"])
            for profile in reloaded["profiles"]:
                self.assertEqual("pair-1", profile["form"]["credential_pair_id"])

    def test_chat_model_list_and_switch_are_normalized_per_profile(self) -> None:
        normalized = webapp.normalize_config_payload(
            {
                "active_engine": "gpt-image-2",
                "active_profile_ids": {"gpt-image-2": "chatless", "banana": "banana-default"},
                "profiles": [
                    {
                        "id": "chatless",
                        "engine": "gpt-image-2",
                        "name": "只能生图",
                        "form": {
                            "base_url": "http://relay.local:12001",
                            "api_key": "sk-secret",
                            "model": "「YS」gpt-image-2.5-sunburst",
                            "model_options": ["sunburst"],
                            "chat_model": "gpt-5.6-luna",
                            "chat_model_options": ["luna", " luna ", "sol"],
                            "chat_enabled": "false",
                        },
                    },
                    {
                        "id": "with-chat",
                        "engine": "gpt-image-2",
                        "name": "有聊天",
                        "form": {
                            "base_url": "http://other.local",
                            "api_key": "sk-other",
                            "model": "gpt-image-2",
                            "chat_model": "gpt-5.6-sol",
                        },
                    },
                ],
            }
        )

        forms = {profile["id"]: profile["form"] for profile in normalized["profiles"]}
        self.assertEqual("luna\nsol", forms["chatless"]["chat_model_options"])
        self.assertEqual("0", forms["chatless"]["chat_enabled"])
        # A profile that never touched the switch keeps no key at all, which every
        # reader treats as enabled.
        self.assertNotIn("chat_enabled", forms["with-chat"])
        self.assertNotIn("chat_model_options", forms["with-chat"])
        self.assertEqual("luna\nsol", normalized["forms"]["gpt-image-2-form"]["chat_model_options"])
        self.assertEqual("0", normalized["forms"]["gpt-image-2-form"]["chat_enabled"])

    def test_chat_switch_normalizer_accepts_the_shapes_clients_send(self) -> None:
        cases = [
            (None, ""),
            ("", ""),
            (True, "1"),
            (False, "0"),
            ("on", "1"),
            ("off", "0"),
            ("0", "0"),
            ("1", "1"),
            ("nonsense", ""),
        ]
        for raw, expected in cases:
            with self.subTest(raw=raw):
                self.assertEqual(expected, webapp.encode_switch_flag(raw))

    def test_an_absent_switch_does_not_make_a_form_look_populated(self) -> None:
        """`build_config_profiles` hands the top-level form to the active profile
        whenever that form is non-empty, so a switch with a hardcoded default would
        silently replace a profile's fields with nothing but that switch."""
        self.assertEqual({}, webapp.normalize_config_form("gpt-image-2-form", {}))
        normalized = webapp.normalize_config_payload(
            {
                "active_engine": "gpt-image-2",
                "profiles": [
                    {
                        "id": "p1",
                        "engine": "gpt-image-2",
                        "name": "YS",
                        "form": {
                            "base_url": "http://relay.local:12001",
                            "api_key": "sk-secret",
                            "model": "sunburst",
                            "model_options": ["sunburst"],
                        },
                    }
                ],
            }
        )
        profile = next(item for item in normalized["profiles"] if item["id"] == "p1")
        self.assertEqual("sunburst", profile["form"]["model"])
        self.assertEqual("sunburst", profile["form"]["model_options"])
        self.assertEqual("sunburst", normalized["forms"]["gpt-image-2-form"]["model_options"])

    def test_generation_payloads_never_carry_the_cached_chat_settings(self) -> None:
        """`chat_model_options`/`chat_enabled` are drawer state: sending them to
        the upstream image call would only bloat the multipart payload."""
        source = Path(webapp.__file__).read_text(encoding="utf-8")
        self.assertNotIn('payload.get("chat_model_options")', source)
        self.assertNotIn('payload.get("chat_enabled")', source)
        normalized = webapp.normalize_config_form(
            "gpt-image-2-form",
            {"model": "m", "model_options": "m", "chat_model_options": "c", "chat_enabled": "0"},
        )
        self.assertEqual(
            {"model", "model_options", "chat_model_options", "chat_enabled"},
            set(normalized),
        )


if __name__ == "__main__":
    unittest.main()
