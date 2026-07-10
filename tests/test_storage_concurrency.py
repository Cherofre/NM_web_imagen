from concurrent.futures import ThreadPoolExecutor
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as webapp
import storage
from storage import atomic_write_json, mutate_json, read_json


class StorageUnitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_eight_workers_mutating_same_path_keep_all_forty_entries(self) -> None:
        target = self.root / "history.json"

        def add_entry(index: int) -> None:
            def mutator(payload):
                entries = list(payload.get("entries", []))
                entries.append({"id": index})
                return {"entries": entries}

            mutate_json(target, {"entries": []}, mutator)

        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(add_entry, index) for index in range(40)]
            for future in futures:
                future.result(timeout=10)

        payload = read_json(target, {"entries": []})
        self.assertEqual(40, len(payload["entries"]))
        self.assertEqual(set(range(40)), {entry["id"] for entry in payload["entries"]})

    def test_second_atomic_write_backs_up_previous_version(self) -> None:
        target = self.root / "config.local.json"
        backup = self.root / "config.local.json.bak"

        atomic_write_json(target, {"version": 1, "name": "第一版"}, backup=True)
        self.assertFalse(backup.exists())

        atomic_write_json(target, {"version": 2, "name": "第二版"}, backup=True)

        self.assertEqual({"version": 1, "name": "第一版"}, read_json(backup, {}))
        self.assertEqual({"version": 2, "name": "第二版"}, read_json(target, {}))

    def test_successful_atomic_write_leaves_no_uuid_temp_files(self) -> None:
        target = self.root / "nested" / "state.json"

        atomic_write_json(target, {"ok": True})

        self.assertTrue(target.read_text(encoding="utf-8").endswith("\n"))
        self.assertEqual([], list(self.root.rglob("*.tmp")))

    def test_atomic_write_retries_transient_permission_error(self) -> None:
        target = self.root / "state.json"
        target.write_text('{"value": "old"}\n', encoding="utf-8")
        original_replace = storage.os.replace
        replace_calls = 0

        def flaky_replace(source, destination) -> None:
            nonlocal replace_calls
            replace_calls += 1
            if replace_calls == 1:
                raise PermissionError(13, "sharing violation")
            original_replace(source, destination)

        with patch.object(storage.os, "replace", side_effect=flaky_replace):
            atomic_write_json(target, {"value": "new"})

        self.assertEqual(2, replace_calls)
        self.assertEqual({"value": "new"}, read_json(target, {}))
        self.assertEqual([], list(self.root.rglob("*.tmp")))

    def test_atomic_write_does_not_retry_non_permission_error(self) -> None:
        target = self.root / "state.json"
        original = '{"value": "old"}\n'
        target.write_text(original, encoding="utf-8")

        with patch.object(storage.os, "replace", side_effect=OSError("disk full")) as replace:
            with self.assertRaisesRegex(OSError, "disk full"):
                atomic_write_json(target, {"value": "new"})

        self.assertEqual(1, replace.call_count)
        self.assertEqual(original, target.read_text(encoding="utf-8"))
        self.assertEqual([], list(self.root.rglob("*.tmp")))

    def test_atomic_write_stops_after_finite_permission_retries(self) -> None:
        target = self.root / "state.json"
        original = '{"value": "old"}\n'
        target.write_text(original, encoding="utf-8")

        with patch.object(
            storage.os,
            "replace",
            side_effect=PermissionError(13, "sharing violation"),
        ) as replace:
            with self.assertRaisesRegex(PermissionError, "sharing violation"):
                atomic_write_json(target, {"value": "new"})

        self.assertEqual(4, replace.call_count)
        self.assertEqual(original, target.read_text(encoding="utf-8"))
        self.assertEqual([], list(self.root.rglob("*.tmp")))

    def test_bad_json_returns_independent_fallback(self) -> None:
        target = self.root / "broken.json"
        target.write_text("{not-json", encoding="utf-8")
        fallback = {"entries": []}

        loaded = read_json(target, fallback)
        loaded["entries"].append({"id": "local"})

        self.assertEqual([], fallback["entries"])
        self.assertEqual("{not-json", target.read_text(encoding="utf-8"))

    def test_mutator_exception_preserves_original_and_cleans_temp_files(self) -> None:
        target = self.root / "state.json"
        original = {"entries": [{"id": "keep"}]}
        atomic_write_json(target, original)

        def fail_mutation(_payload):
            raise RuntimeError("mutator failed")

        with self.assertRaisesRegex(RuntimeError, "mutator failed"):
            mutate_json(target, {"entries": []}, fail_mutation)

        self.assertEqual(original, read_json(target, {}))
        self.assertEqual([], list(self.root.rglob("*.tmp")))

    def test_different_paths_are_not_serialized_by_one_global_lock(self) -> None:
        first = self.root / "first.json"
        second = self.root / "second.json"
        atomic_write_json(first, {"value": 0})
        atomic_write_json(second, {"value": 0})
        both_mutators_entered = threading.Barrier(2)

        def update(path: Path, value: int) -> None:
            def mutator(_payload):
                both_mutators_entered.wait(timeout=3)
                return {"value": value}

            mutate_json(path, {"value": 0}, mutator)

        with ThreadPoolExecutor(max_workers=2) as pool:
            first_future = pool.submit(update, first, 1)
            second_future = pool.submit(update, second, 2)
            first_future.result(timeout=5)
            second_future.result(timeout=5)

        self.assertEqual({"value": 1}, read_json(first, {}))
        self.assertEqual({"value": 2}, read_json(second, {}))

    def test_after_write_hook_runs_before_same_path_lock_is_released(self) -> None:
        target = self.root / "state.json"
        atomic_write_json(target, {"value": 0})
        hook_entered = threading.Event()
        release_hook = threading.Event()
        second_mutator_entered = threading.Event()

        def after_write(_payload) -> None:
            hook_entered.set()
            release_hook.wait(timeout=3)

        def first_write() -> None:
            mutate_json(
                target,
                {"value": 0},
                lambda _payload: {"value": 1},
                after_write=after_write,
            )

        def second_write() -> None:
            def mutator(_payload):
                second_mutator_entered.set()
                return {"value": 2}

            mutate_json(target, {"value": 0}, mutator)

        with ThreadPoolExecutor(max_workers=2) as pool:
            first_future = pool.submit(first_write)
            self.assertTrue(hook_entered.wait(timeout=2))
            second_future = pool.submit(second_write)
            self.assertFalse(second_mutator_entered.wait(timeout=0.1))
            release_hook.set()
            first_future.result(timeout=5)
            second_future.result(timeout=5)

        self.assertEqual({"value": 2}, read_json(target, {}))

    def test_after_write_exception_does_not_report_committed_json_as_failed(self) -> None:
        target = self.root / "state.json"
        atomic_write_json(target, {"value": 0})

        def fail_after_write(_payload) -> None:
            raise RuntimeError("cleanup failed after commit")

        result = mutate_json(
            target,
            {"value": 0},
            lambda _payload: {"value": 1},
            after_write=fail_after_write,
        )

        self.assertEqual({"value": 1}, result)
        self.assertEqual({"value": 1}, read_json(target, {}))


class AppStorageIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.outputs = self.root / "outputs"
        self.static = self.root / "static"
        self.studio = self.static / "studio"
        (self.studio / "assets").mkdir(parents=True, exist_ok=True)
        (self.static / "index.html").write_text("<div>classic</div>", encoding="utf-8")
        (self.studio / "index.html").write_text("<div>studio</div>", encoding="utf-8")
        (self.root / "VERSION").write_text("9.8.7\n", encoding="utf-8")
        self.history_file = self.outputs / "history.json"
        self.config_file = self.root / "config.local.json"

        values = {
            "ROOT_DIR": self.root,
            "STATIC_DIR": self.static,
            "STUDIO_STATIC_DIR": self.studio,
            "OUTPUTS_DIR": self.outputs,
            "VERSION_FILE": self.root / "VERSION",
            "HISTORY_FILE": self.history_file,
            "STUDIO_SESSIONS_FILE": self.outputs / "studio_sessions.json",
            "SESSION_REFS_DIR": self.outputs / "session_refs",
            "PRIMARY_CONFIG_FILE": self.config_file,
            "CONFIG_FILE_CANDIDATES": [self.config_file, self.root / "config.defaults.json"],
        }
        self.patchers = [patch.object(webapp, key, value) for key, value in values.items()]
        for item in self.patchers:
            item.start()
        self.client = TestClient(webapp.create_app())

    def tearDown(self) -> None:
        self.client.close()
        for item in reversed(self.patchers):
            item.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def _config_payload(api_key: str):
        return {
            "active_engine": "banana",
            "forms": {
                "banana-form": {
                    "api_key": api_key,
                    "api_base_url": "https://banana.example.com",
                    "model_type": "banana-model",
                },
                "gpt-image-2-form": {
                    "api_key": f"gpt-{api_key}",
                    "base_url": "https://gpt.example.com/v1",
                    "model": "gpt-image-2",
                    "chat_model": "gpt-5.4",
                },
            },
        }

    @staticmethod
    def _image(index: int):
        name = f"image-{index}.png"
        return {
            "saved_name": name,
            "saved_path": f"outputs/{name}",
            "saved_url": f"/outputs/{name}",
            "mime_type": "image/png",
        }

    def _append_history(self, index: int):
        return webapp.append_generation_history(
            engine="gpt-image-2",
            prompt=f"prompt-{index}",
            images=[self._image(index)],
        )

    def test_config_route_keeps_response_and_backs_up_previous_payload(self) -> None:
        first_response = self.client.post("/api/config/local-file", json=self._config_payload("first-key"))
        self.assertEqual(200, first_response.status_code)
        self.assertEqual({"ok": True, "path": "config.local.json"}, first_response.json())
        first_saved = json.loads(self.config_file.read_text(encoding="utf-8"))

        second_response = self.client.post("/api/config/local-file", json=self._config_payload("second-key"))

        self.assertEqual(200, second_response.status_code)
        self.assertEqual({"ok": True, "path": "config.local.json"}, second_response.json())
        self.assertEqual(first_saved, read_json(self.root / "config.local.json.bak", {}))
        self.assertEqual("second-key", read_json(self.config_file, {})["forms"]["banana-form"]["api_key"])

    def test_forty_concurrent_history_appends_are_parseable_and_lossless(self) -> None:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(self._append_history, index) for index in range(40)]
            entries = [future.result(timeout=15) for future in futures]

        payload = json.loads(self.history_file.read_text(encoding="utf-8"))
        self.assertEqual(1, payload["version"])
        self.assertTrue(payload["updated_at"])
        self.assertEqual(40, len(payload["entries"]))
        self.assertEqual(40, len({entry["id"] for entry in entries}))
        self.assertEqual({f"prompt-{index}" for index in range(40)}, {entry["prompt"] for entry in payload["entries"]})

    def test_history_max_entries_still_applies(self) -> None:
        with patch.object(webapp, "HISTORY_MAX_ENTRIES", 5):
            for index in range(8):
                self._append_history(index)

        payload = read_json(self.history_file, {})
        self.assertEqual(5, len(payload["entries"]))
        self.assertEqual(
            {"prompt-3", "prompt-4", "prompt-5", "prompt-6", "prompt-7"},
            {entry["prompt"] for entry in payload["entries"]},
        )

    def test_concurrent_append_and_favorite_update_preserve_both_changes(self) -> None:
        target = {
            "id": "favorite-target",
            "created_at": "2026-01-01T00:00:00",
            "engine": "gpt-image-2",
            "favorite": False,
            "prompt": "existing",
            "images": [self._image(100)],
        }
        webapp.write_history_entries([target])
        original_read = webapp.read_history_entries
        old_read_write_barrier = threading.Barrier(2)
        start_barrier = threading.Barrier(2)

        def racing_read():
            payload = original_read()
            old_read_write_barrier.wait(timeout=3)
            return payload

        def append_one():
            start_barrier.wait(timeout=3)
            return self._append_history(101)

        def favorite_one():
            start_barrier.wait(timeout=3)
            return webapp.update_history_entry("favorite-target", {"favorite": True})

        with patch.object(webapp, "read_history_entries", side_effect=racing_read):
            with ThreadPoolExecutor(max_workers=2) as pool:
                append_future = pool.submit(append_one)
                favorite_future = pool.submit(favorite_one)
                self.assertIsNotNone(append_future.result(timeout=10))
                self.assertIsNotNone(favorite_future.result(timeout=10))

        entries = webapp.read_history_entries()
        by_id = {entry["id"]: entry for entry in entries}
        self.assertIn("favorite-target", by_id)
        self.assertTrue(by_id["favorite-target"]["favorite"])
        self.assertIn("prompt-101", {entry["prompt"] for entry in entries})

    def test_delete_commits_history_before_unlink_and_reports_only_successes(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        image_path = self.outputs / "cannot-delete.png"
        image_path.write_bytes(b"image")
        webapp.write_history_entries([
            {
                "id": "delete-target",
                "images": [{"saved_path": "outputs/cannot-delete.png"}],
            }
        ])
        original_unlink = Path.unlink

        def fail_image_unlink(path: Path, *args, **kwargs):
            if path.resolve() == image_path.resolve():
                raise OSError("file is busy")
            return original_unlink(path, *args, **kwargs)

        with patch.object(Path, "unlink", new=fail_image_unlink):
            deleted, deleted_files = webapp.delete_history_entry("delete-target", delete_files=True)

        self.assertTrue(deleted)
        self.assertEqual([], deleted_files)
        self.assertTrue(image_path.exists())
        self.assertEqual([], webapp.read_history_entries())

    def test_delete_never_unlinks_when_history_commit_fails(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        image_path = self.outputs / "keep-on-json-error.png"
        image_path.write_bytes(b"image")
        webapp.write_history_entries([
            {
                "id": "delete-target",
                "images": [{"saved_path": "outputs/keep-on-json-error.png"}],
            }
        ])

        with patch.object(webapp, "mutate_json", side_effect=OSError("disk full"), create=True):
            with self.assertRaisesRegex(OSError, "disk full"):
                webapp.delete_history_entry("delete-target", delete_files=True)

        self.assertTrue(image_path.exists())
        self.assertEqual(["delete-target"], [entry["id"] for entry in webapp.read_history_entries()])

    def test_legacy_delete_keeps_exact_path_and_id_restrictions(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        allowed = self.outputs / "legacy-safe.png"
        allowed.write_bytes(b"image")
        outside = self.root / "outside.png"
        outside.write_bytes(b"image")

        wrong_id = webapp.legacy_output_entry_id("other.png")
        deleted, _files = webapp.delete_history_entry(
            wrong_id,
            delete_files=True,
            legacy_path="outputs/legacy-safe.png",
        )
        self.assertFalse(deleted)
        self.assertTrue(allowed.exists())

        outside_id = webapp.legacy_output_entry_id(outside.name)
        deleted, _files = webapp.delete_history_entry(
            outside_id,
            delete_files=True,
            legacy_path="outside.png",
        )
        self.assertFalse(deleted)
        self.assertTrue(outside.exists())

        correct_id = webapp.legacy_output_entry_id(allowed.name)
        deleted, deleted_files = webapp.delete_history_entry(
            correct_id,
            delete_files=True,
            legacy_path="outputs/legacy-safe.png",
        )
        self.assertTrue(deleted)
        self.assertEqual(["outputs/legacy-safe.png"], deleted_files)
        self.assertFalse(allowed.exists())

    def test_history_reader_keeps_legacy_list_compatibility(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        self.history_file.write_text(
            json.dumps([{"id": "legacy-list"}, "ignore-me"], ensure_ascii=False),
            encoding="utf-8",
        )

        self.assertEqual([{"id": "legacy-list"}], webapp.read_history_entries())


if __name__ == "__main__":
    unittest.main()
