import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from urllib.parse import quote

import httpx
from fastapi.testclient import TestClient
from PIL import Image

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
PNG_1X1_RAW = base64.b64decode(PNG_1X1)


def png_bytes(mode, size, pixels):
    image = Image.new(mode, size)
    image.putdata(pixels)
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


PNG_RGBA_1X1_RAW = png_bytes("RGBA", (1, 1), [(255, 255, 255, 0)])
EXACT_SECRET = "exact-client-key-ABC123"
WINDOWS_SECRET_PATH = r"C:\Users\Alice\private\token.txt"
POSIX_SECRET_PATH = "/home/alice/private/token.txt"
UNC_SECRET_PATH = r"\\server\share\private\token.txt"
SENSITIVE_URL = "https://url-user:url-pass@example.com/v1?token=query-secret&safe=ok"
SENSITIVE_ERROR = (
    f"ConnectionError {EXACT_SECRET} Bearer bearer-secret sk-abcdef123456 "
    f"{SENSITIVE_URL} api_key=kv-secret password: pass-secret "
    f"{WINDOWS_SECRET_PATH} {POSIX_SECRET_PATH} {UNC_SECRET_PATH}"
)
SENSITIVE_MARKERS = (
    EXACT_SECRET,
    "bearer-secret",
    "sk-abcdef123456",
    "url-user",
    "url-pass",
    "query-secret",
    "kv-secret",
    "pass-secret",
    WINDOWS_SECRET_PATH,
    POSIX_SECRET_PATH,
    UNC_SECRET_PATH,
)
CLIENT_ERROR_DETAILS = {
    "E_UPSTREAM_AUTH": "上游服务认证失败，请检查 API Key 或访问权限。",
    "E_UPSTREAM_RATE_LIMIT": "上游服务请求过于频繁，请稍后重试。",
    "E_UPSTREAM_TIMEOUT": "上游服务响应超时，请稍后重试或降低生成参数。",
    "E_UPSTREAM_NETWORK": "无法连接上游服务，请检查网络和接口地址。",
    "E_UPSTREAM_RESPONSE": "上游服务返回异常，请稍后重试。",
    "E_UPSTREAM_REQUEST": "上游服务拒绝了请求，请检查模型与生成参数。",
    "E_LOCAL_OPEN_OUTPUTS": "无法打开生成结果文件夹，请确认系统权限后重试。",
    "E_LOCAL_SAVE_OUTPUT": "图片保存失败，请检查输出目录权限。",
}
SAFE_URL_PLACEHOLDER = "[invalid endpoint]"


def client_strings(value):
    if isinstance(value, dict):
        return "\n".join(client_strings(item) for item in value.values())
    if isinstance(value, list):
        return "\n".join(client_strings(item) for item in value)
    return str(value)


def assert_client_payload_is_sanitized(test_case, payload):
    text = client_strings(payload)
    for marker in SENSITIVE_MARKERS:
        test_case.assertNotIn(marker, text)
    return text


def assert_stable_http_error(test_case, response, status_code, error_code):
    test_case.assertEqual(status_code, response.status_code)
    test_case.assertEqual(
        {
            "detail": CLIENT_ERROR_DETAILS[error_code],
            "error_code": error_code,
        },
        response.json(),
    )
    assert_client_payload_is_sanitized(test_case, response.json())


class UpstreamUnitTests(unittest.IsolatedAsyncioTestCase):
    def test_mask_prompt_requires_a_concrete_edit_target(self) -> None:
        self.assertFalse(
            webapp.mask_prompt_has_specific_target(
                "只修改红色遮罩覆盖的部分，让那个区域换一种风格。"
            )
        )
        self.assertFalse(webapp.mask_prompt_has_specific_target("遮罩部分换一下。"))
        self.assertFalse(webapp.mask_prompt_has_specific_target("把遮罩区域换成另一种风格。"))
        self.assertFalse(webapp.mask_prompt_has_specific_target("Change the mask to a different style."))
        self.assertTrue(
            webapp.mask_prompt_has_specific_target(
                "把涂红的外部背景改成夜晚城市，人物保持不变。"
            )
        )
        self.assertTrue(webapp.mask_prompt_has_specific_target("Remove the people inside the mask."))

    def test_strict_mask_composite_restores_every_unpainted_pixel(self) -> None:
        base = png_bytes(
            "RGBA",
            (2, 1),
            [(10, 20, 30, 255), (40, 50, 60, 255)],
        )
        generated = png_bytes(
            "RGBA",
            (2, 1),
            [(200, 10, 10, 255), (10, 200, 10, 255)],
        )
        standard_mask = png_bytes(
            "RGBA",
            (2, 1),
            [(255, 255, 255, 0), (255, 255, 255, 255)],
        )
        compat_mask = png_bytes(
            "RGBA",
            (2, 1),
            [(255, 255, 255, 255), (255, 255, 255, 0)],
        )

        for encoding, mask in (("standard", standard_mask), ("compat", compat_mask)):
            with self.subTest(encoding=encoding):
                result = webapp.strict_mask_composite_png(
                    generated,
                    base_raw=base,
                    mask_raw=mask,
                    mask_encoding=encoding,
                )
                image = Image.open(BytesIO(result)).convert("RGBA")
                pixels = [image.getpixel((0, 0)), image.getpixel((1, 0))]
                self.assertEqual((200, 10, 10, 255), pixels[0])
                self.assertEqual((40, 50, 60, 255), pixels[1])

    def test_public_url_hint_returns_only_normalized_host_and_nondefault_port(self) -> None:
        cases = {
            "https://user:pass@Example.COM/proxy/path-token?token=secret#fragment": "example.com",
            "http://Example.COM:80/v1": "example.com",
            "http://Example.COM:8080/v1": "example.com:8080",
            "https://Example.COM:443/v1": "example.com",
            "https://Example.COM:8443/v1": "example.com:8443",
            "https://[2001:DB8::1]:443/v1": "[2001:db8::1]",
            "https://[2001:DB8::1]:8443/v1?credential=secret": "[2001:db8::1]:8443",
            "http://127.0.0.1:8080/private": "127.0.0.1:8080",
            "example.com:8080/v1?code=secret&arbitrary=query-secret": "example.com:8080",
            "Example.COM/v1#fragment": "example.com",
            "ftp://example.com/private": SAFE_URL_PLACEHOLDER,
            WINDOWS_SECRET_PATH: SAFE_URL_PLACEHOLDER,
            POSIX_SECRET_PATH: SAFE_URL_PLACEHOLDER,
            UNC_SECRET_PATH: SAFE_URL_PLACEHOLDER,
        }

        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(expected, webapp.public_url_hint(value))

    def test_sanitize_client_url_keeps_only_scheme_host_and_nondefault_port(self) -> None:
        cases = {
            "https://user:pass@Example.COM/proxy/path-token?key=secret#fragment": "https://example.com",
            "http://Example.COM:80/v1?credential=secret": "http://example.com",
            "https://Example.COM:443/v1?code=secret": "https://example.com",
            "https://Example.COM:8443/v1?arbitrary=query-secret": "https://example.com:8443",
            "https://[2001:DB8::1]:8443/private": "https://[2001:db8::1]:8443",
            "https://127.0.0.1:443/private": "https://127.0.0.1",
            "not-a-url": "[redacted URL]",
        }

        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(expected, webapp.sanitize_client_url(value))

    def test_sanitize_history_meta_is_idempotent_and_raw_urls_win(self) -> None:
        raw_priority = {
            "api_url": f"{SENSITIVE_URL}#private-fragment",
            "api_url_host": WINDOWS_SECRET_PATH,
            "api_base_url": POSIX_SECRET_PATH,
            "api_base_url_host": SENSITIVE_URL.removeprefix("https://"),
            "custom_meta": {"keep": True},
        }
        expected_priority = {
            "custom_meta": {"keep": True},
            "api_base_url_host": SAFE_URL_PLACEHOLDER,
            "api_url_host": "example.com",
        }
        old_host_only = {
            "api_url_host": "url-user:url-pass@example.com/v2?token=query-secret#fragment",
            "api_base_url_host": WINDOWS_SECRET_PATH,
            "custom_meta": "keep",
        }
        expected_old_host = {
            "custom_meta": "keep",
            "api_base_url_host": SAFE_URL_PLACEHOLDER,
            "api_url_host": "example.com",
        }

        for value, expected in (
            (raw_priority, expected_priority),
            (old_host_only, expected_old_host),
        ):
            with self.subTest(value=value):
                sanitized = webapp.sanitize_history_meta(value)
                self.assertEqual(expected, sanitized)
                self.assertEqual(sanitized, webapp.sanitize_history_meta(sanitized))
                assert_client_payload_is_sanitized(self, sanitized)

    def test_client_error_sanitizer_redacts_keys_urls_assignments_and_paths(self) -> None:
        sanitized = webapp.sanitize_client_error(
            SENSITIVE_ERROR,
            secrets=[EXACT_SECRET],
        )

        assert_client_payload_is_sanitized(self, sanitized)
        self.assertIn("ConnectionError", sanitized)
        self.assertIn("https://example.com", sanitized)
        self.assertNotIn("/v1", sanitized)
        self.assertNotIn("safe=ok", sanitized)
        self.assertIn("Bearer ***", sanitized)

    def test_extract_error_message_sanitizes_json_html_and_text_payloads(self) -> None:
        class RawResponse:
            def __init__(self, content, *, status_code=502, payload_error=None):
                self.status_code = status_code
                self.content = content
                self.text = content.decode("utf-8")
                self.payload_error = payload_error

            def json(self):
                if self.payload_error is not None:
                    raise self.payload_error
                return json.loads(self.text)

        responses = [
            FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=401),
            RawResponse(f"<html><title>{SENSITIVE_ERROR}</title></html>".encode("utf-8")),
            RawResponse(SENSITIVE_ERROR.encode("utf-8")),
        ]

        for response in responses:
            with self.subTest(content=response.text[:20]):
                message = webapp.extract_error_message(
                    response,
                    secrets=[EXACT_SECRET],
                )
                assert_client_payload_is_sanitized(self, message)

    async def test_gpt_response_processes_only_requested_url_candidates(self) -> None:
        download_calls = []

        class DownloadExecutor:
            async def run(self, kind, function, *args, before_start=None, **kwargs):
                del function, kwargs
                if kind != "download":
                    raise AssertionError(f"unexpected executor kind: {kind}")
                if before_start is not None:
                    before_start()
                download_calls.append(args[0])
                return {
                    "src": f"data:image/png;base64,{PNG_1X1}",
                    "mime_type": "image/png",
                    "source": "downloaded-url",
                }

        payload = {
            "data": [
                {"url": f"https://example.com/result-{index:02d}.png"}
                for index in range(25)
            ]
        }
        budget = webapp.UpstreamImageBudget(max_images=10, max_bytes=1024 * 1024)
        with patch.object(webapp, "UPSTREAM_EXECUTOR", DownloadExecutor()):
            images = await webapp.build_gpt_images_from_response_async(
                payload,
                max_images=3,
                budget=budget,
            )

        self.assertEqual(3, len(images))
        self.assertEqual(
            [f"https://example.com/result-{index:02d}.png" for index in range(3)],
            download_calls,
        )

    def test_gpt_url_budget_stops_before_starting_next_download(self) -> None:
        class StreamingResponse:
            headers = {
                "Content-Type": "image/png",
                "Content-Length": str(len(PNG_1X1_RAW)),
            }

            def raise_for_status(self):
                return None

            def iter_content(self, _chunk_size):
                yield PNG_1X1_RAW

            def close(self):
                return None

        payload = {
            "data": [
                {"url": f"https://example.com/result-{index}.png"}
                for index in range(3)
            ]
        }
        budget = webapp.UpstreamImageBudget(
            max_images=10,
            max_bytes=len(PNG_1X1_RAW) * 2,
        )
        with patch.object(
            webapp.requests,
            "get",
            side_effect=[StreamingResponse(), StreamingResponse(), StreamingResponse()],
        ) as remote_get:
            with self.assertRaises(webapp.UpstreamResultLimitError):
                webapp.build_gpt_images_from_response(
                    payload,
                    max_images=3,
                    budget=budget,
                )

        self.assertEqual(2, remote_get.call_count)

    def test_gpt_url_and_base64_results_share_one_byte_budget(self) -> None:
        class StreamingResponse:
            headers = {
                "Content-Type": "image/png",
                "Content-Length": str(len(PNG_1X1_RAW)),
            }

            def raise_for_status(self):
                return None

            def iter_content(self, _chunk_size):
                yield PNG_1X1_RAW

            def close(self):
                return None

        budget = webapp.UpstreamImageBudget(
            max_images=10,
            max_bytes=(len(PNG_1X1_RAW) * 2) - 1,
        )
        with patch.object(webapp.requests, "get", return_value=StreamingResponse()) as remote_get:
            with self.assertRaises(webapp.UpstreamResultLimitError):
                webapp.build_gpt_images_from_response(
                    {
                        "data": [
                            {"url": "https://example.com/first.png"},
                            {"b64_json": PNG_1X1},
                        ]
                    },
                    max_images=2,
                    budget=budget,
                )

        remote_get.assert_called_once()
        self.assertEqual(1, budget.image_count)
        self.assertEqual(len(PNG_1X1_RAW), budget.total_bytes)

    def test_invalid_base64_candidates_consume_checked_byte_budget(self) -> None:
        first_invalid_raw = b"not-a-raster-candidate-000000001"
        second_invalid_raw = b"not-a-raster-candidate-000000002"
        first_invalid_base64 = base64.b64encode(first_invalid_raw).decode("ascii")
        second_invalid_base64 = base64.b64encode(second_invalid_raw).decode("ascii")
        budget = webapp.UpstreamImageBudget(
            max_images=10,
            max_bytes=len(first_invalid_raw) + len(second_invalid_raw) - 1,
        )

        with self.assertRaises(webapp.UpstreamResultLimitError):
            webapp.build_gpt_images_from_response(
                {
                    "data": [
                        {"b64_json": first_invalid_base64},
                        {"b64_json": second_invalid_base64},
                    ]
                },
                max_images=2,
                budget=budget,
            )

        self.assertEqual(0, budget.image_count)
        self.assertEqual(len(first_invalid_raw), budget.total_bytes)

    def test_invalid_remote_candidates_consume_checked_byte_budget(self) -> None:
        invalid_raw = b"not-a-raster-candidate-000000000"

        class StreamingResponse:
            headers = {
                "Content-Type": "image/png",
                "Content-Length": str(len(invalid_raw)),
            }

            def __init__(self) -> None:
                self.iter_calls = 0

            def raise_for_status(self):
                return None

            def iter_content(self, _chunk_size):
                self.iter_calls += 1
                yield invalid_raw

            def close(self):
                return None

        first = StreamingResponse()
        second = StreamingResponse()
        budget = webapp.UpstreamImageBudget(
            max_images=10,
            max_bytes=(len(invalid_raw) * 2) - 1,
        )
        with patch.object(
            webapp.requests,
            "get",
            side_effect=[first, second],
        ):
            with self.assertRaises(webapp.UpstreamResultLimitError):
                webapp.build_gpt_images_from_response(
                    {
                        "data": [
                            {"url": "https://example.com/invalid-1.png"},
                            {"url": "https://example.com/invalid-2.png"},
                        ]
                    },
                    max_images=2,
                    budget=budget,
                )

        self.assertEqual(1, first.iter_calls)
        self.assertEqual(0, second.iter_calls)
        self.assertEqual(0, budget.image_count)
        self.assertEqual(len(invalid_raw), budget.total_bytes)

    def test_banana_response_accepts_at_most_one_image_candidate(self) -> None:
        payload = {
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
                            for _ in range(5)
                        ]
                    }
                }
            ]
        }
        budget = webapp.UpstreamImageBudget(max_images=10, max_bytes=1024 * 1024)

        parsed = webapp.extract_banana_images(payload, budget=budget, max_images=1)

        self.assertEqual(1, len(parsed["images"]))
        self.assertEqual(1, budget.image_count)
        self.assertEqual(len(PNG_1X1_RAW), budget.total_bytes)

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

    async def test_gpt_mask_is_forwarded_with_the_first_edit_image(self) -> None:
        executor = RecordingExecutor()
        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", side_effect=self._gpt_post),
        ):
            response = await self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "replace the selected area with a blue sky",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "api_endpoint": "auto",
                },
                files=[
                    ("reference_files", ("base.png", PNG_1X1_RAW, "image/png")),
                    ("mask_file", ("mask.png", PNG_RGBA_1X1_RAW, "image/png")),
                ],
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(1, len(executor.calls))
        self.assertTrue(str(executor.calls[0]["args"][0]).endswith("/v1/images/edits"))
        files = executor.calls[0]["kwargs"]["files"]
        self.assertEqual(["image[]", "mask"], [item[0] for item in files])
        self.assertEqual("image/png", files[1][1][2])
        request_data = executor.calls[0]["kwargs"]["data"]
        self.assertFalse(request_data["enhance_prompt"])
        self.assertIn("必须把遮罩定义的可编辑区域作为唯一修改范围", request_data["prompt"])
        self.assertTrue(response.json()["meta"]["strict_mask"])
        self.assertEqual("standard", response.json()["meta"]["mask_encoding"])

    async def test_gpt_mask_rejects_targetless_style_prompt_before_upstream(self) -> None:
        executor = RecordingExecutor()
        with (
            patch.object(webapp, "UPSTREAM_EXECUTOR", executor),
            patch.object(webapp.requests, "post", side_effect=self._gpt_post),
        ):
            response = await self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "只修改红色遮罩覆盖的部分，让那个区域换一种风格。",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "api_endpoint": "auto",
                },
                files=[
                    ("reference_files", ("base.png", PNG_1X1_RAW, "image/png")),
                    ("mask_file", ("mask.png", PNG_RGBA_1X1_RAW, "image/png")),
                ],
            )

        self.assertEqual(400, response.status_code)
        self.assertIn("请明确写出涂红区域要改成什么", response.json()["detail"])
        self.assertEqual([], executor.calls)

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

        def fake_download(_url, _budget=None):
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

    async def test_banana_batch_size_caps_final_image_count_when_each_batch_returns_many(self) -> None:
        multi_image_payload = {
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
                            for _ in range(4)
                        ]
                    }
                }
            ]
        }

        class MultiImageBananaSession:
            def post(self, *_args, **_kwargs):
                return FakeJsonResponse(multi_image_payload)

        with patch.object(webapp, "create_requests_session", return_value=MultiImageBananaSession()):
            response = await self.client.post(
                "/api/generate/banana",
                data={
                    "prompt": "square",
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                    "batch_size": "2",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(2, len(response.json()["images"]))
        self.assertEqual(2, response.json()["meta"]["image_count"])

    async def test_gpt_retry_budget_overflow_saves_no_partial_images_or_history(self) -> None:
        with (
            patch.object(webapp, "UPSTREAM_RESULT_MAX_BYTES", (len(PNG_1X1_RAW) * 2) - 1, create=True),
            patch.object(
                webapp.requests,
                "post",
                side_effect=[
                    FakeJsonResponse({"data": [{"b64_json": PNG_1X1}]}),
                    FakeJsonResponse({"data": [{"b64_json": PNG_1X1}]}),
                ],
            ) as upstream_post,
            patch.object(webapp, "save_generated_images") as save_images,
            patch.object(webapp, "append_generation_history") as append_history,
        ):
            response = await self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "square",
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "n": "2",
                },
            )

        self.assertEqual(502, response.status_code)
        self.assertEqual("上游图片结果超过请求级安全预算", response.json()["detail"])
        self.assertEqual(2, upstream_post.call_count)
        save_images.assert_not_called()
        append_history.assert_not_called()
        self.assertFalse((self.outputs / "history.json").exists())

    async def test_banana_batches_share_byte_budget_and_save_no_partial_results(self) -> None:
        class SingleImageBananaSession:
            def post(self, *_args, **_kwargs):
                return FakeBananaImageResponse()

        with (
            patch.object(webapp, "UPSTREAM_RESULT_MAX_BYTES", (len(PNG_1X1_RAW) * 2) - 1, create=True),
            patch.object(webapp, "create_requests_session", return_value=SingleImageBananaSession()),
            patch.object(webapp, "save_generated_images") as save_images,
            patch.object(webapp, "append_generation_history") as append_history,
        ):
            response = await self.client.post(
                "/api/generate/banana",
                data={
                    "prompt": "square",
                    "api_key": "banana-test-key",
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                    "batch_size": "2",
                },
            )

        self.assertEqual(502, response.status_code)
        self.assertEqual("上游图片结果超过请求级安全预算", response.json()["detail"])
        save_images.assert_not_called()
        append_history.assert_not_called()
        self.assertFalse((self.outputs / "history.json").exists())

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

    async def test_banana_generation_meta_never_exposes_endpoint_secrets_or_paths(self) -> None:
        class SequenceSession:
            def __init__(self, outcomes):
                self.outcomes = list(outcomes)

            def post(self, *_args, **_kwargs):
                outcome = self.outcomes.pop(0)
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome

        cases = [
            (
                SENSITIVE_URL,
                [webapp.requests.ConnectionError(SENSITIVE_ERROR)],
                "1",
                "example.com",
                False,
            ),
            (
                WINDOWS_SECRET_PATH,
                [FakeBananaImageResponse(), webapp.requests.ConnectionError(SENSITIVE_ERROR)],
                "2",
                SAFE_URL_PLACEHOLDER,
                True,
            ),
            (
                POSIX_SECRET_PATH,
                [FakeBananaImageResponse(), webapp.requests.ConnectionError(SENSITIVE_ERROR)],
                "2",
                SAFE_URL_PLACEHOLDER,
                True,
            ),
        ]
        for api_base_url, outcomes, batch_size, expected_hint, expect_history in cases:
            with self.subTest(api_base_url=api_base_url), patch.object(
                webapp,
                "create_requests_session",
                return_value=SequenceSession(outcomes),
            ):
                response = await self.client.post(
                    "/api/generate/banana",
                    data={
                        "prompt": "square",
                        "api_key": EXACT_SECRET,
                        "api_base_url": api_base_url,
                        "model_type": "gemini-test",
                        "batch_size": batch_size,
                    },
                )

            self.assertEqual(200, response.status_code)
            payload = response.json()
            assert_client_payload_is_sanitized(self, payload)
            self.assertEqual(expected_hint, payload["meta"]["api_base_url"])
            if expect_history:
                self.assertIsNotNone(payload["history_entry"])
                self.assertEqual(
                    expected_hint,
                    payload["history_entry"]["meta"]["api_base_url_host"],
                )
            else:
                self.assertIsNone(payload["history_entry"])

    async def test_gpt_generation_meta_never_exposes_endpoint_secrets_or_paths(self) -> None:
        cases = [
            (SENSITIVE_URL, "example.com"),
            (WINDOWS_SECRET_PATH, SAFE_URL_PLACEHOLDER),
            (POSIX_SECRET_PATH, SAFE_URL_PLACEHOLDER),
        ]
        for base_url, expected_hint in cases:
            with self.subTest(base_url=base_url), patch.object(
                webapp.requests,
                "post",
                return_value=FakeJsonResponse({"data": [{"b64_json": PNG_1X1}]}),
            ):
                response = await self.client.post(
                    "/api/generate/gpt-image-2",
                    data={
                        "prompt": "square",
                        "api_key": EXACT_SECRET,
                        "base_url": base_url,
                        "model": "gpt-image-2",
                    },
                )

            self.assertEqual(200, response.status_code)
            payload = response.json()
            assert_client_payload_is_sanitized(self, payload)
            self.assertEqual(expected_hint, payload["meta"]["api_url"])
            self.assertEqual(
                expected_hint,
                payload["history_entry"]["meta"]["api_url_host"],
            )

    async def test_chat_meta_uses_safe_endpoint_hints_for_both_engines(self) -> None:
        class BananaSession:
            def post(self, *_args, **_kwargs):
                return FakeBananaTextResponse()

        with patch.object(
            webapp.requests,
            "post",
            return_value=FakeJsonResponse({"choices": [{"message": {"content": "OK"}}]}),
        ):
            gpt = await self.client.post(
                "/api/chat/gpt-image-2",
                json={
                    "prompt": "hello",
                    "api_key": EXACT_SECRET,
                    "base_url": SENSITIVE_URL,
                    "chat_model": "gpt-test",
                },
            )
        with patch.object(
            webapp,
            "create_requests_session",
            return_value=BananaSession(),
        ):
            banana = await self.client.post(
                "/api/chat/banana",
                json={
                    "prompt": "hello",
                    "api_key": EXACT_SECRET,
                    "api_base_url": SENSITIVE_URL,
                    "model_type": "gemini-test",
                },
            )

        for response in (gpt, banana):
            self.assertEqual(200, response.status_code)
            payload = response.json()
            assert_client_payload_is_sanitized(self, payload)
            self.assertEqual("example.com", payload["meta"]["api_base_url_host"])

    async def test_legacy_history_meta_is_sanitized_on_read_and_patch_writeback(self) -> None:
        self.outputs.mkdir(parents=True, exist_ok=True)
        target_id = "history-raw-priority"
        history_payload = {
            "version": 1,
            "updated_at": "2026-07-11T10:00:00",
            "entries": [
                {
                    "id": target_id,
                    "created_at": "2026-07-11T10:00:00",
                    "favorite": False,
                    "prompt": "legacy raw priority",
                    "images": [],
                    "unknown_entry_field": {"keep": True},
                    "meta": {
                        "api_url": f"{SENSITIVE_URL}#private-fragment",
                        "api_url_host": WINDOWS_SECRET_PATH,
                        "api_base_url": POSIX_SECRET_PATH,
                        "api_base_url_host": SENSITIVE_URL.removeprefix("https://"),
                        "custom_meta": {"keep": "raw-priority"},
                    },
                },
                {
                    "id": "history-old-host-only",
                    "created_at": "2026-07-11T09:00:00",
                    "favorite": False,
                    "prompt": "legacy host only",
                    "images": [],
                    "meta": {
                        "api_url_host": "url-user:url-pass@example.com/v2?token=query-secret#fragment",
                        "api_base_url_host": WINDOWS_SECRET_PATH,
                        "custom_meta": "keep-old-host",
                    },
                },
            ],
        }
        self.outputs.joinpath("history.json").write_text(
            json.dumps(history_payload, ensure_ascii=False),
            encoding="utf-8",
        )
        original_bytes = self.outputs.joinpath("history.json").read_bytes()

        first_read = await self.client.get("/api/history")

        self.assertEqual(200, first_read.status_code)
        self.assertEqual(original_bytes, self.outputs.joinpath("history.json").read_bytes())
        first_entries = {entry["id"]: entry for entry in first_read.json()["entries"]}
        self.assertEqual(
            {
                "custom_meta": {"keep": "raw-priority"},
                "api_base_url_host": SAFE_URL_PLACEHOLDER,
                "api_url_host": "example.com",
            },
            first_entries[target_id]["meta"],
        )
        self.assertEqual(
            {
                "custom_meta": "keep-old-host",
                "api_base_url_host": SAFE_URL_PLACEHOLDER,
                "api_url_host": "example.com",
            },
            first_entries["history-old-host-only"]["meta"],
        )
        self.assertEqual({"keep": True}, first_entries[target_id]["unknown_entry_field"])
        assert_client_payload_is_sanitized(self, first_read.json())

        updated = await self.client.patch(
            f"/api/history/{target_id}",
            json={"favorite": True},
        )

        self.assertEqual(200, updated.status_code)
        self.assertTrue(updated.json()["entry"]["favorite"])
        self.assertEqual("example.com", updated.json()["entry"]["meta"]["api_url_host"])
        self.assertEqual(SAFE_URL_PLACEHOLDER, updated.json()["entry"]["meta"]["api_base_url_host"])
        assert_client_payload_is_sanitized(self, updated.json())

        persisted = json.loads(self.outputs.joinpath("history.json").read_text(encoding="utf-8"))
        persisted_entries = {entry["id"]: entry for entry in persisted["entries"]}
        for entry in persisted_entries.values():
            self.assertNotIn("api_url", entry.get("meta", {}))
            self.assertNotIn("api_base_url", entry.get("meta", {}))
        self.assertEqual("example.com", persisted_entries[target_id]["meta"]["api_url_host"])
        self.assertEqual(SAFE_URL_PLACEHOLDER, persisted_entries[target_id]["meta"]["api_base_url_host"])
        self.assertEqual("example.com", persisted_entries["history-old-host-only"]["meta"]["api_url_host"])
        assert_client_payload_is_sanitized(self, persisted)

        second_read = await self.client.get("/api/history")
        self.assertEqual(200, second_read.status_code)
        assert_client_payload_is_sanitized(self, second_read.json())

    async def test_chat_captured_errors_use_stable_codes_for_both_engines(self) -> None:
        class BananaSession:
            def __init__(self, outcome):
                self.outcome = outcome

            def post(self, *_args, **_kwargs):
                if isinstance(self.outcome, Exception):
                    raise self.outcome
                return self.outcome

        async def post_gpt(outcome):
            kwargs = {"side_effect": outcome} if isinstance(outcome, Exception) else {"return_value": outcome}
            with patch.object(webapp.requests, "post", **kwargs):
                return await self.client.post(
                    "/api/chat/gpt-image-2",
                    json={
                        "prompt": "hello",
                        "api_key": EXACT_SECRET,
                        "base_url": "https://example.com/v1",
                        "chat_model": "gpt-test",
                    },
                )

        async def post_banana(outcome):
            with patch.object(
                webapp,
                "create_requests_session",
                return_value=BananaSession(outcome),
            ):
                return await self.client.post(
                    "/api/chat/banana",
                    json={
                        "prompt": "hello",
                        "api_key": EXACT_SECRET,
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                    },
                )

        cases = [
            (
                await post_gpt(webapp.requests.ConnectionError(SENSITIVE_ERROR)),
                502,
                "E_UPSTREAM_NETWORK",
            ),
            (
                await post_banana(webapp.requests.ConnectionError(SENSITIVE_ERROR)),
                502,
                "E_UPSTREAM_NETWORK",
            ),
            (
                await post_gpt(
                    FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=401)
                ),
                401,
                "E_UPSTREAM_AUTH",
            ),
            (
                await post_banana(
                    FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=403)
                ),
                403,
                "E_UPSTREAM_AUTH",
            ),
            (
                await post_gpt(
                    FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=429)
                ),
                429,
                "E_UPSTREAM_RATE_LIMIT",
            ),
            (
                await post_gpt(
                    FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=422)
                ),
                400,
                "E_UPSTREAM_REQUEST",
            ),
            (
                await post_banana(webapp.requests.Timeout(SENSITIVE_ERROR)),
                504,
                "E_UPSTREAM_TIMEOUT",
            ),
        ]

        for response, status_code, error_code in cases:
            with self.subTest(status_code=status_code, error_code=error_code):
                assert_stable_http_error(self, response, status_code, error_code)

    async def test_generation_captured_errors_use_stable_codes_for_both_engines(self) -> None:
        class BananaSession:
            def __init__(self, outcome):
                self.outcome = outcome

            def post(self, *_args, **_kwargs):
                if isinstance(self.outcome, Exception):
                    raise self.outcome
                return self.outcome

        class InvalidJsonResponse:
            ok = True
            status_code = 200
            content = b"not-json"
            text = "not-json"

            def json(self):
                raise RuntimeError(SENSITIVE_ERROR)

        async def post_gpt(outcome):
            kwargs = {"side_effect": outcome} if isinstance(outcome, Exception) else {"return_value": outcome}
            with patch.object(webapp.requests, "post", **kwargs), patch.object(
                webapp.asyncio,
                "sleep",
                new_callable=AsyncMock,
            ):
                return await self.client.post(
                    "/api/generate/gpt-image-2",
                    data={
                        "prompt": "square",
                        "api_key": EXACT_SECRET,
                        "base_url": "https://example.com/v1",
                        "model": "gpt-image-2",
                    },
                )

        async def post_banana(outcome):
            with patch.object(
                webapp,
                "create_requests_session",
                return_value=BananaSession(outcome),
            ):
                return await self.client.post(
                    "/api/generate/banana",
                    data={
                        "prompt": "square",
                        "api_key": EXACT_SECRET,
                        "api_base_url": "https://example.com",
                        "model_type": "gemini-test",
                        "batch_size": "1",
                    },
                )

        gpt_cases = [
            (
                await post_gpt(webapp.requests.ConnectionError(SENSITIVE_ERROR)),
                502,
                "E_UPSTREAM_NETWORK",
            ),
            (
                await post_gpt(
                    FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=400)
                ),
                400,
                "E_UPSTREAM_REQUEST",
            ),
            (
                await post_gpt(
                    FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=500)
                ),
                502,
                "E_UPSTREAM_RESPONSE",
            ),
            (
                await post_gpt(InvalidJsonResponse()),
                502,
                "E_UPSTREAM_RESPONSE",
            ),
        ]
        for response, status_code, error_code in gpt_cases:
            with self.subTest(engine="gpt", error_code=error_code):
                assert_stable_http_error(self, response, status_code, error_code)

        banana_cases = [
            (
                await post_banana(webapp.requests.ConnectionError(SENSITIVE_ERROR)),
                "E_UPSTREAM_NETWORK",
            ),
            (
                await post_banana(InvalidJsonResponse()),
                "E_UPSTREAM_RESPONSE",
            ),
            (
                await post_banana(
                    FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, status_code=401)
                ),
                "E_UPSTREAM_AUTH",
            ),
        ]
        for response, error_code in banana_cases:
            with self.subTest(engine="banana", error_code=error_code):
                self.assertEqual(200, response.status_code)
                payload = response.json()
                self.assertEqual(error_code, payload.get("error_code"))
                self.assertEqual(
                    [f"第 1 批：{CLIENT_ERROR_DETAILS[error_code]}"],
                    payload.get("messages"),
                )
                assert_client_payload_is_sanitized(self, payload)

    async def test_gpt_unknown_parameter_retry_keeps_raw_message_internal(self) -> None:
        calls = []

        def post(_url, **kwargs):
            calls.append(dict(kwargs.get("json") or kwargs.get("data") or {}))
            if len(calls) == 1:
                return FakeJsonResponse(
                    {"error": {"message": f"Unknown parameter: seed {SENSITIVE_ERROR}"}},
                    status_code=400,
                )
            return FakeJsonResponse({"data": [{"b64_json": PNG_1X1}]})

        with patch.object(webapp.requests, "post", side_effect=post):
            response = await self.client.post(
                "/api/generate/gpt-image-2",
                data={
                    "prompt": "square",
                    "api_key": EXACT_SECRET,
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                    "seed": "7",
                },
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual(2, len(calls))
        self.assertEqual(7, calls[0].get("seed"))
        self.assertNotIn("seed", calls[1])
        assert_client_payload_is_sanitized(self, response.json())

    async def test_diagnostics_and_open_outputs_use_stable_codes(self) -> None:
        with patch.object(
            webapp.requests,
            "post",
            side_effect=webapp.requests.ConnectionError(SENSITIVE_ERROR),
        ):
            diagnostic = await self.client.post(
                "/api/diagnostics",
                json={
                    "engine": "gpt-image-2",
                    "checks": ["generation"],
                    "api_key": EXACT_SECRET,
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                },
            )
        with patch.object(
            webapp,
            "open_local_directory",
            side_effect=OSError(SENSITIVE_ERROR.replace(EXACT_SECRET, "open-output-error")),
        ):
            open_outputs = await self.client.post("/api/open-outputs")

        self.assertEqual(200, diagnostic.status_code)
        diagnostic_payload = diagnostic.json()
        result = diagnostic_payload["results"][0]
        self.assertEqual("E_UPSTREAM_NETWORK", result.get("error_code"))
        self.assertEqual(CLIENT_ERROR_DETAILS["E_UPSTREAM_NETWORK"], result.get("error"))
        self.assertEqual("https://example.com", result.get("endpoint"))
        self.assertIsInstance(result.get("latency_ms"), int)
        assert_client_payload_is_sanitized(self, diagnostic_payload)
        assert_stable_http_error(
            self,
            open_outputs,
            500,
            "E_LOCAL_OPEN_OUTPUTS",
        )

    async def test_gpt_generation_diagnostic_requires_a_valid_raster_result(self) -> None:
        with patch.object(
            webapp.requests,
            "post",
            return_value=FakeJsonResponse({"data": [{"b64_json": "not-a-raster"}]}),
        ):
            response = await self.client.post(
                "/api/diagnostics",
                json={
                    "engine": "gpt-image-2",
                    "checks": ["generation"],
                    "api_key": "sk-test",
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                },
            )

        self.assertEqual(200, response.status_code)
        result = response.json()["results"][0]
        self.assertFalse(result["ok"])
        self.assertEqual(502, result.get("status_code"))
        self.assertEqual("E_UPSTREAM_RESPONSE", result.get("error_code"))

    async def test_all_diagnostics_use_public_status_classification(self) -> None:
        class BananaSession:
            def __init__(self, outcome):
                self.outcome = outcome

            def post(self, *_args, **_kwargs):
                if isinstance(self.outcome, Exception):
                    raise self.outcome
                return self.outcome

        class InvalidJsonResponse:
            ok = True
            status_code = 200
            content = SENSITIVE_ERROR.encode("utf-8")
            text = SENSITIVE_ERROR

            def json(self):
                raise RuntimeError(SENSITIVE_ERROR)

        runners = [
            (
                "gpt-generation",
                webapp.run_gpt_generation_diagnostic,
                {
                    "api_key": EXACT_SECRET,
                    "base_url": "https://example.com/v1",
                    "model": "gpt-image-2",
                },
                "gpt",
            ),
            (
                "gpt-chat",
                webapp.run_gpt_chat_diagnostic,
                {
                    "api_key": EXACT_SECRET,
                    "base_url": "https://example.com/v1",
                    "chat_model": "gpt-test",
                },
                "gpt",
            ),
            (
                "banana-generation",
                webapp.run_banana_generation_diagnostic,
                {
                    "api_key": EXACT_SECRET,
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                },
                "banana",
            ),
            (
                "banana-chat",
                webapp.run_banana_chat_diagnostic,
                {
                    "api_key": EXACT_SECRET,
                    "api_base_url": "https://example.com",
                    "model_type": "gemini-test",
                },
                "banana",
            ),
        ]
        outcomes = [
            ("401", lambda: FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, 401), 401, "E_UPSTREAM_AUTH"),
            ("403", lambda: FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, 403), 403, "E_UPSTREAM_AUTH"),
            ("429", lambda: FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, 429), 429, "E_UPSTREAM_RATE_LIMIT"),
            ("422", lambda: FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, 422), 400, "E_UPSTREAM_REQUEST"),
            ("500", lambda: FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, 500), 502, "E_UPSTREAM_RESPONSE"),
            ("524", lambda: FakeJsonResponse({"error": {"message": SENSITIVE_ERROR}}, 524), 504, "E_UPSTREAM_TIMEOUT"),
            ("timeout", lambda: webapp.requests.Timeout(SENSITIVE_ERROR), 504, "E_UPSTREAM_TIMEOUT"),
            ("network", lambda: webapp.requests.ConnectionError(SENSITIVE_ERROR), 502, "E_UPSTREAM_NETWORK"),
            ("invalid", InvalidJsonResponse, 502, "E_UPSTREAM_RESPONSE"),
        ]

        for runner_name, runner, payload, transport in runners:
            for outcome_name, outcome_factory, expected_status, expected_code in outcomes:
                outcome = outcome_factory()
                with self.subTest(runner=runner_name, outcome=outcome_name):
                    if transport == "gpt":
                        kwargs = (
                            {"side_effect": outcome}
                            if isinstance(outcome, Exception)
                            else {"return_value": outcome}
                        )
                        with patch.object(webapp.requests, "post", **kwargs):
                            result = await runner(dict(payload), [EXACT_SECRET])
                    else:
                        with patch.object(
                            webapp,
                            "create_requests_session",
                            return_value=BananaSession(outcome),
                        ):
                            result = await runner(dict(payload), [EXACT_SECRET])

                    self.assertFalse(result["ok"])
                    self.assertEqual(expected_status, result.get("status_code"))
                    self.assertEqual(expected_code, result.get("error_code"))
                    self.assertEqual(CLIENT_ERROR_DETAILS[expected_code], result.get("error"))
                    self.assertNotIn("upstream_status_code", result)
                    assert_client_payload_is_sanitized(self, result)

    async def test_save_error_uses_fixed_message_and_code(self) -> None:
        image = {
            "src": f"data:image/png;base64,{PNG_1X1}",
            "mime_type": "image/png",
        }
        with patch.object(
            Path,
            "write_bytes",
            side_effect=OSError(SENSITIVE_ERROR),
        ):
            saved_count = webapp.save_generated_images("gpt-image-2", [image])

        self.assertEqual(0, saved_count)
        self.assertEqual("failed", image.get("save_status"))
        self.assertEqual(CLIENT_ERROR_DETAILS["E_LOCAL_SAVE_OUTPUT"], image.get("save_error"))
        self.assertEqual("E_LOCAL_SAVE_OUTPUT", image.get("save_error_code"))
        assert_client_payload_is_sanitized(self, image)


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

    async def _cancel_while_generation_stage_is_blocked(
        self,
        job_id: str,
        stage_entered: threading.Event,
        release_stage: threading.Event,
    ):
        watchdog_fired = threading.Event()

        def release_from_watchdog() -> None:
            watchdog_fired.set()
            release_stage.set()

        async def cancel_after_stage_entered():
            if not await asyncio.to_thread(stage_entered.wait, 1):
                raise AssertionError("generation stage did not block")
            return await self.client.post(f"/api/jobs/{job_id}/cancel")

        cancel_task = asyncio.create_task(cancel_after_stage_entered())
        generation_task = asyncio.create_task(self._post_gpt_generation(job_id))
        watchdog = threading.Timer(0.5, release_from_watchdog)
        watchdog.start()
        try:
            cancel = await cancel_task
            cancel_completed_before_watchdog = not watchdog_fired.is_set()
            release_stage.set()
            generation = await generation_task
        finally:
            release_stage.set()
            watchdog.cancel()

        return cancel, generation, cancel_completed_before_watchdog

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

    async def test_cancel_request_runs_while_endpoint_save_is_in_progress(self) -> None:
        job_id = "job-save-endpoint"
        save_entered = threading.Event()
        release_save = threading.Event()
        original_save = webapp.save_generated_images

        def save_then_block(*args, **kwargs):
            saved_count = original_save(*args, **kwargs)
            save_entered.set()
            release_save.wait(2)
            return saved_count

        with (
            patch.object(webapp.requests, "post", return_value=self._gpt_image_response()),
            patch.object(webapp, "save_generated_images", side_effect=save_then_block),
        ):
            cancel, response, cancel_completed_before_watchdog = (
                await self._cancel_while_generation_stage_is_blocked(
                    job_id,
                    save_entered,
                    release_save,
                )
            )

        self.assertTrue(cancel_completed_before_watchdog)
        self.assertEqual(200, cancel.status_code)
        self.assertEqual(200, response.status_code)
        self.assertTrue(response.json()["canceled"])
        self.assertEqual([], response.json()["images"])
        self.assertIsNone(response.json()["history_entry"])
        self.assertEqual([], self._raster_outputs())
        self.assertFalse((self.outputs / "history.json").exists())

    async def test_cancel_request_runs_while_history_append_is_in_progress(self) -> None:
        job_id = "job-history-append"
        history_entered = threading.Event()
        release_history = threading.Event()
        original_append = webapp.append_generation_history

        def append_then_block(**kwargs):
            entry = original_append(**kwargs)
            history_entered.set()
            release_history.wait(2)
            return entry

        with (
            patch.object(webapp.requests, "post", return_value=self._gpt_image_response()),
            patch.object(webapp, "append_generation_history", side_effect=append_then_block),
        ):
            cancel, response, cancel_completed_before_watchdog = (
                await self._cancel_while_generation_stage_is_blocked(
                    job_id,
                    history_entered,
                    release_history,
                )
            )

        self.assertTrue(cancel_completed_before_watchdog)
        self.assertEqual(200, cancel.status_code)
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
