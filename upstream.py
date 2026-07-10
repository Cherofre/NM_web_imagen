from __future__ import annotations

import asyncio
from dataclasses import dataclass
import re
import threading
import time
from typing import Any, Callable, Dict, Literal, TypeVar


T = TypeVar("T")
RequestKind = Literal["generation", "chat", "download"]
JOB_ID_INVALID_PATTERN = re.compile(r"[^A-Za-z0-9._:-]+")


class JobCancelled(RuntimeError):
    pass


def normalize_job_id(value: Any, *, allow_empty: bool = True) -> str:
    raw = "" if value is None else str(value).strip()
    if not raw:
        if allow_empty:
            return ""
        raise ValueError("job_id 无效")
    normalized = JOB_ID_INVALID_PATTERN.sub("-", raw).strip("-")[:160]
    if not normalized:
        if allow_empty:
            return ""
        raise ValueError("job_id 无效")
    return normalized


@dataclass
class JobState:
    canceled: bool
    touched_at: float


class JobRegistry:
    def __init__(
        self,
        ttl_seconds: float = 3600,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.ttl_seconds = max(0.0, float(ttl_seconds))
        self._clock = clock
        self._items: Dict[str, JobState] = {}
        self._lock = threading.RLock()

    def _prune_locked(self, now: float) -> None:
        cutoff = now - self.ttl_seconds
        for job_id in [
            job_id
            for job_id, state in self._items.items()
            if state.touched_at < cutoff
        ]:
            self._items.pop(job_id, None)

    def register(self, job_id: str) -> None:
        if not job_id:
            return
        with self._lock:
            now = self._clock()
            self._prune_locked(now)
            state = self._items.get(job_id)
            if state is None:
                self._items[job_id] = JobState(canceled=False, touched_at=now)
            else:
                state.touched_at = now

    def cancel(self, job_id: str) -> bool:
        if not job_id:
            return False
        with self._lock:
            now = self._clock()
            self._prune_locked(now)
            state = self._items.get(job_id)
            if state is None:
                self._items[job_id] = JobState(canceled=True, touched_at=now)
            else:
                state.canceled = True
                state.touched_at = now
            return True

    def raise_if_canceled(self, job_id: str) -> None:
        if not job_id:
            return
        with self._lock:
            now = self._clock()
            self._prune_locked(now)
            state = self._items.get(job_id)
            if state is None:
                return
            state.touched_at = now
            if state.canceled:
                raise JobCancelled("任务已取消")

    def forget(self, job_id: str) -> None:
        if not job_id:
            return
        with self._lock:
            self._items.pop(job_id, None)


class UpstreamExecutor:
    def __init__(
        self,
        generation_limit: int = 2,
        chat_limit: int = 4,
        download_limit: int = 4,
    ) -> None:
        self._limits: Dict[RequestKind, int] = {
            "generation": self._validated_limit(generation_limit),
            "chat": self._validated_limit(chat_limit),
            "download": self._validated_limit(download_limit),
        }
        self._loop_lock = threading.RLock()
        self._loop_semaphores: Dict[
            asyncio.AbstractEventLoop,
            Dict[RequestKind, asyncio.Semaphore],
        ] = {}

    @staticmethod
    def _validated_limit(value: int) -> int:
        limit = int(value)
        if limit < 1:
            raise ValueError("上游并发上限必须至少为 1")
        return limit

    def _semaphore_for_current_loop(self, kind: RequestKind) -> asyncio.Semaphore:
        if kind not in self._limits:
            raise ValueError(f"不支持的上游请求类型: {kind}")
        loop = asyncio.get_running_loop()
        with self._loop_lock:
            for known_loop in [item for item in self._loop_semaphores if item.is_closed()]:
                self._loop_semaphores.pop(known_loop, None)
            semaphores = self._loop_semaphores.get(loop)
            if semaphores is None:
                semaphores = {
                    name: asyncio.Semaphore(limit)
                    for name, limit in self._limits.items()
                }
                self._loop_semaphores[loop] = semaphores
            return semaphores[kind]

    @staticmethod
    def _consume_background_result(task: asyncio.Task[Any]) -> None:
        try:
            task.result()
        except (asyncio.CancelledError, Exception):
            pass

    async def run(
        self,
        kind: RequestKind,
        function: Callable[..., T],
        *args: Any,
        before_start: Callable[[], None] | None = None,
        **kwargs: Any,
    ) -> T:
        semaphore = self._semaphore_for_current_loop(kind)
        permit_acquired = False

        async def worker() -> T:
            nonlocal permit_acquired
            await semaphore.acquire()
            permit_acquired = True
            try:
                if before_start is not None:
                    before_start()
                return await asyncio.to_thread(function, *args, **kwargs)
            finally:
                semaphore.release()

        worker_task = asyncio.create_task(worker())
        try:
            return await asyncio.shield(worker_task)
        except asyncio.CancelledError:
            if not permit_acquired:
                worker_task.cancel()
            worker_task.add_done_callback(self._consume_background_result)
            raise


def bounded_timeout(value: Any, *, default: int, maximum: int) -> int:
    try:
        maximum_value = max(10, int(maximum))
    except (TypeError, ValueError):
        maximum_value = 10

    try:
        default_value = int(default)
    except (TypeError, ValueError):
        default_value = 10
    if default_value <= 0:
        default_value = maximum_value
    default_value = max(10, min(default_value, maximum_value))

    if value is None or (isinstance(value, str) and not value.strip()):
        parsed = default_value
    else:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default_value

    if parsed <= 0:
        return maximum_value
    return max(10, min(parsed, maximum_value))


def banana_headers(api_key: str) -> Dict[str, str]:
    key = (api_key or "").strip()
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}",
        "X-API-Key": key,
        "x-goog-api-key": key,
        "X-Banana-Client": "image-generate-web-tool",
    }


def gpt_headers(
    api_key: str,
    *,
    accept: str = "*/*",
    content_type: str = "",
) -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {(api_key or '').strip()}",
        "Accept": accept,
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers
