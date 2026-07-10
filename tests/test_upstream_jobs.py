import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote

import httpx
from fastapi.testclient import TestClient

import app as webapp
from upstream import (
    JobCancelled,
    JobRegistry,
    UpstreamExecutor,
    banana_headers,
    bounded_timeout,
    gpt_headers,
    normalize_job_id,
)


PNG_1X1 = base64.b64encode(
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00"
    b"\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfeA\x89\x81\xb5"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
).decode("ascii")


class UpstreamUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_blocking_call_does_not_block_event_loop(self) -> None:
        executor = UpstreamExecutor(generation_limit=1, chat_limit=1, download_limit=1)
        started = time.monotonic()

        task = asyncio.create_task(executor.run("chat", time.sleep, 0.2))
        await asyncio.sleep(0.02)

        self.assertLess(time.monotonic() - started, 0.1)
        await task

    async def test_before_start_rechecks_cancellation_after_waiting_for_permit(self) -> None:
        executor = UpstreamExecutor(generation_limit=1, chat_limit=1, download_limit=1)
        registry = JobRegistry(ttl_seconds=60)
        job_id = "queued-job"
        registry.register(job_id)
        first_entered = threading.Event()
        release_first = threading.Event()
        upstream_calls = 0

        def first() -> None:
            first_entered.set()
            release_first.wait(2)

        def second(**_kwargs) -> None:
            nonlocal upstream_calls
            upstream_calls += 1

        first_task = asyncio.create_task(executor.run("generation", first))
        self.assertTrue(await asyncio.to_thread(first_entered.wait, 1))
        registry.raise_if_canceled(job_id)
        second_task = asyncio.create_task(
            executor.run(
                "generation",
                second,
                before_start=lambda: registry.raise_if_canceled(job_id),
            )
        )
        await asyncio.sleep(0.03)

        registry.cancel(job_id)
        release_first.set()
        await first_task

        with self.assertRaises(JobCancelled):
            await second_task
        self.assertEqual(0, upstream_calls)

    async def test_cancelled_awaiter_keeps_permit_until_blocking_call_finishes(self) -> None:
        executor = UpstreamExecutor(generation_limit=1, chat_limit=1, download_limit=1)
        first_entered = threading.Event()
        first_finished = threading.Event()
        release_first = threading.Event()
        second_entered = threading.Event()
        active = 0
        max_active = 0
        active_lock = threading.Lock()

        def blocking(label: str) -> None:
            nonlocal active, max_active
            with active_lock:
                active += 1
                max_active = max(max_active, active)
            try:
                if label == "first":
                    first_entered.set()
                    release_first.wait(2)
                    first_finished.set()
                else:
                    second_entered.set()
            finally:
                with active_lock:
                    active -= 1

        first_task = asyncio.create_task(executor.run("chat", blocking, "first"))
        self.assertTrue(await asyncio.to_thread(first_entered.wait, 1))
        first_task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await first_task

        second_task = asyncio.create_task(executor.run("chat", blocking, "second"))
        await asyncio.sleep(0.05)
        second_started_early = second_entered.is_set()
        release_first.set()
        self.assertTrue(await asyncio.to_thread(first_finished.wait, 1))
        await second_task

        self.assertFalse(second_started_early)
        self.assertEqual(1, max_active)

    async def _assert_same_kind_limit(self, executor: UpstreamExecutor, kind: str) -> None:
        first_entered = threading.Event()
        release_first = threading.Event()
        second_entered = threading.Event()

        def first() -> None:
            first_entered.set()
            release_first.wait(2)

        def second() -> None:
            second_entered.set()

        first_task = asyncio.create_task(executor.run(kind, first))
        self.assertTrue(await asyncio.to_thread(first_entered.wait, 1))
        second_task = asyncio.create_task(executor.run(kind, second))
        await asyncio.sleep(0.03)
        self.assertFalse(second_entered.is_set(), f"{kind} limit did not hold the second call")

        release_first.set()
        await asyncio.gather(first_task, second_task)
        self.assertTrue(second_entered.is_set())

    async def test_each_request_kind_has_its_own_concurrency_limit(self) -> None:
        executor = UpstreamExecutor(generation_limit=1, chat_limit=1, download_limit=1)

        for kind in ("generation", "chat", "download"):
            with self.subTest(kind=kind):
                await self._assert_same_kind_limit(executor, kind)

    async def test_different_request_kinds_can_run_in_parallel(self) -> None:
        executor = UpstreamExecutor(generation_limit=1, chat_limit=1, download_limit=1)
        release = threading.Event()
        entered = {kind: threading.Event() for kind in ("generation", "chat", "download")}

        def blocking(kind: str) -> str:
            entered[kind].set()
            release.wait(2)
            return kind

        tasks = [
            asyncio.create_task(executor.run(kind, blocking, kind))
            for kind in ("generation", "chat", "download")
        ]
        for kind in ("generation", "chat", "download"):
            self.assertTrue(await asyncio.to_thread(entered[kind].wait, 1), f"{kind} did not enter")

        release.set()
        self.assertEqual(
            ["generation", "chat", "download"],
            await asyncio.gather(*tasks),
        )

    async def test_executor_can_be_reused_across_distinct_event_loops(self) -> None:
        executor = UpstreamExecutor(generation_limit=1, chat_limit=1, download_limit=1)

        async def exercise_contention() -> None:
            first_entered = threading.Event()
            release_first = threading.Event()

            def first() -> None:
                first_entered.set()
                release_first.wait(2)

            first_task = asyncio.create_task(executor.run("chat", first))
            self.assertTrue(await asyncio.to_thread(first_entered.wait, 1))
            second_task = asyncio.create_task(executor.run("chat", lambda: None))
            await asyncio.sleep(0.02)
            release_first.set()
            await asyncio.gather(first_task, second_task)

        def run_in_two_fresh_loops() -> None:
            asyncio.run(exercise_contention())
            asyncio.run(exercise_contention())

        await asyncio.to_thread(run_in_two_fresh_loops)

    async def test_job_registry_register_cancel_raise_and_forget(self) -> None:
        registry = JobRegistry(ttl_seconds=60)
        registry.register("job-1")
        registry.raise_if_canceled("job-1")

        self.assertTrue(registry.cancel("job-1"))
        with self.assertRaises(JobCancelled):
            registry.raise_if_canceled("job-1")

        registry.forget("job-1")
        registry.raise_if_canceled("job-1")

    async def test_cancel_before_register_stays_canceled(self) -> None:
        registry = JobRegistry(ttl_seconds=60)

        registry.cancel("job-before-register")
        registry.register("job-before-register")

        with self.assertRaises(JobCancelled):
            registry.raise_if_canceled("job-before-register")

    async def test_ttl_prunes_stale_state_without_pruning_recent_touch(self) -> None:
        now = [100.0]
        registry = JobRegistry(ttl_seconds=5, clock=lambda: now[0])
        registry.cancel("stale")
        now[0] = 104.0
        registry.cancel("fresh")
        now[0] = 105.1

        registry.register("trigger-prune")

        registry.raise_if_canceled("stale")
        with self.assertRaises(JobCancelled):
            registry.raise_if_canceled("fresh")

    async def test_job_registry_operations_are_thread_safe(self) -> None:
        registry = JobRegistry(ttl_seconds=60)

        def exercise(index: int) -> None:
            job_id = f"thread-job-{index}"
            registry.register(job_id)
            registry.cancel(job_id)
            try:
                registry.raise_if_canceled(job_id)
            except JobCancelled:
                pass
            else:
                raise AssertionError(f"{job_id} was not canceled")
            registry.forget(job_id)
            registry.raise_if_canceled(job_id)

        def run_workers() -> None:
            with ThreadPoolExecutor(max_workers=8) as pool:
                list(pool.map(exercise, range(80)))

        await asyncio.to_thread(run_workers)

    async def test_bounded_timeout_clamps_and_handles_invalid_values(self) -> None:
        self.assertEqual(30, bounded_timeout(30, default=60, maximum=600))
        self.assertEqual(45, bounded_timeout("45", default=60, maximum=600))
        self.assertEqual(60, bounded_timeout(None, default=60, maximum=600))
        self.assertEqual(10, bounded_timeout(1, default=60, maximum=600))
        self.assertEqual(600, bounded_timeout(0, default=60, maximum=600))
        self.assertEqual(600, bounded_timeout(-20, default=60, maximum=600))
        self.assertEqual(600, bounded_timeout(9999, default=60, maximum=600))
        self.assertEqual(60, bounded_timeout("bad", default=60, maximum=600))

    async def test_header_helpers_keep_supplier_contracts(self) -> None:
        self.assertEqual(
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": "Bearer banana-test-key",
                "X-API-Key": "banana-test-key",
                "x-goog-api-key": "banana-test-key",
                "X-Banana-Client": "image-generate-web-tool",
            },
            banana_headers(" banana-test-key "),
        )
        self.assertEqual(
            {"Authorization": "Bearer gpt-test-key", "Accept": "*/*"},
            gpt_headers(" gpt-test-key "),
        )
        self.assertEqual(
            {
                "Authorization": "Bearer gpt-test-key",
                "Accept": "*/*",
                "Content-Type": "application/json",
            },
            gpt_headers("gpt-test-key", content_type="application/json"),
        )
        self.assertEqual(
            {
                "Authorization": "Bearer gpt-test-key",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            gpt_headers(
                "gpt-test-key",
                accept="application/json",
                content_type="application/json",
            ),
        )

    async def test_job_id_normalization_is_shared_and_bounded(self) -> None:
        self.assertEqual("job-123", normalize_job_id(" job 中文 !!! 123 "))
        self.assertEqual("job._:-123", normalize_job_id("job._:-123"))
        self.assertEqual("", normalize_job_id(None))
        self.assertEqual("a" * 160, normalize_job_id("a" * 200))
        with self.assertRaises(ValueError):
            normalize_job_id("---", allow_empty=False)


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


class FakeJsonResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.ok = status_code < 400
        self.content = json.dumps(payload).encode("utf-8")
        self.text = self.content.decode("utf-8")

    def json(self):
        return self.payload


class RecordingExecutor:
    def __init__(self):
        self.calls = []

    async def run(self, kind, function, *args, before_start=None, **kwargs):
        self.calls.append(
            {
                "kind": kind,
                "function": function,
                "args": args,
                "kwargs": dict(kwargs),
                "before_start": before_start,
            }
        )
        if before_start is not None:
            before_start()
        return function(*args, **kwargs)


class UpstreamApiIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
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
        transport = httpx.ASGITransport(app=webapp.create_app(), raise_app_exceptions=False)
        self.client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        for item in reversed(self.patchers):
            item.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def _gpt_post(url, *_args, **_kwargs):
        if str(url).endswith("/chat/completions"):
            return FakeJsonResponse({"choices": [{"message": {"content": "OK"}}]})
        return FakeJsonResponse({"data": [{"b64_json": PNG_1X1}]})

    class _BananaSession:
        def post(self, _url, **kwargs):
            payload = kwargs.get("json") or {}
            modalities = (payload.get("generationConfig") or {}).get("responseModalities") or []
            if "TEXT" in modalities:
                return FakeBananaTextResponse()
            return FakeBananaImageResponse()

    async def _assert_health_stays_responsive(self, request_coro, entered, release) -> None:
        loop = asyncio.get_running_loop()
        health_result = loop.create_future()

        def request_health_after_upstream_enters() -> None:
            if not entered.wait(1.5):
                loop.call_soon_threadsafe(
                    health_result.set_exception,
                    AssertionError("slow upstream was not entered"),
                )
                return
            started = time.monotonic()
            health_future = asyncio.run_coroutine_threadsafe(
                self.client.get("/api/health"),
                loop,
            )
            try:
                health = health_future.result(2)
            except Exception as exc:
                loop.call_soon_threadsafe(health_result.set_exception, exc)
                return
            loop.call_soon_threadsafe(
                health_result.set_result,
                (health, time.monotonic() - started),
            )

        watcher = threading.Thread(target=request_health_after_upstream_enters)
        watcher.start()
        request_task = asyncio.create_task(request_coro)
        health, elapsed = await asyncio.wait_for(health_result, 2.5)
        release.set()
        response = await request_task
        watcher.join(1)

        self.assertEqual(200, health.status_code)
        self.assertEqual(200, response.status_code)
        self.assertLess(elapsed, 0.25)

    async def test_slow_gpt_chat_does_not_block_health(self) -> None:
        entered = threading.Event()
        release = threading.Event()

        def slow_post(*_args, **_kwargs):
            entered.set()
            release.wait(0.8)
            return FakeJsonResponse({"choices": [{"message": {"content": "OK"}}]})

        with patch.object(webapp.requests, "post", side_effect=slow_post):
            await self._assert_health_stays_responsive(
                self.client.post(
                    "/api/chat/gpt-image-2",
                    json={
                        "prompt": "hello",
                        "api_key": "sk-test",
                        "base_url": "https://example.com/v1",
                        "chat_model": "gpt-test",
                    },
                ),
                entered,
                release,
            )

    async def test_slow_banana_diagnostic_does_not_block_health(self) -> None:
        entered = threading.Event()
        release = threading.Event()

        class SlowSession:
            def post(self, *_args, **_kwargs):
                entered.set()
                release.wait(0.8)
                return FakeBananaImageResponse()

        with patch.object(webapp, "create_requests_session", return_value=SlowSession()):
            await self._assert_health_stays_responsive(
                self.client.post(
                    "/api/diagnostics",
                    json={
                        "engine": "banana",
                        "checks": ["generation"],
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                    },
                ),
                entered,
                release,
            )

    async def test_all_production_posts_use_the_expected_executor_kind(self) -> None:
        executor = RecordingExecutor()
        banana_session = self._BananaSession()
        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", side_effect=self._gpt_post),
            patch.object(webapp, "create_requests_session", return_value=banana_session),
        ):
            responses = [
                await self.client.post(
                    "/api/diagnostics",
                    json={
                        "engine": "gpt-image-2",
                        "checks": ["generation", "chat"],
                        "api_key": "sk-test",
                        "base_url": "https://example.com/v1",
                        "model": "gpt-image-2",
                        "chat_model": "gpt-test",
                    },
                ),
                await self.client.post(
                    "/api/diagnostics",
                    json={
                        "engine": "banana",
                        "checks": ["generation", "chat"],
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                    },
                ),
                await self.client.post(
                    "/api/chat/gpt-image-2",
                    json={
                        "prompt": "hello",
                        "api_key": "sk-test",
                        "base_url": "https://example.com/v1",
                        "chat_model": "gpt-test",
                        "job_id": "gpt-chat-job",
                    },
                ),
                await self.client.post(
                    "/api/chat/banana",
                    json={
                        "prompt": "hello",
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                        "job_id": "banana-chat-job",
                    },
                ),
                await self.client.post(
                    "/api/generate/gpt-image-2",
                    data={
                        "prompt": "square",
                        "api_key": "sk-test",
                        "base_url": "https://example.com/v1",
                        "model": "gpt-image-2",
                        "job_id": "gpt-generation-job",
                    },
                ),
                await self.client.post(
                    "/api/generate/banana",
                    data={
                        "prompt": "square",
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                        "batch_size": "1",
                        "job_id": "banana-generation-job",
                    },
                ),
            ]

        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(
            ["generation", "chat", "generation", "chat", "chat", "chat", "generation", "generation"],
            [call["kind"] for call in executor.calls],
        )
        self.assertEqual(
            [False, False, False, False, True, True, True, True],
            [callable(call["before_start"]) for call in executor.calls],
        )

    async def test_gpt_request_headers_match_each_endpoint_contract(self) -> None:
        executor = RecordingExecutor()
        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", side_effect=self._gpt_post),
        ):
            diagnostic = await self.client.post(
                "/api/diagnostics",
                json={
                    "engine": "gpt-image-2",
                    "checks": ["generation", "chat"],
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "chat_model": "gpt-test",
                },
            )
            chat = await self.client.post(
                "/api/chat/gpt-image-2",
                json={
                    "prompt": "hello",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "chat_model": "gpt-test",
                },
            )
            generation = await self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "square",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "job_id": "gpt-remote-job",
                },
            )
            edit = await self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "edit square",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "api_endpoint": "/v1/images/edits",
                },
                files={
                    "reference_files": (
                        "reference.png",
                        base64.b64decode(PNG_1X1),
                        "image/png",
                    )
                },
            )

        self.assertTrue(all(response.status_code == 200 for response in (diagnostic, chat, generation, edit)))
        self.assertEqual(5, len(executor.calls))
        self.assertEqual(
            [
                {
                    "Authorization": "Bearer sk-test",
                    "Accept": "*/*",
                    "Content-Type": "application/json",
                },
                {
                    "Authorization": "Bearer sk-test",
                    "Accept": "*/*",
                    "Content-Type": "application/json",
                },
                {
                    "Authorization": "Bearer sk-test",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                {
                    "Authorization": "Bearer sk-test",
                    "Accept": "*/*",
                    "Content-Type": "application/json",
                },
                {
                    "Authorization": "Bearer sk-test",
                    "Accept": "*/*",
                },
            ],
            [call["kwargs"]["headers"] for call in executor.calls],
        )

    async def test_production_remote_results_use_download_executor_kind(self) -> None:
        executor = RecordingExecutor()
        banana_payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"fileData": {"fileUri": "https://example.com/banana.png"}},
                        ]
                    }
                }
            ]
        }

        def remote_gpt_post(*_args, **_kwargs):
            return FakeJsonResponse({"data": [{"url": "https://example.com/gpt.png"}]})

        class RemoteBananaSession:
            def post(self, *_args, **_kwargs):
                return FakeJsonResponse(banana_payload)

        def fake_download(_url):
            return {
                "src": f"data:image/png;base64,{PNG_1X1}",
                "mime_type": "image/png",
                "source": "downloaded-url",
            }

        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", side_effect=remote_gpt_post),
            patch.object(webapp, "create_requests_session", return_value=RemoteBananaSession()),
            patch.object(webapp, "download_remote_image", side_effect=fake_download),
        ):
            gpt = await self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "square",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                },
            )
            banana = await self.client.post(
                "/api/generate/banana",
                data={
                    "prompt": "square",
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                    "batch_size": "1",
                    "job_id": "banana-remote-job",
                },
            )

        self.assertEqual(200, gpt.status_code)
        self.assertEqual(200, banana.status_code)
        self.assertEqual(
            ["generation", "download", "generation", "download"],
            [call["kind"] for call in executor.calls],
        )
        self.assertTrue(all(callable(call["before_start"]) for call in executor.calls))

    async def test_zero_infinite_and_oversized_timeouts_remain_finite(self) -> None:
        executor = RecordingExecutor()
        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", side_effect=self._gpt_post),
            patch.object(webapp, "create_requests_session", return_value=self._BananaSession()),
        ):
            responses = [
                await self.client.post(
                    "/api/chat/gpt-image-2",
                    json={
                        "prompt": "hello",
                        "api_key": "sk-test",
                        "base_url": "https://example.com/v1",
                        "chat_model": "gpt-test",
                        "timeout": 999999,
                    },
                ),
                await self.client.post(
                    "/api/chat/banana",
                    json={
                        "prompt": "hello",
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                        "timeout_seconds": -1,
                    },
                ),
                await self.client.post(
                    "/api/generate/gpt-image-2",
                    data={
                        "prompt": "square",
                        "api_key": "sk-test",
                        "base_url": "https://example.com/v1",
                        "model": "gpt-image-2",
                        "timeout": "0",
                        "infinite_timeout": "true",
                    },
                ),
                await self.client.post(
                    "/api/generate/banana",
                    data={
                        "prompt": "square",
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                        "batch_size": "1",
                        "timeout_seconds": "0",
                        "infinite_timeout": "true",
                    },
                ),
            ]

        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(["chat", "chat", "generation", "generation"], [call["kind"] for call in executor.calls])
        for call in executor.calls[:2]:
            timeout = call["kwargs"]["timeout"]
            read_timeout = timeout[1] if isinstance(timeout, tuple) else timeout
            self.assertIsNotNone(read_timeout)
            self.assertGreater(read_timeout, 0)
            self.assertLessEqual(read_timeout, 600)
        for call in executor.calls[2:]:
            timeout = call["kwargs"]["timeout"]
            read_timeout = timeout[1] if isinstance(timeout, tuple) else timeout
            self.assertIsNotNone(read_timeout)
            self.assertGreater(read_timeout, 0)
            self.assertLessEqual(read_timeout, 1800)

    async def test_unhandled_exception_returns_stable_sanitized_500(self) -> None:
        leaked_path = str(self.root / "private" / "secret.txt")
        with patch.object(
            webapp,
            "read_app_version",
            side_effect=RuntimeError(f"raw-upstream-text {leaked_path}"),
        ):
            response = await self.client.get("/api/health")

        self.assertEqual(500, response.status_code)
        self.assertEqual(
            {"detail": "后端内部错误，请重试。", "error_code": "E_INTERNAL"},
            response.json(),
        )
        self.assertNotIn("RuntimeError", response.text)
        self.assertNotIn("raw-upstream-text", response.text)
        self.assertNotIn(leaked_path, response.text)


class JobCancellationApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.outputs = self.root / "outputs"
        (self.root / "static" / "studio" / "assets").mkdir(parents=True, exist_ok=True)
        (self.root / "static" / "index.html").write_text("<div>classic</div>", encoding="utf-8")
        (self.root / "static" / "studio" / "index.html").write_text("<div>studio</div>", encoding="utf-8")
        (self.root / "VERSION").write_text("9.8.7\n", encoding="utf-8")
        self.registry = JobRegistry(ttl_seconds=60)
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
        self.patchers.append(patch.object(webapp, "JOB_REGISTRY", self.registry, create=True))
        for item in self.patchers:
            item.start()
        transport = httpx.ASGITransport(app=webapp.create_app(), raise_app_exceptions=False)
        self.client = httpx.AsyncClient(transport=transport, base_url="http://testserver")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        for item in reversed(self.patchers):
            item.stop()
        self.temp_dir.cleanup()

    @staticmethod
    def _gpt_image_response(count: int = 1) -> FakeJsonResponse:
        return FakeJsonResponse({"data": [{"b64_json": PNG_1X1} for _ in range(count)]})

    async def _post_gpt_generation(self, job_id: str, *, n: int = 1):
        return await self.client.post(
            "/api/generate/gpt-image-2",
            data={
                "prompt": "square",
                "api_key": "sk-test",
                "base_url": "https://example.com/v1",
                "model": "gpt-image-2",
                "n": str(n),
                "job_id": job_id,
            },
        )

    def _raster_outputs(self):
        if not self.outputs.exists():
            return []
        return [
            path
            for path in self.outputs.iterdir()
            if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
        ]

    @staticmethod
    def _generation_cases():
        return [
            (
                "/api/generate/gpt-image-2",
                {
                    "prompt": "square",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                },
            ),
            (
                "/api/generate/banana",
                {
                    "prompt": "square",
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                    "batch_size": "1",
                },
            ),
        ]

    async def test_generation_without_job_id_remains_compatible(self) -> None:
        executor = RecordingExecutor()

        class FakeBananaSession:
            def post(_self, *_args, **_kwargs):
                return FakeBananaImageResponse()

        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", return_value=self._gpt_image_response()),
            patch.object(webapp, "create_requests_session", return_value=FakeBananaSession()),
        ):
            responses = [
                await self.client.post(endpoint, data=data)
                for endpoint, data in self._generation_cases()
            ]

        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(["generation", "generation"], [call["kind"] for call in executor.calls])

    async def test_generation_rejects_explicit_invalid_job_ids_before_executor(self) -> None:
        executor = RecordingExecutor()

        class FakeBananaSession:
            def post(_self, *_args, **_kwargs):
                return FakeBananaImageResponse()

        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", return_value=self._gpt_image_response()),
            patch.object(webapp, "create_requests_session", return_value=FakeBananaSession()),
        ):
            for endpoint, base_data in self._generation_cases():
                for invalid_job_id in ("", "   ", "!!!"):
                    with self.subTest(endpoint=endpoint, job_id=invalid_job_id):
                        response = await self.client.post(
                            endpoint,
                            data={**base_data, "job_id": invalid_job_id},
                        )
                        self.assertEqual(400, response.status_code)

        self.assertEqual([], executor.calls)

    async def test_generation_normalizes_valid_job_ids_before_register(self) -> None:
        executor = RecordingExecutor()

        class FakeBananaSession:
            def post(_self, *_args, **_kwargs):
                return FakeBananaImageResponse()

        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", return_value=self._gpt_image_response()),
            patch.object(webapp, "create_requests_session", return_value=FakeBananaSession()),
            patch.object(self.registry, "register", wraps=self.registry.register) as register,
        ):
            responses = [
                await self.client.post(endpoint, data={**data, "job_id": "job/a"})
                for endpoint, data in self._generation_cases()
            ]

        self.assertTrue(all(response.status_code == 200 for response in responses))
        self.assertEqual(["job-a", "job-a"], [call.args[0] for call in register.call_args_list])

    async def test_cancel_route_normalizes_id_and_rejects_empty_normalization(self) -> None:
        raw_job_id = "job 中文 !!! 123"
        response = await self.client.post(f"/api/jobs/{quote(raw_job_id, safe='')}/cancel")

        self.assertEqual(200, response.status_code)
        self.assertEqual("job-123", response.json()["job_id"])
        self.assertTrue(response.json()["canceled"])
        self.assertRegex(response.json()["warning"], r"上游.*(?:运行|继续).*计费")

        invalid = await self.client.post("/api/jobs/---/cancel")
        self.assertEqual(400, invalid.status_code)

        with patch.object(webapp.requests, "post") as upstream_post:
            invalid_entry = await self.client.post(
                "/api/chat/gpt-image-2",
                json={
                    "prompt": "hello",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "chat_model": "gpt-test",
                    "job_id": "!!!",
                },
            )
        self.assertEqual(400, invalid_entry.status_code)
        upstream_post.assert_not_called()

    async def test_slash_job_id_uses_same_normalization_for_chat_and_cancel_route(self) -> None:
        raw_job_id = "job/a"
        cancel = await self.client.post(f"/api/jobs/{quote(raw_job_id, safe='')}/cancel")

        self.assertEqual(200, cancel.status_code)
        self.assertEqual("job-a", cancel.json()["job_id"])

        with (
            patch.object(self.registry, "register", wraps=self.registry.register) as register,
            patch.object(webapp.requests, "post") as upstream_post,
        ):
            chat = await self.client.post(
                "/api/chat/gpt-image-2",
                json={
                    "prompt": "hello",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "chat_model": "gpt-test",
                    "job_id": raw_job_id,
                },
            )

        self.assertEqual(200, chat.status_code)
        self.assertTrue(chat.json()["canceled"])
        register.assert_called_once_with("job-a")
        upstream_post.assert_not_called()

    async def test_cancel_before_register_skips_upstream_and_same_id_can_be_reused(self) -> None:
        job_id = "job-before-register"
        cancel = await self.client.post(f"/api/jobs/{job_id}/cancel")
        self.assertEqual(200, cancel.status_code)

        with patch.object(webapp.requests, "post", return_value=self._gpt_image_response()) as upstream_post:
            canceled = await self._post_gpt_generation(job_id)
            reused = await self._post_gpt_generation(job_id)

        self.assertEqual(200, canceled.status_code)
        self.assertTrue(canceled.json()["canceled"])
        self.assertEqual([], canceled.json()["images"])
        self.assertIsNone(canceled.json()["history_entry"])
        self.assertEqual(200, reused.status_code)
        self.assertFalse(reused.json().get("canceled", False))
        self.assertEqual(1, upstream_post.call_count)
        self.assertNotIn(job_id, self.registry._items)

    async def test_cancel_after_upstream_started_leaves_no_images_or_history(self) -> None:
        job_id = "job-after-start"
        entered = threading.Event()
        release = threading.Event()

        def slow_post(*_args, **_kwargs):
            entered.set()
            release.wait(1)
            return self._gpt_image_response()

        with patch.object(webapp.requests, "post", side_effect=slow_post):
            request_task = asyncio.create_task(self._post_gpt_generation(job_id))
            self.assertTrue(await asyncio.to_thread(entered.wait, 1))
            cancel = await self.client.post(f"/api/jobs/{job_id}/cancel")
            release.set()
            response = await request_task

        self.assertEqual(200, cancel.status_code)
        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual([], self._raster_outputs())
        self.assertFalse((self.outputs / "history.json").exists())

    async def test_gpt_retry_checks_cancellation_before_second_post(self) -> None:
        job_id = "job-retry"
        calls = 0
        retry_waiting = threading.Event()
        release_retry = asyncio.Event()

        def retryable_post(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                return FakeJsonResponse({"error": {"message": "busy"}}, status_code=503)
            return self._gpt_image_response()

        async def controlled_sleep(_delay):
            retry_waiting.set()
            await release_retry.wait()

        with (
            patch.object(webapp.requests, "post", side_effect=retryable_post),
            patch.object(webapp.asyncio, "sleep", side_effect=controlled_sleep),
        ):
            request_task = asyncio.create_task(self._post_gpt_generation(job_id))
            self.assertTrue(await asyncio.to_thread(retry_waiting.wait, 1))
            await self.client.post(f"/api/jobs/{job_id}/cancel")
            release_retry.set()
            response = await request_task

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual(1, calls)

    async def test_gpt_fallback_checks_cancellation_before_second_post(self) -> None:
        job_id = "job-fallback"
        calls = 0
        entered = threading.Event()
        release = threading.Event()

        def failing_image_host(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                entered.set()
                release.wait(1)
                raise webapp.requests.ConnectionError("image host unavailable")
            return self._gpt_image_response()

        with patch.object(webapp.requests, "post", side_effect=failing_image_host):
            request_task = asyncio.create_task(
                self.client.post(
                    "/api/generate/gpt-image-2",
                    data={
                        "prompt": "square",
                        "api_key": "sk-test",
                        "base_url": "https://yuzapi.fun/v1",
                        "model": "gpt-image-2",
                        "job_id": job_id,
                    },
                )
            )
            self.assertTrue(await asyncio.to_thread(entered.wait, 1))
            await self.client.post(f"/api/jobs/{job_id}/cancel")
            release.set()
            response = await request_task

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual(1, calls)

    async def test_gpt_missing_image_compensation_checks_cancellation_before_second_post(self) -> None:
        job_id = "job-missing-image"
        calls = 0
        extraction_entered = threading.Event()
        release_extraction = asyncio.Event()

        def one_image_post(*_args, **_kwargs):
            nonlocal calls
            calls += 1
            return self._gpt_image_response()

        async def delayed_extract(*_args, **_kwargs):
            extraction_entered.set()
            await release_extraction.wait()
            return [
                {
                    "src": f"data:image/png;base64,{PNG_1X1}",
                    "mime_type": "image/png",
                    "source": "b64_json",
                    "name": "one.png",
                }
            ]

        with (
            patch.object(webapp.requests, "post", side_effect=one_image_post),
            patch.object(webapp, "build_gpt_images_from_response_async", side_effect=delayed_extract),
        ):
            request_task = asyncio.create_task(self._post_gpt_generation(job_id, n=2))
            self.assertTrue(await asyncio.to_thread(extraction_entered.wait, 1))
            await self.client.post(f"/api/jobs/{job_id}/cancel")
            release_extraction.set()
            response = await request_task

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual(1, calls)

    async def test_banana_batch_checks_cancellation_before_next_batch(self) -> None:
        job_id = "job-banana-batch"
        calls = 0
        entered = threading.Event()
        release = threading.Event()

        class SlowBananaSession:
            def post(_self, *_args, **_kwargs):
                nonlocal calls
                calls += 1
                if calls == 1:
                    entered.set()
                    release.wait(1)
                return FakeBananaImageResponse()

        with patch.object(webapp, "create_requests_session", return_value=SlowBananaSession()):
            request_task = asyncio.create_task(
                self.client.post(
                    "/api/generate/banana",
                    data={
                        "prompt": "square",
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                        "batch_size": "2",
                        "job_id": job_id,
                    },
                )
            )
            self.assertTrue(await asyncio.to_thread(entered.wait, 1))
            await self.client.post(f"/api/jobs/{job_id}/cancel")
            release.set()
            response = await request_task

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual(1, calls)
        self.assertEqual([], self._raster_outputs())
        self.assertFalse((self.outputs / "history.json").exists())

    async def test_gpt_and_banana_chat_return_canceled_after_upstream_started(self) -> None:
        gpt_entered = threading.Event()
        gpt_release = threading.Event()

        def slow_gpt_chat(*_args, **_kwargs):
            gpt_entered.set()
            gpt_release.wait(1)
            return FakeJsonResponse({"choices": [{"message": {"content": "OK"}}]})

        with patch.object(webapp.requests, "post", side_effect=slow_gpt_chat):
            gpt_task = asyncio.create_task(
                self.client.post(
                    "/api/chat/gpt-image-2",
                    json={
                        "prompt": "hello",
                        "api_key": "sk-test",
                        "base_url": "https://example.com/v1",
                        "chat_model": "gpt-test",
                        "job_id": "job-gpt-chat",
                    },
                )
            )
            self.assertTrue(await asyncio.to_thread(gpt_entered.wait, 1))
            await self.client.post("/api/jobs/job-gpt-chat/cancel")
            gpt_release.set()
            gpt_response = await gpt_task

        banana_entered = threading.Event()
        banana_release = threading.Event()

        class SlowBananaChatSession:
            def post(self, *_args, **_kwargs):
                banana_entered.set()
                banana_release.wait(1)
                return FakeBananaTextResponse()

        with patch.object(webapp, "create_requests_session", return_value=SlowBananaChatSession()):
            banana_task = asyncio.create_task(
                self.client.post(
                    "/api/chat/banana",
                    json={
                        "prompt": "hello",
                        "api_key": "banana-test-key",
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                        "job_id": "job-banana-chat",
                    },
                )
            )
            self.assertTrue(await asyncio.to_thread(banana_entered.wait, 1))
            await self.client.post("/api/jobs/job-banana-chat/cancel")
            banana_release.set()
            banana_response = await banana_task

        for response in (gpt_response, banana_response):
            self.assertEqual(200, response.status_code)
            self.assertTrue(response.json()["canceled"])
            self.assertEqual("", response.json()["reply"])

    async def test_save_generated_images_cleans_partial_file_and_saved_metadata(self) -> None:
        job_id = "job-save-helper"
        images = [
            {"src": f"data:image/png;base64,{PNG_1X1}", "mime_type": "image/png"},
            {"src": f"data:image/png;base64,{PNG_1X1}", "mime_type": "image/png"},
        ]
        original_write_bytes = Path.write_bytes
        canceled = False

        def write_then_cancel(path: Path, data: bytes) -> int:
            nonlocal canceled
            written = original_write_bytes(path, data)
            if not canceled and path.parent.resolve() == self.outputs.resolve():
                canceled = True
                self.registry.cancel(job_id)
            return written

        self.registry.register(job_id)
        with patch.object(Path, "write_bytes", new=write_then_cancel):
            with self.assertRaises(JobCancelled):
                webapp.save_generated_images("gpt-image-2", images, job_id=job_id)
        self.registry.forget(job_id)

        self.assertEqual([], self._raster_outputs())
        for image in images:
            for key in ("saved_name", "saved_path", "saved_url", "save_status", "save_error"):
                self.assertNotIn(key, image)

    async def test_cancel_during_endpoint_save_returns_canceled_without_history(self) -> None:
        job_id = "job-save-endpoint"
        original_write_bytes = Path.write_bytes
        canceled = False

        def write_then_cancel(path: Path, data: bytes) -> int:
            nonlocal canceled
            written = original_write_bytes(path, data)
            if not canceled and path.parent.resolve() == self.outputs.resolve():
                canceled = True
                self.registry.cancel(job_id)
            return written

        with (
            patch.object(webapp.requests, "post", return_value=self._gpt_image_response(2)),
            patch.object(Path, "write_bytes", new=write_then_cancel),
        ):
            response = await self._post_gpt_generation(job_id, n=2)

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual([], response.json()["images"])
        self.assertIsNone(response.json()["history_entry"])
        self.assertEqual([], self._raster_outputs())
        self.assertFalse((self.outputs / "history.json").exists())

    async def test_cancel_during_history_append_compensates_entry_and_images(self) -> None:
        job_id = "job-history-append"
        original_append = webapp.append_generation_history

        def append_then_cancel(**kwargs):
            entry = original_append(**kwargs)
            self.registry.cancel(job_id)
            return entry

        with (
            patch.object(webapp.requests, "post", return_value=self._gpt_image_response()),
            patch.object(webapp, "append_generation_history", side_effect=append_then_cancel),
        ):
            response = await self._post_gpt_generation(job_id)

        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual([], self._raster_outputs())
        history_entries = webapp.read_history_entries()
        self.assertEqual([], history_entries)


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
