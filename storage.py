from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import threading
from typing import Any, Callable, TypeVar
from uuid import uuid4


JsonValue = TypeVar("JsonValue")

_PATH_LOCKS_GUARD = threading.Lock()
_PATH_LOCKS: dict[Path, threading.RLock] = {}


def _resolved_path(path: Path | str) -> Path:
    return Path(path).expanduser().resolve()


def _lock_for(path: Path) -> threading.RLock:
    with _PATH_LOCKS_GUARD:
        lock = _PATH_LOCKS.get(path)
        if lock is None:
            lock = threading.RLock()
            _PATH_LOCKS[path] = lock
        return lock


def _read_json_unlocked(path: Path, fallback: JsonValue) -> Any | JsonValue:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, UnicodeError, json.JSONDecodeError):
        return deepcopy(fallback)


def read_json(path: Path | str, fallback: JsonValue) -> Any | JsonValue:
    resolved = _resolved_path(path)
    with _lock_for(resolved):
        return _read_json_unlocked(resolved, fallback)


def _atomic_write_json_unlocked(path: Path, payload: Any, *, backup: bool) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if backup and path.exists():
        shutil.copy2(path, path.with_name(f"{path.name}.bak"))

    temp_path = path.with_name(f"{path.name}.{uuid4().hex}.tmp")
    try:
        with temp_path.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


def atomic_write_json(path: Path | str, payload: Any, *, backup: bool = False) -> None:
    resolved = _resolved_path(path)
    with _lock_for(resolved):
        _atomic_write_json_unlocked(resolved, payload, backup=backup)


def mutate_json(
    path: Path | str,
    fallback: JsonValue,
    mutator: Callable[[Any | JsonValue], Any],
    *,
    backup: bool = False,
    after_write: Callable[[Any], None] | None = None,
) -> Any:
    resolved = _resolved_path(path)
    with _lock_for(resolved):
        current = _read_json_unlocked(resolved, fallback)
        updated = mutator(current)
        _atomic_write_json_unlocked(resolved, updated, backup=backup)
        if after_write is not None:
            try:
                after_write(updated)
            except Exception:
                pass
        return updated
