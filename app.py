import argparse
import asyncio
import base64
import ctypes
from datetime import datetime
import hashlib
from io import BytesIO
import ipaddress
import math
from html import unescape
import json
import mimetypes
import os
import random
import re
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple
from urllib.parse import quote, unquote, urlparse
from uuid import uuid4

import requests
import uvicorn
from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.datastructures import Headers
from PIL import Image, ImageOps

from image_safety import (
    REFERENCE_IMAGE_MAX_BYTES,
    REFERENCE_REQUEST_MAX_BYTES,
    REMOTE_RESULT_MAX_BYTES,
    ImageSafetyError,
    decode_raster_data_url,
    detect_raster_mime,
    raster_extension,
    resolve_output_image,
    validate_edit_mask_bytes,
    validate_raster_bytes,
)
from storage import atomic_write_json, mutate_json, read_json
from upstream import (
    JobCancelled,
    JobRegistry,
    UpstreamExecutor,
    banana_headers,
    bounded_timeout,
    gpt_headers,
    normalize_job_id,
)


APP_ASSET_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent)).resolve()
ROOT_DIR = Path(os.getenv("IMAGE_TOOL_DATA_ROOT") or APP_ASSET_ROOT).expanduser().resolve()
STATIC_DIR = APP_ASSET_ROOT / "static"
STUDIO_STATIC_DIR = STATIC_DIR / "studio"
OUTPUTS_DIR = Path(os.getenv("IMAGE_TOOL_OUTPUTS_ROOT") or (ROOT_DIR / "outputs")).expanduser().resolve()
OUTPUTS_URL_PREFIX = "/outputs"
VERSION_FILE = APP_ASSET_ROOT / "VERSION"
HISTORY_FILE = OUTPUTS_DIR / "history.json"
HISTORY_MAX_ENTRIES = 300
STUDIO_SESSIONS_FILE = OUTPUTS_DIR / "studio_sessions.json"
SESSION_REFS_DIR = OUTPUTS_DIR / "session_refs"
OUTPUTS_ROOT_LOCK = threading.RLock()
STUDIO_MAX_SESSIONS = 80
STUDIO_MAX_TURNS = 80
STUDIO_MAX_REFS_PER_TURN = 8
STUDIO_MAX_REF_FILES = 240
STUDIO_MAX_REF_BYTES = 256 * 1024 * 1024
STUDIO_TEXT_MAX_CHARS = 200_000
STUDIO_ERROR_MAX_CHARS = 8_000
STUDIO_IMAGE_STRING_MAX_CHARS = 8_192
STUDIO_META_MAX_DEPTH = 4
STUDIO_META_MAX_ITEMS = 50
STUDIO_META_STRING_MAX_CHARS = 8_192
STUDIO_META_MAX_BYTES = 64 * 1024
STUDIO_SESSION_JSON_MAX_BYTES = 32 * 1024 * 1024
CONFIG_FILE_CANDIDATES = [
    ROOT_DIR / "config.local.json",
    APP_ASSET_ROOT / "config.defaults.json",
]
PRIMARY_CONFIG_FILE = ROOT_DIR / "config.local.json"
DESKTOP_CONFIG_SECRET_PREFIX = "dpapi:v1:"


def compute_instance_id(root: Path = ROOT_DIR) -> str:
    normalized_root = str(Path(root).resolve()).replace("/", "\\").rstrip("\\").casefold()
    return hashlib.sha256(normalized_root.encode("utf-8")).hexdigest()[:20]


def storage_path_display(path: Path) -> str:
    """Return a stable user-facing path, relative when it belongs to the data root."""
    resolved = Path(path).resolve()
    try:
        return str(resolved.relative_to(ROOT_DIR)).replace("\\", "/")
    except ValueError:
        return str(resolved)

DEFAULT_BANANA_BASE_URL = "https://banana-api.example.com"
DEFAULT_BANANA_MODEL = "gemini-3-pro-image-preview"
DEFAULT_GPT_BASE_URL = "https://gpt-image-api.example.com"
DEFAULT_GPT_MODEL = "gpt-image-2"
DEFAULT_GPT_CHAT_MODEL = "gpt-5.6-sol"
MAX_CHAT_TIMEOUT = 600
MAX_GENERATION_TIMEOUT = 1800
# The reference payload budget is 150 MiB. Multipart headers, form fields, and
# boundaries get a separate fixed 2 MiB allowance, but never an unbounded one.
GENERATION_MULTIPART_OVERHEAD_BYTES = 2 * 1024 * 1024
GENERATION_MULTIPART_MAX_BYTES = REFERENCE_REQUEST_MAX_BYTES + GENERATION_MULTIPART_OVERHEAD_BYTES
STUDIO_SESSION_BODY_MAX_BYTES = 208 * 1024 * 1024
API_WRITE_MAX_BYTES = 2 * 1024 * 1024
GENERATION_MULTIPART_MAX_FILES = 16
GENERATION_MULTIPART_MAX_FIELDS = 64
GENERATION_MULTIPART_MAX_FIELD_BYTES = 1024 * 1024
UPSTREAM_RESULT_MAX_IMAGES = 10
UPSTREAM_RESULT_MAX_BYTES = 150 * 1024 * 1024
UPSTREAM_RESULT_LIMIT_MESSAGE = "上游图片结果超过请求级安全预算"
MASK_GUIDANCE_MAX_PIXELS = 8_294_400
PUBLIC_URL_PLACEHOLDER = "[invalid endpoint]"
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
UPSTREAM_EXECUTOR = UpstreamExecutor()
JOB_REGISTRY = JobRegistry()
GPT_REASONING_EFFORTS = {"auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"}


def normalize_gpt_chat_model(value: Any) -> str:
    model = str(value or "").strip()
    return "gpt-5.6-sol" if model == "gpt-5.6" else model


CONFIG_CONNECTION_FIELDS = {
    "banana-form": {"api_key", "api_base_url", "model_type"},
    "gpt-image-2-form": {"api_key", "base_url", "model", "chat_model", "reasoning_effort"},
}
ENGINE_FORM_IDS = {
    "banana": "banana-form",
    "gpt-image-2": "gpt-image-2-form",
}
FORM_ENGINES = {value: key for key, value in ENGINE_FORM_IDS.items()}


class UpstreamResultLimitError(ValueError):
    pass


class ClientSafeHTTPException(HTTPException):
    def __init__(
        self,
        *,
        status_code: int,
        error_code: str,
        detail: Optional[str] = None,
    ) -> None:
        super().__init__(
            status_code=status_code,
            detail=detail or CLIENT_ERROR_DETAILS[error_code],
        )
        self.error_code = error_code


def client_http_error(
    error_code: str,
    *,
    status_code: int,
    detail: Optional[str] = None,
) -> ClientSafeHTTPException:
    return ClientSafeHTTPException(
        status_code=status_code,
        error_code=error_code,
        detail=detail,
    )


def upstream_error_classification(status_code: int) -> Tuple[int, str]:
    normalized_status = int(status_code or 0)
    if normalized_status in {401, 403}:
        return normalized_status, "E_UPSTREAM_AUTH"
    if normalized_status == 429:
        return 429, "E_UPSTREAM_RATE_LIMIT"
    if normalized_status in {408, 504, 524}:
        return 504, "E_UPSTREAM_TIMEOUT"
    if 400 <= normalized_status < 500:
        return 400, "E_UPSTREAM_REQUEST"
    return 502, "E_UPSTREAM_RESPONSE"


class UpstreamImageBudget:
    def __init__(
        self,
        *,
        max_images: Optional[int] = None,
        max_bytes: Optional[int] = None,
    ) -> None:
        self.max_images = max(1, int(max_images if max_images is not None else UPSTREAM_RESULT_MAX_IMAGES))
        self.max_bytes = max(1, int(max_bytes if max_bytes is not None else UPSTREAM_RESULT_MAX_BYTES))
        self.accepted_images = 0
        self.checked_bytes = 0

    @property
    def image_count(self) -> int:
        return self.accepted_images

    @property
    def total_bytes(self) -> int:
        return self.checked_bytes

    @property
    def remaining_images(self) -> int:
        return max(0, self.max_images - self.accepted_images)

    @property
    def remaining_bytes(self) -> int:
        return max(0, self.max_bytes - self.checked_bytes)

    @property
    def remaining_checked_bytes(self) -> int:
        return self.remaining_bytes

    def ensure_image_slot(self) -> None:
        if self.remaining_images < 1 or self.remaining_bytes < 1:
            raise UpstreamResultLimitError(UPSTREAM_RESULT_LIMIT_MESSAGE)

    def charge_checked_bytes(self, byte_count: int) -> None:
        normalized_bytes = max(0, int(byte_count))
        if normalized_bytes > self.remaining_bytes:
            raise UpstreamResultLimitError(UPSTREAM_RESULT_LIMIT_MESSAGE)
        self.checked_bytes += normalized_bytes

    def accept_image(self) -> None:
        if self.remaining_images < 1:
            raise UpstreamResultLimitError(UPSTREAM_RESULT_LIMIT_MESSAGE)
        self.accepted_images += 1

    def consume(self, byte_count: int) -> None:
        """Backward-compatible combined accounting for already validated images."""
        self.ensure_image_slot()
        self.charge_checked_bytes(byte_count)
        self.accept_image()


def dev_cors_origins() -> List[str]:
    return [
        item.strip().rstrip("/")
        for item in os.getenv("IMAGE_TOOL_DEV_CORS_ORIGINS", "").split(",")
        if item.strip()
    ]


def normalize_http_origin(value: str) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw or raw.lower() == "null":
        return None
    try:
        parsed = urlparse(raw)
        if (
            parsed.scheme.lower() not in {"http", "https"}
            or not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            return None
        hostname = parsed.hostname
        port = parsed.port
    except (TypeError, ValueError):
        return None
    if not hostname:
        return None
    scheme = parsed.scheme.lower()
    normalized_host = hostname.lower()
    if ":" in normalized_host:
        normalized_host = f"[{normalized_host}]"
    default_port = 80 if scheme == "http" else 443
    suffix = f":{port}" if port is not None and port != default_port else ""
    return f"{scheme}://{normalized_host}{suffix}"


def request_host_is_allowed(value: str, server: Any) -> bool:
    raw = str(value or "").strip()
    if not raw:
        return False
    try:
        parsed = urlparse(f"//{raw}")
        if (
            not parsed.netloc
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.params
            or parsed.query
            or parsed.fragment
        ):
            return False
        hostname = parsed.hostname
        port = parsed.port
    except (TypeError, ValueError):
        return False
    if not hostname or (port is not None and not 1 <= port <= 65535):
        return False
    normalized_host = hostname.lower()
    if normalized_host in {"localhost", "localhost."}:
        return True
    try:
        if ipaddress.ip_address(normalized_host).is_loopback:
            return True
    except ValueError:
        pass
    server_host = ""
    if isinstance(server, (list, tuple)) and server:
        server_host = str(server[0] or "").lower()
    return normalized_host == "testserver" and server_host == "testserver"


class TrustedLocalHostMiddleware:
    def __init__(self, app: Any, *, allowed_origins: List[str]) -> None:
        self.app = app
        self.allowed_origins = {
            str(origin).strip()
            for origin in allowed_origins
            if normalize_http_origin(origin) is not None
        }

    async def __call__(self, scope: Dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        host_values = headers.getlist("host")
        host = host_values[0] if len(host_values) == 1 else ""
        if request_host_is_allowed(host, scope.get("server")):
            await self.app(scope, receive, send)
            return

        response_headers: Dict[str, str] = {}
        origin_values = headers.getlist("origin")
        request_origin = origin_values[0] if len(origin_values) == 1 else ""
        if request_origin in self.allowed_origins:
            response_headers = {
                "Access-Control-Allow-Origin": request_origin,
                "Vary": "Origin",
            }
        await JSONResponse(
            status_code=403,
            content={"detail": "不允许的请求主机"},
            headers=response_headers,
        )(scope, receive, send)


class DesktopTokenMiddleware:
    def __init__(self, app: Any, *, token: str) -> None:
        self.app = app
        self.token = str(token or "").strip()

    async def __call__(self, scope: Dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or not self.token:
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method") or "GET").upper()
        path = str(scope.get("path") or "")
        if method == "OPTIONS" or not path.startswith(("/api/", "/outputs/")):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        supplied = headers.get("x-nm-desktop-token") or ""
        if path.startswith("/outputs/") and not supplied:
            query = str(scope.get("query_string", b"").decode("latin-1"))
            for pair in query.split("&"):
                name, separator, value = pair.partition("=")
                if separator and unquote(name) == "desktop_token":
                    supplied = unquote(value)
                    break
        if supplied and secrets.compare_digest(supplied, self.token):
            await self.app(scope, receive, send)
            return

        await JSONResponse(
            status_code=401,
            content={"detail": "桌面运行时令牌无效"},
        )(scope, receive, send)


def unsafe_api_body_limit(method: str, path: str) -> Optional[Tuple[int, str]]:
    normalized_method = str(method or "").upper()
    normalized_path = str(path or "")
    if (
        normalized_method in {"GET", "HEAD", "OPTIONS"}
        or not normalized_path.startswith("/api/")
    ):
        return None
    if normalized_path.startswith("/api/generate/"):
        return GENERATION_MULTIPART_MAX_BYTES, "上传请求超过容量限制"
    if normalized_path == "/api/studio/sessions":
        return STUDIO_SESSION_BODY_MAX_BYTES, "请求内容超过容量限制"
    return API_WRITE_MAX_BYTES, "请求内容超过容量限制"


class RequestBoundaryMiddleware:
    def __init__(self, app: Any, *, allowed_origins: List[str]) -> None:
        self.app = app
        self.allowed_origins = {
            normalized
            for origin in allowed_origins
            if (normalized := normalize_http_origin(origin)) is not None
        }

    async def __call__(self, scope: Dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method") or "GET").upper()
        path = str(scope.get("path") or "")
        headers = Headers(scope=scope)
        if path.startswith("/api/") and method not in {"GET", "HEAD", "OPTIONS"}:
            raw_origin = headers.get("origin")
            if raw_origin:
                request_origin = normalize_http_origin(raw_origin)
                host = headers.get("host") or ""
                current_origin = normalize_http_origin(f"{scope.get('scheme') or 'http'}://{host}")
                allowed_origins = set(self.allowed_origins)
                if current_origin is not None:
                    allowed_origins.add(current_origin)
                if request_origin is None or request_origin not in allowed_origins:
                    await JSONResponse(
                        status_code=403,
                        content={"detail": "不允许的请求来源"},
                    )(scope, receive, send)
                    return

        body_limit = unsafe_api_body_limit(method, path)
        if body_limit is None:
            await self.app(scope, receive, send)
            return
        max_body_bytes, limit_detail = body_limit

        content_length = (headers.get("content-length") or "").strip()
        if content_length:
            try:
                declared_bytes = int(content_length)
            except ValueError:
                declared_bytes = 0
            if declared_bytes > max_body_bytes:
                await JSONResponse(
                    status_code=413,
                    content={"detail": limit_detail},
                )(scope, receive, send)
                return

        received_bytes = 0

        async def limited_receive() -> Dict[str, Any]:
            nonlocal received_bytes
            message = await receive()
            if message.get("type") == "http.request":
                body = message.get("body", b"")
                next_total = received_bytes + len(body)
                if next_total > max_body_bytes:
                    raise HTTPException(status_code=413, detail=limit_detail)
                received_bytes = next_total
            return message

        await self.app(scope, limited_receive, send)


class LimitedGenerationMultipartRoute(APIRoute):
    def get_route_handler(self):
        route_handler = super().get_route_handler()

        async def limited_route_handler(request: Request):
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if request.url.path.startswith("/api/generate/") and content_type == "multipart/form-data":
                request_form = request.form

                def limited_form(
                    *,
                    max_files: int | float = 1000,
                    max_fields: int | float = 1000,
                    max_part_size: int = 1024 * 1024,
                ):
                    return request_form(
                        max_files=min(max_files, GENERATION_MULTIPART_MAX_FILES),
                        max_fields=min(max_fields, GENERATION_MULTIPART_MAX_FIELDS),
                        max_part_size=min(max_part_size, GENERATION_MULTIPART_MAX_FIELD_BYTES),
                    )

                request.form = limited_form  # type: ignore[method-assign]
            return await route_handler(request)

        return limited_route_handler


def validate_bind_host(host: str) -> str:
    value = str(host or "").strip().lower()
    if value not in {"127.0.0.1", "localhost", "::1", "[::1]"}:
        raise ValueError("当前版本只允许绑定本机回环地址；不支持无认证局域网共享。")
    return host


def read_app_version() -> str:
    try:
        version = VERSION_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return "0.0.0"
    return version or "0.0.0"
GPT_ENDPOINT_OPTIONS = {
    "auto",
    "/v1/images/generations",
    "/v1/images/edits",
    "/v1/responses",
}
GPT_RETRYABLE_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504}
UPSTREAM_TIMEOUT_STATUSES = {524}

BANANA_ASPECT_RATIO_ALIASES = {
    "1:1": "1:1",
    "1:4": "1:4",
    "1:8": "1:8",
    "2:3": "2:3",
    "3:2": "3:2",
    "3:4": "3:4",
    "4:1": "4:1",
    "4:3": "4:3",
    "4:5": "4:5",
    "5:4": "5:4",
    "8:1": "8:1",
    "9:16": "9:16",
    "16:9": "16:9",
    "21:9": "21:9",
}
BANANA_SUPPORTED_ASPECT_RATIOS = tuple(BANANA_ASPECT_RATIO_ALIASES.keys())

GPT_IMAGE_2_MIN_PIXELS = 655_360
GPT_IMAGE_2_MAX_PIXELS = 8_294_400
GPT_IMAGE_2_MAX_EDGE = 3840
GPT_IMAGE_2_MAX_RATIO = 3

IMAGE_URL_PATTERN = re.compile(
    r'https?://[^\s<>"\']+\.(?:png|jpg|jpeg|gif|webp|bmp)(?:\?[^\s<>"\']*)?',
    re.IGNORECASE,
)
URL_PATTERN = re.compile(r'https?://[^\s<>"\'\)\]]+', re.IGNORECASE)
IMAGE_HOST_PATTERNS = (
    r'imgur\.com',
    r'i\.imgur\.com',
    r'imgbb\.com',
    r'i\.ibb\.co',
    r'postimg\.cc',
    r'i\.postimg\.cc',
    r'cloudinary\.com',
    r'res\.cloudinary\.com',
    r'imagekit\.io',
    r'ik\.imagekit\.io',
    r'storage\.googleapis\.com',
    r'blob\.core\.windows\.net',
    r's3\.amazonaws\.com',
    r'cdn\.',
    r'img\.',
    r'image\.',
    r'images\.',
    r'pic\.',
    r'pics\.',
    r'photo\.',
    r'photos\.',
    r'upload\.',
    r'uploads\.',
    r'static\.',
    r'assets\.',
    r'media\.',
)
MARKDOWN_BASE64_IMAGE_PATTERN = re.compile(
    r'!\[[^\]]*\]\(data:(image/(?:png|jpeg|jpg|gif|webp|bmp));base64,([A-Za-z0-9+/=]+)\)',
    re.IGNORECASE,
)
CLIENT_ERROR_URL_PATTERN = re.compile(r'https?://[^\s<>"\']+', re.IGNORECASE)
CLIENT_ERROR_SENSITIVE_KEY_PATTERN = re.compile(
    r"(?:api[_-]?key|access[_-]?key|token|secret|password|auth(?:orization)?|signature|sig)",
    re.IGNORECASE,
)


def compact_text(value: str, limit: int = 600) -> str:
    text = re.sub(r"\s+", " ", value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


def sanitize_client_url(value: str) -> str:
    raw = str(value or "")
    trailing = ""
    while raw and raw[-1] in ".,;!?):":
        trailing = raw[-1] + trailing
        raw = raw[:-1]
    try:
        parsed = urlparse(raw)
        scheme = parsed.scheme.lower()
        if scheme not in {"http", "https"} or not parsed.netloc:
            return f"[redacted URL]{trailing}"
        host = normalized_url_host(parsed, scheme)
        if not host:
            return f"[redacted URL]{trailing}"
        return f"{scheme}://{host}{trailing}"
    except Exception:
        return f"[redacted URL]{trailing}"


def sanitize_client_error(
    text: str,
    *,
    secrets: Optional[List[str]] = None,
    fallback: str = "请求失败",
) -> str:
    redacted = CLIENT_ERROR_URL_PATTERN.sub(
        lambda match: sanitize_client_url(match.group(0)),
        str(text or ""),
    )
    for secret in secrets or []:
        secret_text = str(secret or "").strip()
        if secret_text:
            redacted = redacted.replace(secret_text, "***")
    redacted = re.sub(
        r"(Bearer\s+)[^\s,;]+",
        r"\1***",
        redacted,
        flags=re.IGNORECASE,
    )
    redacted = re.sub(r"\bsk-[A-Za-z0-9._\-]{4,}\b", "sk-***", redacted, flags=re.IGNORECASE)
    redacted = re.sub(
        rf"((?:[\"']?{CLIENT_ERROR_SENSITIVE_KEY_PATTERN.pattern}[\"']?)\s*[:=]\s*)"
        r"(?:\"[^\"]*\"|'[^']*'|[^\s,;&]+)",
        r"\1***",
        redacted,
        flags=re.IGNORECASE,
    )
    redacted = re.sub(
        r"(?i)(?<![A-Za-z0-9])(?:[A-Z]:[\\/]|\\\\)[^\r\n,;<>\"']+",
        "[local path]",
        redacted,
    )
    redacted = re.sub(
        r"(?<![A-Za-z0-9:/])/(?!/)[^\r\n,;<>\"']+",
        "[local path]",
        redacted,
    )
    return compact_text(redacted, 400) or fallback


def html_error_to_text(value: str) -> str:
    raw = value or ""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", raw, re.IGNORECASE | re.DOTALL)
    title = compact_text(unescape(re.sub(r"<[^>]+>", " ", title_match.group(1)))) if title_match else ""

    body = re.sub(r"<!--.*?-->", " ", raw, flags=re.DOTALL)
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body, flags=re.IGNORECASE | re.DOTALL)
    body = compact_text(unescape(re.sub(r"<[^>]+>", " ", body)))

    if title and title.lower() not in body.lower():
        return compact_text(f"{title} - {body}")
    return title or body or "上游返回了 HTML 错误页"


def response_text_utf8_first(response: requests.Response) -> str:
    content = getattr(response, "content", b"")
    if isinstance(content, bytes) and content:
        try:
            return content.decode("utf-8-sig")
        except UnicodeDecodeError:
            pass
    return getattr(response, "text", "") or ""


def response_json_utf8_first(response: requests.Response) -> Any:
    text = response_text_utf8_first(response)
    if text:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    return response.json()


def guess_extension(mime_type: str) -> str:
    extension = raster_extension(mime_type)
    if extension:
        return extension
    extension = mimetypes.guess_extension(mime_type or "")
    if extension:
        return extension
    return ".png"


def data_url_from_base64(base64_data: str, mime_type: str = "image/png") -> str:
    return f"data:{mime_type};base64,{base64_data}"


def detect_image_mime_type(raw_bytes: bytes, fallback: str = "image/png") -> str:
    if raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw_bytes.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        return "image/webp"
    if raw_bytes.startswith(b"BM"):
        return "image/bmp"
    if fallback == "":
        return ""
    return fallback if fallback.startswith("image/") else "image/png"


def detect_image_dimensions(raw_bytes: bytes, mime_type: str = "") -> Optional[Dict[str, int]]:
    if len(raw_bytes) < 10:
        return None

    if raw_bytes.startswith(b"\x89PNG\r\n\x1a\n") and len(raw_bytes) >= 24:
        return {
            "width": int.from_bytes(raw_bytes[16:20], "big"),
            "height": int.from_bytes(raw_bytes[20:24], "big"),
        }

    if raw_bytes.startswith((b"GIF87a", b"GIF89a")) and len(raw_bytes) >= 10:
        return {
            "width": int.from_bytes(raw_bytes[6:8], "little"),
            "height": int.from_bytes(raw_bytes[8:10], "little"),
        }

    if raw_bytes.startswith(b"\xff\xd8"):
        index = 2
        while index + 9 < len(raw_bytes):
            if raw_bytes[index] != 0xFF:
                index += 1
                continue
            marker = raw_bytes[index + 1]
            index += 2
            while marker == 0xFF and index < len(raw_bytes):
                marker = raw_bytes[index]
                index += 1
            if marker in (0xD8, 0xD9):
                continue
            if index + 2 > len(raw_bytes):
                break
            block_size = int.from_bytes(raw_bytes[index:index + 2], "big")
            if block_size < 2:
                break
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                if index + 7 <= len(raw_bytes):
                    return {
                        "height": int.from_bytes(raw_bytes[index + 3:index + 5], "big"),
                        "width": int.from_bytes(raw_bytes[index + 5:index + 7], "big"),
                    }
                break
            index += block_size

    if len(raw_bytes) >= 30 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        chunk = raw_bytes[12:16]
        if chunk == b"VP8X" and len(raw_bytes) >= 30:
            return {
                "width": int.from_bytes(raw_bytes[24:27], "little") + 1,
                "height": int.from_bytes(raw_bytes[27:30], "little") + 1,
            }
        if chunk == b"VP8 " and len(raw_bytes) >= 30:
            return {
                "width": int.from_bytes(raw_bytes[26:28], "little") & 0x3FFF,
                "height": int.from_bytes(raw_bytes[28:30], "little") & 0x3FFF,
            }
        if chunk == b"VP8L" and len(raw_bytes) >= 25:
            bits = int.from_bytes(raw_bytes[21:25], "little")
            return {
                "width": (bits & 0x3FFF) + 1,
                "height": ((bits >> 14) & 0x3FFF) + 1,
            }

    return None


def ratio_string_to_float(ratio_text: str) -> Optional[float]:
    try:
        width_text, height_text = ratio_text.split(":", 1)
        width = float(width_text)
        height = float(height_text)
        if width <= 0 or height <= 0:
            return None
        return width / height
    except (TypeError, ValueError):
        return None


def resolve_banana_aspect_ratio_from_reference(
    requested_aspect_ratio: str,
    reference_assets: List[Dict[str, Any]],
) -> Optional[str]:
    if (requested_aspect_ratio or "").strip().lower() != "auto" or not reference_assets:
        return normalize_banana_aspect_ratio(requested_aspect_ratio)

    dimensions = reference_assets[0].get("dimensions")
    if not isinstance(dimensions, dict):
        return None

    width = int(dimensions.get("width") or 0)
    height = int(dimensions.get("height") or 0)
    if width <= 0 or height <= 0:
        return None

    actual_ratio = width / height
    closest_ratio = None
    smallest_distance = float("inf")
    for candidate in BANANA_SUPPORTED_ASPECT_RATIOS:
        candidate_ratio = ratio_string_to_float(candidate)
        if candidate_ratio is None:
            continue
        distance = abs(math.log(actual_ratio) - math.log(candidate_ratio))
        if distance < smallest_distance:
            smallest_distance = distance
            closest_ratio = candidate

    return closest_ratio


def normalize_banana_aspect_ratio(aspect_ratio: Optional[str]) -> Optional[str]:
    if not aspect_ratio:
        return None
    value = aspect_ratio.strip()
    if not value or value.lower() == "auto":
        return None
    return BANANA_ASPECT_RATIO_ALIASES.get(value, value)


def build_banana_api_url(base_url: str, model_type: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    model = (model_type or "").strip()
    if not base:
        raise ValueError("请填写 Banana 的 API Base URL")
    if not model:
        raise ValueError("请填写 Banana 的模型名")

    if model.startswith("models/"):
        model = model.split("/", 1)[1]
    if model.startswith("v1beta/"):
        model = model.split("/", 1)[1]

    if base.endswith(":generateContent"):
        return base
    if ":generate" in base:
        return base
    if base.endswith(f"/{model}:generateContent"):
        return base
    if base.endswith(f"/{model}"):
        return f"{base}:generateContent"
    if "/models/" in base:
        return f"{base}:generateContent"
    return f"{base}/v1beta/models/{model}:generateContent"


def build_banana_request(
    prompt: str,
    seed: int,
    aspect_ratio: str,
    top_p: float,
    image_size: str,
    reference_assets: List[Dict[str, Any]],
) -> Dict[str, Any]:
    prompt_text = (prompt or "").strip()
    if not prompt_text and not reference_assets:
        raise ValueError("请填写提示词，或者至少上传一张参考图")

    suffix_parts: List[str] = []
    normalized_size = (image_size or "").strip().upper()
    if normalized_size in {"1K", "2K", "4K"}:
        suffix_parts.append(f"分辨率: {normalized_size}")

    normalized_aspect = resolve_banana_aspect_ratio_from_reference(aspect_ratio, reference_assets)
    if normalized_aspect:
        suffix_parts.append(f"比例: {normalized_aspect}")

    if prompt_text and suffix_parts:
        prompt_text = f"{prompt_text} [{', '.join(suffix_parts)}]"

    parts: List[Dict[str, Any]] = []
    if prompt_text:
        parts.append({"text": prompt_text})

    for asset in reference_assets:
        parts.append(
            {
                "inlineData": {
                    "mimeType": asset["mime_type"],
                    "data": asset["base64_data"],
                }
            }
        )

    generation_config: Dict[str, Any] = {
        "topP": float(top_p),
        "responseModalities": ["IMAGE"],
    }
    if seed >= 0:
        generation_config["seed"] = seed

    image_config: Dict[str, Any] = {}
    if normalized_aspect:
        image_config["aspectRatio"] = normalized_aspect

    if normalized_size in {"1K", "2K", "4K"}:
        image_config["imageSize"] = normalized_size

    if image_config:
        generation_config["imageConfig"] = image_config

    return {
        "contents": [
            {
                "role": "user",
                "parts": parts,
            }
        ],
        "generationConfig": generation_config,
    }


def extract_error_message(
    response: requests.Response,
    *,
    secrets: Optional[List[str]] = None,
) -> str:
    if response.status_code in UPSTREAM_TIMEOUT_STATUSES:
        return sanitize_client_error(
            f"上游接口返回 {response.status_code}: 上游网关超时。"
            "这通常是模型排队、服务繁忙或图片生成耗时过长导致的；可以稍后重试，"
            "或调低质量、尺寸、数量后再试。",
            secrets=secrets,
        )

    try:
        payload = response_json_utf8_first(response)
    except Exception:
        raw_text = response_text_utf8_first(response) or "未知错误"
        if raw_text.lstrip().startswith("<"):
            message = html_error_to_text(raw_text)
        else:
            message = compact_text(raw_text)
        return sanitize_client_error(
            f"上游接口返回 {response.status_code}: {message}",
            secrets=secrets,
        )

    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            message = str(error_obj.get("message") or "").strip()
            if message:
                return sanitize_client_error(message, secrets=secrets)
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return sanitize_client_error(message, secrets=secrets)

    return sanitize_client_error(
        response_text_utf8_first(response) or "未知错误",
        secrets=secrets,
    )


def extract_upstream_control_message(response: requests.Response) -> str:
    """Read an upstream message for internal control flow only; never return it to clients."""
    try:
        payload = response_json_utf8_first(response)
    except Exception:
        return compact_text(response_text_utf8_first(response), 1000)
    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            message = str(error_obj.get("message") or "").strip()
            if message:
                return compact_text(message, 1000)
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return compact_text(message, 1000)
    return compact_text(response_text_utf8_first(response), 1000)


def create_requests_session(bypass_proxy: bool = False) -> requests.Session:
    session = requests.Session()
    if bypass_proxy:
        session.trust_env = False
        session.proxies = {}
    return session


def read_config_file_payload() -> Dict[str, Any]:
    for candidate in CONFIG_FILE_CANDIDATES:
        if not candidate.exists():
            continue
        try:
            return json.loads(candidate.read_text(encoding="utf-8"))
        except Exception:
            continue
    return {}


def short_config_name_from_url(url: str, fallback: str = "默认配置") -> str:
    raw = str(url or "").strip()
    if not raw:
        return fallback
    parsed = urlparse(raw if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", raw) else f"//{raw}")
    host = (parsed.netloc or parsed.path.split("/", 1)[0] or raw).strip().strip("/")
    if "@" in host:
        host = host.rsplit("@", 1)[-1]
    if host.startswith("["):
        return host
    host_without_port = host.split(":", 1)[0]
    if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}$", host_without_port):
        return host
    parts = [part for part in host.split(".") if part]
    if len(parts) > 1 and parts[-1].lower() in {"com", "cn", "net", "org", "io", "ai", "top", "fun"}:
        parts = parts[:-1]
    return ".".join(parts) or fallback


def config_profile_name(engine: str, form: Dict[str, Any], fallback: str = "默认配置") -> str:
    if engine == "banana":
        return short_config_name_from_url(str(form.get("api_base_url") or ""), fallback)
    return short_config_name_from_url(str(form.get("base_url") or ""), fallback)


def sanitize_profile_id(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(value or "").strip()).strip("-")
    return slug[:80] or fallback


def normalize_config_form(form_id: str, value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    allowed_fields = CONFIG_CONNECTION_FIELDS[form_id]
    return {
        key: str(value.get(key) or "").strip()
        for key in allowed_fields
        if str(value.get(key) or "").strip()
    }


def build_config_profiles(
    forms: Dict[str, Dict[str, Any]],
    raw_profiles: Any = None,
    raw_active_profile_ids: Any = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    profiles: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    active_profile_ids = {
        engine: sanitize_profile_id(str(raw_active_profile_ids.get(engine) or ""), f"{engine}-default")
        for engine in ENGINE_FORM_IDS
    } if isinstance(raw_active_profile_ids, dict) else {
        "banana": "banana-default",
        "gpt-image-2": "gpt-image-2-default",
    }

    if isinstance(raw_profiles, list):
        for index, item in enumerate(raw_profiles):
            if not isinstance(item, dict):
                continue
            engine = str(item.get("engine") or "").strip()
            if engine not in ENGINE_FORM_IDS:
                continue
            form_id = ENGINE_FORM_IDS[engine]
            form = normalize_config_form(form_id, item.get("form") or {})
            profile_id = sanitize_profile_id(str(item.get("id") or ""), f"{engine}-{index + 1}")
            if profile_id in seen_ids:
                profile_id = f"{profile_id}-{index + 1}"
            seen_ids.add(profile_id)
            name = str(item.get("name") or "").strip() or config_profile_name(engine, form, "默认配置")
            profiles.append({
                "id": profile_id,
                "engine": engine,
                "name": name,
                "form": form,
            })

    by_engine = {engine: [profile for profile in profiles if profile["engine"] == engine] for engine in ENGINE_FORM_IDS}
    for engine, form_id in ENGINE_FORM_IDS.items():
        form = dict(forms.get(form_id) or {})
        if by_engine[engine]:
            active_id = active_profile_ids.get(engine) or by_engine[engine][0]["id"]
            active = next((profile for profile in by_engine[engine] if profile["id"] == active_id), by_engine[engine][0])
            active_profile_ids[engine] = active["id"]
            if form:
                active["form"] = form
                if not str(active.get("name") or "").strip():
                    active["name"] = config_profile_name(engine, form, "默认配置")
            continue

        profile_id = f"{engine}-default"
        active_profile_ids[engine] = profile_id
        profiles.append({
            "id": profile_id,
            "engine": engine,
            "name": config_profile_name(engine, form, "默认配置"),
            "form": form,
        })

    return profiles, active_profile_ids


def forms_from_active_profiles(
    profiles: List[Dict[str, Any]],
    active_profile_ids: Dict[str, str],
) -> Dict[str, Dict[str, Any]]:
    forms: Dict[str, Dict[str, Any]] = {}
    for engine, form_id in ENGINE_FORM_IDS.items():
        engine_profiles = [profile for profile in profiles if profile.get("engine") == engine]
        active_id = active_profile_ids.get(engine)
        active = next((profile for profile in engine_profiles if profile.get("id") == active_id), None)
        if active is None and engine_profiles:
            active = engine_profiles[0]
            active_profile_ids[engine] = str(active.get("id") or f"{engine}-default")
        forms[form_id] = normalize_config_form(form_id, active.get("form") if active else {})
    return forms


def pick_env_value(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def desktop_mode_enabled() -> bool:
    return os.getenv("IMAGE_TOOL_DESKTOP_MODE", "").strip().lower() in {"1", "true", "yes"}


def switch_runtime_outputs_root(path: str) -> Path:
    """切换桌面端运行中的存图目录，不需要重启 FastAPI。"""
    global OUTPUTS_DIR, HISTORY_FILE, STUDIO_SESSIONS_FILE, SESSION_REFS_DIR

    if not desktop_mode_enabled():
        raise ValueError("运行时存图目录切换仅适用于桌面端")
    target = Path(str(path or "").strip()).expanduser()
    if not target.is_absolute():
        raise ValueError("存图目录必须是绝对路径")
    target = target.resolve()
    target.mkdir(parents=True, exist_ok=True)

    with OUTPUTS_ROOT_LOCK:
        current = OUTPUTS_DIR.resolve()
        if target == current or target.as_posix().casefold() == current.as_posix().casefold():
            return current
        if current in target.parents or target in current.parents:
            raise ValueError("新的存图目录不能与当前目录相同或互相嵌套")

        target_history = target / "history.json"
        payload = read_json(target_history, None)
        if payload is not None:
            entries = history_entries_from_payload(payload)
            changed = False
            for entry in entries:
                images = entry.get("images")
                if not isinstance(images, list):
                    continue
                for image in images:
                    if not isinstance(image, dict):
                        continue
                    name = Path(str(image.get("saved_name") or image.get("saved_path") or "")).name
                    if not name:
                        continue
                    next_path = storage_path_display(target / name)
                    next_url = f"{OUTPUTS_URL_PREFIX}/{quote(name)}"
                    if image.get("saved_path") != next_path or image.get("saved_url") != next_url:
                        image["saved_path"] = next_path
                        image["saved_url"] = next_url
                        changed = True
            if changed:
                atomic_write_json(target_history, history_payload(entries), backup=True)

        OUTPUTS_DIR = target
        HISTORY_FILE = target / "history.json"
        STUDIO_SESSIONS_FILE = target / "studio_sessions.json"
        SESSION_REFS_DIR = target / "session_refs"
    return target


class ConfigSecretError(ValueError):
    pass


def _dpapi_transform(value: bytes, *, protect: bool) -> bytes:
    if os.name != "nt":
        raise ConfigSecretError("Windows DPAPI is unavailable")

    from ctypes import wintypes

    class DataBlob(ctypes.Structure):
        _fields_ = [
            ("cbData", wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_ubyte)),
        ]

    input_buffer = (ctypes.c_ubyte * len(value)).from_buffer_copy(value)
    input_blob = DataBlob(len(value), ctypes.cast(input_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output_blob = DataBlob()
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    if protect:
        ok = crypt32.CryptProtectData(
            ctypes.byref(input_blob),
            "NM Image Studio configuration",
            None,
            None,
            None,
            0x1,
            ctypes.byref(output_blob),
        )
        description = None
    else:
        description = ctypes.c_wchar_p()
        ok = crypt32.CryptUnprotectData(
            ctypes.byref(input_blob),
            ctypes.byref(description),
            None,
            None,
            None,
            0,
            ctypes.byref(output_blob),
        )
    if not ok:
        raise ConfigSecretError(f"Windows DPAPI failed: {ctypes.WinError(ctypes.get_last_error())}")
    try:
        return ctypes.string_at(output_blob.pbData, output_blob.cbData)
    finally:
        if output_blob.pbData:
            kernel32.LocalFree(output_blob.pbData)
        if description:
            kernel32.LocalFree(description)


def transform_config_secrets(payload: Dict[str, Any], *, decrypt: bool) -> Tuple[Dict[str, Any], bool]:
    migrated_plaintext = False

    def visit(value: Any) -> Any:
        nonlocal migrated_plaintext
        if isinstance(value, list):
            return [visit(item) for item in value]
        if not isinstance(value, dict):
            return value
        transformed: Dict[str, Any] = {}
        for key, item in value.items():
            if key == "api_key" and isinstance(item, str) and item.strip():
                if decrypt:
                    if item.startswith(DESKTOP_CONFIG_SECRET_PREFIX):
                        encoded = item[len(DESKTOP_CONFIG_SECRET_PREFIX):]
                        try:
                            transformed[key] = _dpapi_transform(base64.b64decode(encoded, validate=True), protect=False).decode("utf-8")
                        except (ValueError, UnicodeError, OSError) as exc:
                            raise ConfigSecretError("无法解密桌面配置中的 API Key") from exc
                    else:
                        transformed[key] = item
                        migrated_plaintext = True
                elif desktop_mode_enabled():
                    transformed[key] = DESKTOP_CONFIG_SECRET_PREFIX + base64.b64encode(
                        _dpapi_transform(item.encode("utf-8"), protect=True)
                    ).decode("ascii")
                else:
                    transformed[key] = item
            else:
                transformed[key] = visit(item)
        return transformed

    result = visit(payload)
    return result, migrated_plaintext


def open_local_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        os.startfile(str(path))  # type: ignore[attr-defined]
        return
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
        return
    subprocess.Popen(["xdg-open", str(path)])


def build_runtime_defaults() -> Dict[str, Any]:
    file_payload = read_config_file_payload()
    if desktop_mode_enabled() and isinstance(file_payload, dict):
        file_payload, migrated_plaintext = transform_config_secrets(file_payload, decrypt=True)
        if migrated_plaintext and PRIMARY_CONFIG_FILE.exists():
            file_payload = normalize_config_payload(file_payload)
            write_config_file_payload(file_payload)
    file_forms = file_payload.get("forms", file_payload) if isinstance(file_payload, dict) else {}

    defaults = {
        "banana-form": dict(file_forms.get("banana-form") or file_forms.get("banana") or {}),
        "gpt-image-2-form": dict(
            file_forms.get("gpt-image-2-form")
            or file_forms.get("gpt-image-2")
            or file_forms.get("gpt_image_2")
            or {}
        ),
    }

    env_overrides = {
        "banana-form": {
            "api_key": pick_env_value("BANANA_API_KEY", "BANANA_KEY"),
            "api_base_url": pick_env_value("BANANA_API_BASE_URL", "BANANA_BASE_URL"),
            "model_type": pick_env_value("BANANA_MODEL_TYPE", "BANANA_MODEL"),
        },
        "gpt-image-2-form": {
            "api_key": pick_env_value("GPT_IMAGE_2_API_KEY", "OPENAI_API_KEY"),
            "base_url": pick_env_value("GPT_IMAGE_2_BASE_URL", "OPENAI_BASE_URL"),
            "model": pick_env_value("GPT_IMAGE_2_MODEL", "OPENAI_IMAGE_MODEL"),
            "chat_model": pick_env_value("GPT_IMAGE_2_CHAT_MODEL", "OPENAI_CHAT_MODEL", "OPENAI_MODEL"),
            "reasoning_effort": pick_env_value("GPT_REASONING_EFFORT", "OPENAI_REASONING_EFFORT"),
        },
    }

    for form_id, overrides in env_overrides.items():
        defaults.setdefault(form_id, {})
        for key, value in overrides.items():
            if value:
                defaults[form_id][key] = value

    sources: List[str] = []
    if any(candidate.exists() for candidate in CONFIG_FILE_CANDIDATES):
        sources.append("config.local.json")
    if any(value for overrides in env_overrides.values() for value in overrides.values()):
        sources.append("环境变量")

    profiles, active_profile_ids = build_config_profiles(
        defaults,
        file_payload.get("profiles") if isinstance(file_payload, dict) else None,
        file_payload.get("active_profile_ids") if isinstance(file_payload, dict) else None,
    )

    return {
        "active_engine": file_payload.get("active_engine", "banana")
        if isinstance(file_payload, dict)
        else "banana",
        "forms": defaults,
        "profiles": profiles,
        "active_profile_ids": active_profile_ids,
        "sources": sources,
    }


def normalize_config_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("配置内容必须是 JSON 对象")

    forms = payload.get("forms")
    if not isinstance(forms, dict):
        forms = {}

    normalized_forms: Dict[str, Dict[str, Any]] = {
        form_id: normalize_config_form(form_id, forms.get(form_id, {}))
        for form_id in ("banana-form", "gpt-image-2-form")
    }

    profiles, active_profile_ids = build_config_profiles(
        normalized_forms,
        payload.get("profiles"),
        payload.get("active_profile_ids"),
    )
    normalized_forms = forms_from_active_profiles(profiles, active_profile_ids)

    active_engine = str(payload.get("active_engine") or "banana").strip()
    if active_engine not in {"banana", "gpt-image-2"}:
        active_engine = "banana"

    return {
        "version": 2,
        "active_engine": active_engine,
        "active_profile_ids": active_profile_ids,
        "profiles": profiles,
        "forms": normalized_forms,
    }


def write_config_file_payload(payload: Dict[str, Any]) -> None:
    if not desktop_mode_enabled():
        atomic_write_json(PRIMARY_CONFIG_FILE, payload, backup=True)
        return

    protected, _migrated_plaintext = transform_config_secrets(payload, decrypt=False)
    atomic_write_json(PRIMARY_CONFIG_FILE, protected, backup=False)
    backup_path = PRIMARY_CONFIG_FILE.with_name(f"{PRIMARY_CONFIG_FILE.name}.bak")
    if backup_path.exists():
        atomic_write_json(backup_path, protected, backup=False)


def safe_filename_part(value: str, fallback: str = "image") -> str:
    text = re.sub(r"[^a-zA-Z0-9._-]+", "-", value or "").strip(".-")
    return text[:80] or fallback


def safe_multipart_filename(filename: str, index: int, mime_type: str) -> str:
    stem = Path(filename or "").stem
    safe_stem = safe_filename_part(stem, f"reference-{index:02d}")
    return f"{safe_stem}{guess_extension(mime_type)}"


def output_url_for_path(path: Path) -> str:
    relative = str(path.relative_to(OUTPUTS_DIR)).replace("\\", "/")
    return f"{OUTPUTS_URL_PREFIX}/{quote(relative)}"


def path_from_output_url(value: str) -> Optional[Path]:
    source = str(value or "").strip()
    if not source.startswith(f"{OUTPUTS_URL_PREFIX}/"):
        return None
    relative = unquote(source[len(OUTPUTS_URL_PREFIX):].lstrip("/"))
    candidate = (OUTPUTS_DIR / relative).resolve()
    try:
        candidate.relative_to(OUTPUTS_DIR.resolve())
    except ValueError:
        return None
    return candidate


def extract_image_bytes(src: str) -> Optional[Tuple[bytes, str]]:
    """Decode embedded raster data only; remote URLs use download_remote_image()."""
    source = str(src or "").strip()
    if not source.startswith("data:"):
        return None
    try:
        return decode_raster_data_url(
            source,
            max_bytes=REMOTE_RESULT_MAX_BYTES,
        )
    except ImageSafetyError:
        return None


def estimate_data_url_decoded_bytes(source: str) -> int:
    text = str(source or "")
    marker = ";base64,"
    marker_index = text.lower().find(marker)
    if marker_index < 0:
        return 0
    encoded = re.sub(r"\s+", "", text[marker_index + len(marker):])
    if not encoded:
        return 0
    padding = len(encoded) - len(encoded.rstrip("="))
    return max(0, ((len(encoded) + 3) // 4) * 3 - min(padding, 2))


def decode_upstream_raster(
    source: str,
    budget: UpstreamImageBudget,
) -> Optional[Tuple[bytes, str]]:
    budget.ensure_image_slot()
    estimated_bytes = estimate_data_url_decoded_bytes(source)
    budget.charge_checked_bytes(estimated_bytes)
    try:
        raw_bytes, mime_type = decode_raster_data_url(
            source,
            max_bytes=REMOTE_RESULT_MAX_BYTES,
        )
    except ImageSafetyError:
        return None
    budget.accept_image()
    return raw_bytes, mime_type


def cleanup_generated_image_files(
    images: List[Dict[str, Any]],
    extra_paths: Optional[List[Path]] = None,
) -> None:
    paths = list(extra_paths or [])
    for image in images:
        raw_path = str(image.get("saved_path") or "").strip()
        raw_name = str(image.get("saved_name") or "").strip()
        if raw_path:
            paths.append(ROOT_DIR / raw_path)
        elif raw_name:
            paths.append(OUTPUTS_DIR / Path(raw_name).name)

    outputs_root = OUTPUTS_DIR.resolve()
    for path in paths:
        try:
            resolved = path.resolve()
            if resolved == outputs_root or outputs_root not in resolved.parents:
                continue
            if resolved.is_file():
                resolved.unlink()
        except Exception:
            continue

    for image in images:
        for key in (
            "saved_name",
            "saved_path",
            "saved_url",
            "save_status",
            "save_error",
            "save_error_code",
        ):
            image.pop(key, None)


def mask_prompt_model_chosen_object_guidance(prompt: str) -> str:
    text = str(prompt or "").strip()
    if not text:
        return ""

    chinese_pattern = re.compile(
        r"(?:替换|更换|换|改)(?:成|为)?"
        r"(?:另(?:外|一)?|其他|别的|不同的|新的|新)?(?:一)?(?:个|件|种)?"
        r"(?:物品|东西|物件|对象)"
    )
    for match in chinese_pattern.finditer(text):
        prefix = text[max(0, match.start() - 4):match.start()]
        if re.search(r"(?:不要|别|不必|禁止|避免)$", prefix):
            continue
        return (
            "用户要求由模型自行决定替换成什么物品：先识别当前 Alpha 遮罩区域内的原物体，将它完整移除，"
            "再替换为一个类别和轮廓都明显不同、但符合场景的新物品。必须产生肉眼可见的物体替换，"
            "不能保留、复原或只重新绘制原物体；人物的抓握、遮挡、光影和接触关系要自然。"
        )

    lowered = text.lower()
    if (
        re.search(r"\b(?:replace|swap|change)\b", lowered)
        and re.search(r"\b(?:another|different|new|other)\s+(?:object|item|thing)\b", lowered)
        and not re.search(r"\b(?:do not|don't|avoid)\s+(?:replace|swap|change)\b", lowered)
    ):
        return (
            "The user wants the model to choose the replacement object. Identify and fully remove the original object "
            "inside the current alpha-mask area, then replace it with a context-appropriate object whose category and silhouette "
            "are clearly different. The replacement must be visibly different; do not preserve, restore, or merely "
            "redraw the original object. Keep grasping, occlusion, lighting, and contact physically natural."
        )
    return ""


def harden_mask_prompt(prompt: str) -> str:
    model_chosen_object_guidance = mask_prompt_model_chosen_object_guidance(prompt)
    return (
        "这是一次 Alpha 遮罩引导的局部编辑。第一张输入图是完整底图，其中的红色半透明区域只是遮罩区域的可视标记，"
        "不是最终画面内容，生成结果中不能保留红色标记。用户提示中的“选区”“涂红区域”或“遮罩区域”"
        "都指同一个 Alpha 遮罩区域。请生成一张完整、自然连续的最终图：在该遮罩区域完成下面的修改；"
        "如果用户未指定具体替换对象或属性，请结合原图语境在遮罩区域内选择合理、明显且自然的变化。"
        f"{model_chosen_object_guidance}"
        "未标红区域尽量保持原图中的人物身份、"
        "脸、头发、服装、姿势、构图和细节。遮罩边界是过渡提示，不是裁切线；不要按轮廓裁切或拼贴，"
        "允许在紧邻边缘处做必要的光影、纹理、雾气和透视融合，但不要把整体改动扩散到其他区域。\n\n"
        f"用户修改要求：{prompt.strip()}"
    )


def normalize_mask_encoding(value: str) -> str:
    normalized = str(value or "standard").strip().lower()
    if normalized not in {"standard", "compat"}:
        raise ValueError("遮罩发送方式只能是 standard 或 compat")
    return normalized


def build_mask_guided_edit_png(
    *,
    base_raw: bytes,
    mask_raw: bytes,
    mask_encoding: str = "standard",
) -> bytes:
    encoding = normalize_mask_encoding(mask_encoding)
    base_dimensions = detect_image_dimensions(base_raw, "image/png")
    mask_dimensions = detect_image_dimensions(mask_raw, "image/png")
    if not base_dimensions or not mask_dimensions:
        raise ValueError("遮罩引导无法读取图片尺寸")
    if base_dimensions["width"] * base_dimensions["height"] > MASK_GUIDANCE_MAX_PIXELS:
        raise ValueError("遮罩引导底图超过 829 万像素限制")
    if mask_dimensions != base_dimensions:
        raise ValueError("遮罩引导尺寸与底图不一致")

    with Image.open(BytesIO(base_raw)) as source_image:
        source_image.load()
        base = source_image.convert("RGBA")
    with Image.open(BytesIO(mask_raw)) as mask_image:
        mask_image.load()
        mask = mask_image.convert("RGBA")
    if mask.size != base.size:
        raise ValueError("遮罩引导尺寸与底图不一致")

    editable_alpha = mask.getchannel("A")
    if encoding == "standard":
        editable_alpha = ImageOps.invert(editable_alpha)
    overlay_alpha = editable_alpha.point(lambda value: round(value * 0.58))
    red_overlay = Image.new("RGBA", base.size, (239, 68, 68, 0))
    red_overlay.putalpha(overlay_alpha)
    guided = Image.alpha_composite(base, red_overlay)
    output = BytesIO()
    guided.save(output, format="PNG", compress_level=6)
    return output.getvalue()


def save_generated_images(
    engine: str,
    images: List[Dict[str, str]],
    *,
    job_id: str = "",
) -> int:
    JOB_REGISTRY.raise_if_canceled(job_id)
    if not images:
        return 0

    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    engine_name = safe_filename_part(engine, "engine")
    saved_count = 0
    saved_paths: List[Path] = []

    try:
        for index, image in enumerate(images, start=1):
            JOB_REGISTRY.raise_if_canceled(job_id)
            try:
                extracted = extract_image_bytes(image.get("src", ""))
                if not extracted:
                    image["save_status"] = "skipped"
                    continue

                raw_bytes, mime_type = extracted
                filename = f"{run_id}-{engine_name}-{index:02d}{guess_extension(mime_type)}"
                output_path = OUTPUTS_DIR / filename
                output_path.write_bytes(raw_bytes)
                saved_paths.append(output_path)
                JOB_REGISTRY.raise_if_canceled(job_id)
                dimensions = detect_image_dimensions(raw_bytes, mime_type)

                image["mime_type"] = mime_type
                image["saved_name"] = filename
                image["saved_path"] = storage_path_display(output_path)
                image["saved_url"] = f"{OUTPUTS_URL_PREFIX}/{quote(filename)}"
                image["save_status"] = "saved"
                if dimensions:
                    image["dimensions"] = dimensions
                saved_count += 1
            except JobCancelled:
                raise
            except Exception:
                image["save_status"] = "failed"
                image["save_error"] = CLIENT_ERROR_DETAILS["E_LOCAL_SAVE_OUTPUT"]
                image["save_error_code"] = "E_LOCAL_SAVE_OUTPUT"
        JOB_REGISTRY.raise_if_canceled(job_id)
        return saved_count
    except JobCancelled:
        cleanup_generated_image_files(images, saved_paths)
        raise


def normalized_url_host(parsed: Any, scheme: str = "") -> str:
    hostname = str(parsed.hostname or "").lower()
    if (
        not hostname
        or "/" in hostname
        or "\\" in hostname
        or any(character.isspace() for character in hostname)
    ):
        return ""
    normalized_host = f"[{hostname}]" if ":" in hostname else hostname
    port = parsed.port
    default_port = 80 if scheme == "http" else 443 if scheme == "https" else None
    port_suffix = f":{port}" if port is not None and port != default_port else ""
    return f"{normalized_host}{port_suffix}"


def public_url_hint(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if (
        text.startswith(("/", "\\"))
        or re.match(r"^[A-Za-z]:[\\/]", text)
        or "\\" in text
        or any(character.isspace() for character in text)
    ):
        return PUBLIC_URL_PLACEHOLDER
    try:
        if "://" in text:
            parsed = urlparse(text)
            scheme = parsed.scheme.lower()
            if scheme not in {"http", "https"}:
                return PUBLIC_URL_PLACEHOLDER
        else:
            parsed = urlparse(f"//{text}")
            scheme = ""
        host = normalized_url_host(parsed, scheme)
    except Exception:
        return PUBLIC_URL_PLACEHOLDER
    if not host:
        return PUBLIC_URL_PLACEHOLDER
    return host


def sanitize_history_meta(meta: Dict[str, Any]) -> Dict[str, Any]:
    raw_meta = meta or {}
    sanitized = {
        key: value
        for key, value in raw_meta.items()
        if key not in {
            "api_base_url",
            "api_base_url_host",
            "api_url",
            "api_url_host",
        }
    }
    for raw_key in ("api_base_url", "api_url"):
        host_key = f"{raw_key}_host"
        if raw_key in raw_meta:
            sanitized[host_key] = public_url_hint(str(raw_meta.get(raw_key) or ""))
        elif host_key in raw_meta:
            sanitized[host_key] = public_url_hint(str(raw_meta.get(host_key) or ""))
    return sanitized


def sanitize_history_entry_metadata(entry: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(entry)
    if isinstance(normalized.get("meta"), dict):
        normalized["meta"] = sanitize_history_meta(normalized["meta"])
    return normalized


def normalize_history_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    normalized = sanitize_history_entry_metadata(entry)
    normalized["favorite"] = bool(normalized.get("favorite", False))
    return normalized


def history_entries_from_payload(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, dict):
        entries = payload.get("entries", [])
    elif isinstance(payload, list):
        entries = payload
    else:
        entries = []
    return [sanitize_history_entry_metadata(entry) for entry in entries if isinstance(entry, dict)]


def history_payload(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "version": 1,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "entries": [sanitize_history_entry_metadata(entry) for entry in entries[:HISTORY_MAX_ENTRIES]],
    }


def read_history_entries() -> List[Dict[str, Any]]:
    return history_entries_from_payload(read_json(HISTORY_FILE, []))


def write_history_entries(entries: List[Dict[str, Any]]) -> None:
    atomic_write_json(HISTORY_FILE, history_payload(entries))


def empty_studio_session_state() -> Dict[str, Any]:
    return {
        "version": 1,
        "revision": 1,
        "sessions": [],
        "active_session_id": "",
    }


def normalize_studio_revision(value: Any) -> int:
    try:
        revision = int(value)
    except (TypeError, ValueError):
        return 1
    return max(1, revision)


def sanitize_studio_session_metadata(sessions: Any) -> List[Any]:
    if not isinstance(sessions, list):
        return []
    sanitized_sessions: List[Any] = []
    for session in sessions:
        if not isinstance(session, dict):
            sanitized_sessions.append(session)
            continue
        sanitized_session = dict(session)
        turns = session.get("turns")
        if isinstance(turns, list):
            sanitized_turns: List[Any] = []
            for turn in turns:
                if not isinstance(turn, dict):
                    sanitized_turns.append(turn)
                    continue
                sanitized_turn = dict(turn)
                if isinstance(turn.get("meta"), dict):
                    sanitized_turn["meta"] = sanitize_history_meta(turn["meta"])
                sanitized_turns.append(sanitized_turn)
            sanitized_session["turns"] = sanitized_turns
        sanitized_sessions.append(sanitized_session)
    return sanitized_sessions


def studio_session_state_from_payload(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return empty_studio_session_state()
    return {
        "version": normalize_studio_revision(payload.get("version")),
        "revision": normalize_studio_revision(payload.get("revision")),
        "updated_at": payload.get("updated_at"),
        "active_session_id": str(payload.get("active_session_id") or ""),
        "sessions": sanitize_studio_session_metadata(payload.get("sessions")),
    }


def _recover_studio_session_images(state: Dict[str, Any]) -> Dict[str, Any]:
    """Restore image references lost from older session snapshots.

    Session history intentionally stores only compact metadata, while the
    authoritative image records remain in ``history.json`` and the outputs
    directory.  Older desktop builds could write turns with an empty
    ``images`` array or references containing only a filename.  Recover those
    records on read so the UI can render existing files without embedding
    large base64 payloads back into the session document.
    """
    sessions = state.get("sessions")
    if not isinstance(sessions, list):
        return state

    history_by_id: Dict[str, Dict[str, Any]] = {}
    try:
        for entry in read_history_entries():
            if not isinstance(entry, dict):
                continue
            entry_id = str(entry.get("id") or "").strip()
            if entry_id:
                history_by_id[entry_id] = normalize_history_entry(entry)
    except Exception:
        history_by_id = {}

    def recover_output_by_name(name: Any) -> Optional[Path]:
        filename = Path(str(name or "").strip()).name
        if not filename or filename != str(name or "").strip():
            return None
        try:
            candidate = resolve_output_image(OUTPUTS_DIR, filename)
            return candidate if candidate.is_file() else None
        except (ImageSafetyError, OSError, ValueError):
            return None

    recovered_sessions: List[Dict[str, Any]] = []
    for raw_session in sessions:
        if not isinstance(raw_session, dict):
            recovered_sessions.append(raw_session)
            continue
        session = dict(raw_session)
        recovered_turns: List[Any] = []
        for raw_turn in session.get("turns", []):
            if not isinstance(raw_turn, dict):
                recovered_turns.append(raw_turn)
                continue
            turn = dict(raw_turn)
            images = turn.get("images")
            if not isinstance(images, list) or not images:
                history_id = str((turn.get("meta") or {}).get("history_id") or "").strip()
                history_entry = history_by_id.get(history_id)
                history_images = history_entry.get("images") if isinstance(history_entry, dict) else None
                if isinstance(history_images, list) and history_images:
                    turn["images"] = [dict(image) for image in history_images if isinstance(image, dict)]

            snapshots = turn.get("referenceSnapshots")
            if isinstance(snapshots, list):
                recovered_snapshots: List[Any] = []
                for raw_snapshot in snapshots:
                    if not isinstance(raw_snapshot, dict):
                        recovered_snapshots.append(raw_snapshot)
                        continue
                    snapshot = dict(raw_snapshot)
                    if not str(snapshot.get("src") or "").strip():
                        output_path = recover_output_by_name(snapshot.get("name"))
                        if output_path:
                            try:
                                snapshot["src"] = f"{OUTPUTS_URL_PREFIX}/{quote(output_path.name)}"
                                with output_path.open("rb") as handle:
                                    snapshot["mime_type"] = detect_raster_mime(handle.read(16))
                                snapshot["size"] = output_path.stat().st_size
                            except (OSError, ImageSafetyError):
                                pass
                    recovered_snapshots.append(snapshot)
                turn["referenceSnapshots"] = recovered_snapshots
            recovered_turns.append(turn)
        session["turns"] = recovered_turns
        recovered_sessions.append(session)

    return {**state, "sessions": recovered_sessions}


def read_studio_session_state() -> Dict[str, Any]:
    payload = read_json(STUDIO_SESSIONS_FILE, empty_studio_session_state())
    return _recover_studio_session_images(studio_session_state_from_payload(payload))


class SessionRevisionConflict(Exception):
    def __init__(self, current: Dict[str, Any]):
        super().__init__("Studio session revision conflict")
        self.current = current


def expected_studio_revision(payload: Dict[str, Any]) -> Optional[int]:
    if "expected_revision" not in payload:
        return None
    value = payload.get("expected_revision")
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise HTTPException(status_code=400, detail="expected_revision 必须是正整数")
    return value


def inspect_studio_reference_source(
    src: str,
) -> Tuple[Optional[bytes], str, int, Optional[Path]]:
    source = str(src or "").strip()
    if source.startswith(f"{OUTPUTS_URL_PREFIX}/"):
        existing_path = path_from_output_url(source)
        if existing_path is None:
            raise ImageSafetyError("参考图输出路径无效")
        relative_path = existing_path.relative_to(OUTPUTS_DIR.resolve())
        validated_path = resolve_output_image(OUTPUTS_DIR, str(relative_path))
        actual_size = validated_path.stat().st_size
        if actual_size > REFERENCE_IMAGE_MAX_BYTES:
            raise ImageSafetyError("参考图超过单图容量限制", 413)
        with validated_path.open("rb") as handle:
            detected_mime_type = detect_raster_mime(handle.read(16))
        return (
            None,
            detected_mime_type,
            actual_size,
            validated_path,
        )

    if source.startswith(("http://", "https://")):
        raise ImageSafetyError("参考图不允许使用远程 URL")
    if not source.startswith("data:"):
        raise ImageSafetyError("参考图只支持本工具输出图片或 data URL")

    raw_bytes, detected_mime_type = decode_raster_data_url(
        source,
        max_bytes=REFERENCE_IMAGE_MAX_BYTES,
    )
    return raw_bytes, detected_mime_type, len(raw_bytes), None


def studio_turn_snapshot_values(turn: Any) -> List[Dict[str, Any]]:
    if not isinstance(turn, dict):
        return []
    values: List[Dict[str, Any]] = []
    snapshots = turn.get("referenceSnapshots")
    if isinstance(snapshots, list):
        values.extend(
            snapshot
            for snapshot in snapshots[:STUDIO_MAX_REFS_PER_TURN]
            if isinstance(snapshot, dict)
        )
    mask_snapshot = turn.get("maskSnapshot")
    if isinstance(mask_snapshot, dict):
        values.append(mask_snapshot)
    mask_file_snapshot = turn.get("maskFileSnapshot")
    if isinstance(mask_file_snapshot, dict):
        values.append(mask_file_snapshot)
    return values


def preflight_studio_reference_request(payload: Dict[str, Any]) -> None:
    total_bytes = 0
    sessions_value = payload.get("sessions") if isinstance(payload, dict) else []
    sessions = sessions_value if isinstance(sessions_value, list) else []
    if len(sessions) > STUDIO_MAX_SESSIONS:
        raise HTTPException(
            status_code=413,
            detail=f"会话数量超过 {STUDIO_MAX_SESSIONS} 个上限",
        )
    for session in sessions:
        if not isinstance(session, dict):
            continue
        turns_value = session.get("turns")
        turns = turns_value if isinstance(turns_value, list) else []
        for turn in turns[-STUDIO_MAX_TURNS:]:
            for snapshot in studio_turn_snapshot_values(turn):
                src = str(snapshot.get("src") or "").strip()
                if not src:
                    continue
                try:
                    size = inspect_studio_reference_source(src)[2]
                except ImageSafetyError as exc:
                    raise HTTPException(
                        status_code=exc.status_code,
                        detail=str(exc),
                    ) from exc
                total_bytes += size
                if total_bytes > REFERENCE_REQUEST_MAX_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail="参考图总大小超过请求限制",
                    )


def stable_studio_reference_digest(
    session_id: str,
    turn_id: str,
    ref_id: str,
    raw_bytes: bytes,
) -> str:
    digest = hashlib.sha256()
    for value, fallback in (
        (session_id, "session"),
        (turn_id, "turn"),
        (ref_id, "reference"),
    ):
        encoded = safe_filename_part(value, fallback).encode("utf-8")
        digest.update(len(encoded).to_bytes(4, "big"))
        digest.update(encoded)
    digest.update(len(raw_bytes).to_bytes(8, "big"))
    digest.update(raw_bytes)
    return digest.hexdigest()[:32]


def normalize_studio_reference(
    snapshot: Any,
    session_id: str,
    turn_id: str,
    index: int,
    created_paths: Optional[set[Path]] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(snapshot, dict):
        return None
    name = str(snapshot.get("name") or f"reference-{index + 1}.png").strip()[:180]
    ref_id = str(snapshot.get("id") or f"{turn_id}-ref-{index + 1}").strip()[:160]
    mime_type = str(snapshot.get("mime_type") or snapshot.get("mimeType") or "image/png").strip()
    src = str(snapshot.get("src") or "").strip()
    normalized: Dict[str, Any] = {
        "id": ref_id,
        "name": name,
        "mime_type": mime_type if mime_type.startswith("image/") else "image/png",
    }
    try:
        size = int(snapshot.get("size") or 0)
        if size > 0:
            normalized["size"] = size
    except (TypeError, ValueError):
        pass

    if src:
        try:
            raw_bytes, detected_mime_type, actual_size, validated_path = (
                inspect_studio_reference_source(src)
            )
            if validated_path is not None:
                normalized["src"] = src
                normalized["mime_type"] = detected_mime_type
                normalized["size"] = actual_size
                return normalized
        except ImageSafetyError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail=str(exc),
            ) from exc

        if raw_bytes is None:
            raise HTTPException(status_code=400, detail="参考图内容无效")
        extension = guess_extension(detected_mime_type)
        SESSION_REFS_DIR.mkdir(parents=True, exist_ok=True)
        digest = stable_studio_reference_digest(
            session_id,
            turn_id,
            ref_id,
            raw_bytes,
        )
        target_path = SESSION_REFS_DIR / f"ref-{digest}{extension}"
        resolved_target = target_path.resolve()
        try:
            handle = target_path.open("xb")
        except FileExistsError:
            if target_path.read_bytes() != raw_bytes:
                raise HTTPException(
                    status_code=409,
                    detail="会话参考图文件内容冲突",
                )
        else:
            if created_paths is not None:
                created_paths.add(resolved_target)
            try:
                with handle:
                    handle.write(raw_bytes)
                    handle.flush()
                    os.fsync(handle.fileno())
            except Exception:
                removed = False
                try:
                    target_path.unlink(missing_ok=True)
                    removed = not target_path.exists()
                except OSError:
                    pass
                if removed and created_paths is not None:
                    created_paths.discard(resolved_target)
                raise
        normalized["src"] = output_url_for_path(target_path)
        normalized["mime_type"] = detected_mime_type
        normalized["size"] = len(raw_bytes)
        dimensions = detect_image_dimensions(raw_bytes, detected_mime_type)
        if dimensions:
            normalized["dimensions"] = dimensions
    return normalized


def bounded_text(value: Any, limit: int) -> str:
    try:
        max_chars = max(0, int(limit))
    except (TypeError, ValueError):
        max_chars = 0
    if value is None:
        return ""
    return str(value)[:max_chars]


def bounded_json_value(
    value: Any,
    depth: int,
    item_limit: int,
    string_limit: int,
    max_depth: int = STUDIO_META_MAX_DEPTH,
) -> Any:
    if isinstance(value, str):
        return bounded_text(value, string_limit)
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None

    try:
        max_items = max(0, int(item_limit))
        current_depth = max(0, int(depth))
        allowed_depth = max(0, int(max_depth))
    except (TypeError, ValueError):
        return None

    if isinstance(value, dict):
        if current_depth >= allowed_depth:
            return {}
        bounded: Dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= max_items:
                break
            bounded_key = bounded_text(key, string_limit)
            bounded[bounded_key] = bounded_json_value(
                item,
                current_depth + 1,
                max_items,
                string_limit,
                allowed_depth,
            )
        return bounded

    if isinstance(value, list):
        if current_depth >= allowed_depth:
            return []
        return [
            bounded_json_value(
                item,
                current_depth + 1,
                max_items,
                string_limit,
                allowed_depth,
            )
            for item in value[:max_items]
        ]
    return None


def compact_json_size(value: Any) -> int:
    return len(
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8")
    )


def compact_studio_metadata(meta: Any) -> Dict[str, Any]:
    if not isinstance(meta, dict):
        return {}
    bounded = bounded_json_value(
        sanitize_history_meta(meta),
        0,
        STUDIO_META_MAX_ITEMS,
        STUDIO_META_STRING_MAX_CHARS,
        STUDIO_META_MAX_DEPTH,
    )
    if not isinstance(bounded, dict):
        return {}
    while bounded and compact_json_size(bounded) > STUDIO_META_MAX_BYTES:
        bounded.pop(next(reversed(bounded)))
    return bounded


def compact_studio_image(image: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(image, dict):
        return None
    compact: Dict[str, Any] = {}
    for key in (
        "id",
        "name",
        "saved_name",
        "saved_url",
        "saved_path",
        "url",
        "mime_type",
    ):
        value = image.get(key)
        if isinstance(value, str) and value:
            compact[key] = bounded_text(value, STUDIO_IMAGE_STRING_MAX_CHARS)

    dimensions = image.get("dimensions")
    if isinstance(dimensions, dict):
        compact_dimensions: Dict[str, Any] = {}
        for key in ("width", "height"):
            value = dimensions.get(key)
            if (
                not isinstance(value, bool)
                and isinstance(value, (int, float))
                and math.isfinite(float(value))
                and value > 0
            ):
                compact_dimensions[key] = value
        if compact_dimensions:
            compact["dimensions"] = compact_dimensions

    saved_url = str(compact.get("saved_url") or "")
    try:
        has_valid_saved_url = bool(saved_url and path_from_output_url(saved_url))
    except (OSError, ValueError):
        has_valid_saved_url = False
    url = str(compact.get("url") or "").strip().lower()
    if has_valid_saved_url and url.startswith(("data:", "http://", "https://")):
        compact.pop("url", None)
    return compact or None


def normalized_session_json_size(state: Dict[str, Any]) -> int:
    serialized = json.dumps(state, ensure_ascii=False, indent=2) + "\n"
    return len(serialized.encode("utf-8"))


def compact_studio_turn(
    turn: Any,
    session_id: str,
    created_paths: Optional[set[Path]] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(turn, dict):
        return None
    now = datetime.now().isoformat(timespec="seconds")
    turn_id = str(turn.get("id") or f"turn-{int(time.time() * 1000)}").strip()
    compact: Dict[str, Any] = {
        "id": turn_id,
        "engine": str(turn.get("engine") or "gpt-image-2"),
        "mode": str(turn.get("mode") or "generate"),
        "prompt": bounded_text(turn.get("prompt"), STUDIO_TEXT_MAX_CHARS),
        "createdAt": str(turn.get("createdAt") or now),
        "status": str(turn.get("status") or "success"),
        "images": [
            compact_image
            for image in (
                turn.get("images", [])
                if isinstance(turn.get("images"), list)
                else []
            )[:20]
            if (compact_image := compact_studio_image(image))
        ],
    }
    for key in ("negativePrompt", "posterText", "reply"):
        value = turn.get(key)
        if isinstance(value, str) and value:
            compact[key] = bounded_text(value, STUDIO_TEXT_MAX_CHARS)
    finished_at = turn.get("finishedAt")
    if isinstance(finished_at, str) and finished_at:
        compact["finishedAt"] = bounded_text(
            finished_at,
            STUDIO_IMAGE_STRING_MAX_CHARS,
        )
    error = turn.get("error")
    if isinstance(error, str) and error:
        compact["error"] = bounded_text(error, STUDIO_ERROR_MAX_CHARS)
    if isinstance(turn.get("elapsedSeconds"), (int, float)):
        compact["elapsedSeconds"] = turn["elapsedSeconds"]
    if isinstance(turn.get("meta"), dict):
        compact["meta"] = compact_studio_metadata(turn["meta"])

    snapshots = turn.get("referenceSnapshots")
    if isinstance(snapshots, list):
        refs = [
            normalized
            for index, snapshot in enumerate(snapshots[:STUDIO_MAX_REFS_PER_TURN])
            if (
                normalized := normalize_studio_reference(
                    snapshot,
                    session_id,
                    turn_id,
                    index,
                    created_paths,
                )
            )
        ]
        if refs:
            compact["referenceSnapshots"] = refs
    mask_snapshot = turn.get("maskSnapshot")
    if isinstance(mask_snapshot, dict):
        normalized_mask_snapshot = normalize_studio_reference(
            mask_snapshot,
            session_id,
            turn_id,
            STUDIO_MAX_REFS_PER_TURN,
            created_paths,
        )
        if normalized_mask_snapshot:
            compact["maskSnapshot"] = normalized_mask_snapshot
    mask_file_snapshot = turn.get("maskFileSnapshot")
    if isinstance(mask_file_snapshot, dict):
        normalized_mask_file_snapshot = normalize_studio_reference(
            mask_file_snapshot,
            session_id,
            turn_id,
            STUDIO_MAX_REFS_PER_TURN + 1,
            created_paths,
        )
        if normalized_mask_file_snapshot:
            compact["maskFileSnapshot"] = normalized_mask_file_snapshot
    return compact


def session_timestamp_value(session: Dict[str, Any]) -> float:
    for key in ("updatedAt", "createdAt"):
        value = str(session.get(key) or "")
        if not value:
            continue
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
    return 0.0


def compact_studio_session(
    session: Any,
    created_paths: Optional[set[Path]] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(session, dict):
        return None
    now = datetime.now().isoformat(timespec="seconds")
    session_id = str(session.get("id") or f"session-{int(time.time() * 1000)}").strip()
    raw_turns = session.get("turns") if isinstance(session.get("turns"), list) else []
    turns = [
        compact_turn
        for turn in raw_turns[-STUDIO_MAX_TURNS:]
        if (compact_turn := compact_studio_turn(turn, session_id, created_paths))
    ]
    compact_session = {
        "id": session_id,
        "title": str(session.get("title") or "新对话").strip()[:120] or "新对话",
        "createdAt": str(session.get("createdAt") or now),
        "updatedAt": str(session.get("updatedAt") or now),
        "turns": turns,
    }
    drafts = session.get("drafts")
    if isinstance(drafts, dict):
        compact_drafts: Dict[str, Any] = {}
        shared_draft = drafts.get("shared")
        if isinstance(shared_draft, dict):
            compact_drafts["shared"] = {
                "fixed_prompt": bounded_text(
                    shared_draft.get("fixed_prompt"),
                    STUDIO_TEXT_MAX_CHARS,
                ),
            }
        gpt_draft = drafts.get("gpt")
        if isinstance(gpt_draft, dict):
            compact_gpt = {
                "prompt": bounded_text(
                    gpt_draft.get("prompt"),
                    STUDIO_TEXT_MAX_CHARS,
                ),
                "negative_prompt": bounded_text(
                    gpt_draft.get("negative_prompt"),
                    STUDIO_TEXT_MAX_CHARS,
                ),
                "poster_text": bounded_text(
                    gpt_draft.get("poster_text"),
                    STUDIO_TEXT_MAX_CHARS,
                ),
            }
            compact_drafts["gpt"] = compact_gpt
        banana_draft = drafts.get("banana")
        if isinstance(banana_draft, dict):
            compact_drafts["banana"] = {
                "prompt": bounded_text(
                    banana_draft.get("prompt"),
                    STUDIO_TEXT_MAX_CHARS,
                ),
            }
        if compact_drafts:
            compact_session["drafts"] = compact_drafts
    return compact_session


def collect_referenced_output_paths(sessions: List[Dict[str, Any]]) -> set[Path]:
    paths: set[Path] = set()
    for session in sessions:
        for turn in session.get("turns", []):
            for ref in studio_turn_snapshot_values(turn):
                path = path_from_output_url(str(ref.get("src") or ""))
                if path:
                    paths.add(path.resolve())
    return paths


def collect_session_reference_paths(sessions: List[Dict[str, Any]]) -> set[Path]:
    try:
        reference_root = SESSION_REFS_DIR.resolve()
    except OSError:
        return set()
    paths: set[Path] = set()
    for path in collect_referenced_output_paths(sessions):
        try:
            resolved = path.resolve()
            resolved.relative_to(reference_root)
        except (OSError, ValueError):
            continue
        if resolved != reference_root:
            paths.add(resolved)
    return paths


def validate_session_reference_capacity(sessions: List[Dict[str, Any]]) -> None:
    referenced = collect_session_reference_paths(sessions)
    if len(referenced) > STUDIO_MAX_REF_FILES:
        raise HTTPException(
            status_code=413,
            detail=f"会话参考图文件数量超过 {STUDIO_MAX_REF_FILES} 个上限",
        )

    total_bytes = 0
    for path in referenced:
        try:
            total_bytes += path.stat().st_size
        except OSError:
            continue
        if total_bytes > STUDIO_MAX_REF_BYTES:
            raise HTTPException(
                status_code=413,
                detail="会话参考图文件总容量超过上限",
            )


def cleanup_created_session_reference_files(
    created_paths: set[Path],
    protected_paths: set[Path],
) -> None:
    try:
        reference_root = SESSION_REFS_DIR.resolve()
    except OSError:
        return
    for path in created_paths:
        try:
            resolved = path.resolve()
            resolved.relative_to(reference_root)
        except (OSError, ValueError):
            continue
        if resolved == reference_root or resolved in protected_paths:
            continue
        try:
            resolved.unlink(missing_ok=True)
        except OSError:
            pass


def prune_session_reference_files(sessions: List[Dict[str, Any]]) -> None:
    if not SESSION_REFS_DIR.exists():
        return
    referenced = collect_session_reference_paths(sessions)
    files = [path for path in SESSION_REFS_DIR.iterdir() if path.is_file()]
    for path in files:
        if path.resolve() not in referenced:
            try:
                path.unlink()
            except OSError:
                pass


def normalize_studio_session_state(
    payload: Dict[str, Any],
    created_paths: Optional[set[Path]] = None,
) -> Dict[str, Any]:
    sessions_value = payload.get("sessions") if isinstance(payload, dict) else []
    sessions = [
        compact_session
        for session in (sessions_value if isinstance(sessions_value, list) else [])
        if (compact_session := compact_studio_session(session, created_paths))
    ]
    sessions = sorted(sessions, key=session_timestamp_value, reverse=True)[:STUDIO_MAX_SESSIONS]
    active_session_id = str(payload.get("active_session_id") or payload.get("activeSessionId") or "").strip()
    if active_session_id and not any(session["id"] == active_session_id for session in sessions):
        active_session_id = sessions[0]["id"] if sessions else ""
    return {
        "version": 1,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "active_session_id": active_session_id or (sessions[0]["id"] if sessions else ""),
        "sessions": sessions,
    }


def write_studio_session_state(payload: Dict[str, Any]) -> Dict[str, Any]:
    created_paths: set[Path] = set()
    protected_paths: set[Path] = set()
    committed = False

    def mutate_sessions(current_payload: Any) -> Dict[str, Any]:
        current = studio_session_state_from_payload(current_payload)
        protected_paths.update(collect_session_reference_paths(current["sessions"]))
        expected_revision = expected_studio_revision(payload)
        if expected_revision is not None and expected_revision != current["revision"]:
            raise SessionRevisionConflict(current)
        preflight_studio_reference_request(payload)
        normalized = normalize_studio_session_state(payload, created_paths)
        normalized["revision"] = current["revision"] + 1
        validate_session_reference_capacity(normalized["sessions"])
        if normalized_session_json_size(normalized) > STUDIO_SESSION_JSON_MAX_BYTES:
            raise HTTPException(status_code=413, detail="会话数据超过容量限制")
        return normalized

    def after_write(normalized: Dict[str, Any]) -> None:
        nonlocal committed
        committed = True
        prune_session_reference_files(normalized["sessions"])

    try:
        return mutate_json(
            STUDIO_SESSIONS_FILE,
            empty_studio_session_state(),
            mutate_sessions,
            after_write=after_write,
        )
    except Exception:
        if not committed:
            cleanup_created_session_reference_files(created_paths, protected_paths)
        raise


class _HistoryEntryNotFound(Exception):
    pass


def update_history_entry(entry_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target_id = str(entry_id or "").strip()
    if not target_id:
        return None

    updated_entry: Optional[Dict[str, Any]] = None
    allowed_keys = {"favorite"}
    clean_updates = {key: updates[key] for key in allowed_keys if key in updates}

    def mutate_history(payload: Any) -> Dict[str, Any]:
        nonlocal updated_entry
        next_entries: List[Dict[str, Any]] = []
        for entry in history_entries_from_payload(payload):
            if str(entry.get("id") or "") == target_id:
                entry = dict(entry)
                if "favorite" in clean_updates:
                    entry["favorite"] = bool(clean_updates["favorite"])
                updated_entry = entry
            next_entries.append(entry)
        if updated_entry is None:
            raise _HistoryEntryNotFound
        return history_payload(next_entries)

    try:
        mutate_json(HISTORY_FILE, [], mutate_history)
    except _HistoryEntryNotFound:
        return None
    assert updated_entry is not None
    return normalize_history_entry(updated_entry)


def history_output_path(image: Dict[str, Any]) -> Optional[Path]:
    raw_path = str(image.get("saved_path") or "").strip()
    raw_name = str(image.get("saved_name") or image.get("name") or "").strip()
    candidate = ROOT_DIR / raw_path if raw_path else OUTPUTS_DIR / Path(raw_name).name
    try:
        resolved = candidate.resolve()
        outputs_root = OUTPUTS_DIR.resolve()
        if resolved == outputs_root or outputs_root not in resolved.parents:
            return None
    except Exception:
        return None
    return resolved


def root_relative_path(path: Path) -> str:
    return str(path.resolve().relative_to(ROOT_DIR.resolve())).replace("\\", "/")


def legacy_output_entry_id(path_or_name: Path | str) -> str:
    name = Path(path_or_name).name
    token = base64.urlsafe_b64encode(name.encode("utf-8")).decode("ascii").rstrip("=")
    return f"legacy-file-{token}"


def legacy_output_path(raw_path: str) -> Optional[Path]:
    value = str(raw_path or "").strip()
    if not value:
        return None
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = ROOT_DIR / candidate
    try:
        resolved = candidate.resolve()
        outputs_root = OUTPUTS_DIR.resolve()
        if resolved == outputs_root or outputs_root not in resolved.parents:
            return None
    except Exception:
        return None
    return resolved


def is_legacy_output_file(path: Path) -> bool:
    try:
        resolved = path.resolve()
        outputs_root = OUTPUTS_DIR.resolve()
    except Exception:
        return False
    return (
        resolved.parent == outputs_root
        and resolved.is_file()
        and resolved.name not in {HISTORY_FILE.name, "history.tmp"}
        and resolved.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
    )


def delete_legacy_output_entry(entry_id: str, legacy_path: str) -> Tuple[bool, List[str]]:
    target_id = str(entry_id or "").strip()
    target_path = legacy_output_path(legacy_path)

    if target_path is None and target_id.startswith("legacy-") and not target_id.startswith("legacy-file-"):
        stem = target_id.removeprefix("legacy-")
        matches = [path for path in OUTPUTS_DIR.iterdir() if path.is_file() and path.stem == stem] if OUTPUTS_DIR.exists() else []
        if len(matches) == 1:
            target_path = matches[0]

    if target_path is None or not is_legacy_output_file(target_path):
        return False, []

    if target_id.startswith("legacy-file-"):
        if target_id != legacy_output_entry_id(target_path.name):
            return False, []
    elif target_id.startswith("legacy-"):
        if target_path.stem != target_id.removeprefix("legacy-"):
            return False, []
    else:
        return False, []

    try:
        target_path.unlink()
        return True, [root_relative_path(target_path)]
    except Exception:
        return False, []


def delete_history_entry(entry_id: str, *, delete_files: bool = False, legacy_path: str = "") -> Tuple[bool, List[str]]:
    target_id = str(entry_id or "").strip()
    if not target_id:
        return False, []

    if target_id.startswith("legacy-") and delete_files:
        return delete_legacy_output_entry(target_id, legacy_path)

    removed_entries: List[Dict[str, Any]] = []

    def mutate_history(payload: Any) -> Dict[str, Any]:
        entries = history_entries_from_payload(payload)
        removed_entries.extend(entry for entry in entries if str(entry.get("id") or "") == target_id)
        if not removed_entries:
            raise _HistoryEntryNotFound
        next_entries = [entry for entry in entries if str(entry.get("id") or "") != target_id]
        return history_payload(next_entries)

    try:
        mutate_json(HISTORY_FILE, [], mutate_history)
    except _HistoryEntryNotFound:
        return False, []

    deleted_files: List[str] = []
    if delete_files:
        for entry in removed_entries:
            for image in entry.get("images", []):
                if not isinstance(image, dict):
                    continue
                path = history_output_path(image)
                if not path or not path.exists() or not path.is_file():
                    continue
                try:
                    path.unlink()
                    deleted_files.append(root_relative_path(path))
                except Exception:
                    continue

    return True, deleted_files


def history_image_record(image: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    saved_name = str(image.get("saved_name") or "").strip()
    saved_url = str(image.get("saved_url") or "").strip()
    saved_path = str(image.get("saved_path") or "").strip()
    if not saved_name and saved_path:
        saved_name = Path(saved_path).name
    if not saved_url and saved_name:
        saved_url = f"{OUTPUTS_URL_PREFIX}/{quote(saved_name)}"
    if not saved_url and not saved_path:
        return None

    record: Dict[str, Any] = {
        "name": saved_name or str(image.get("name") or "image.png"),
        "saved_url": saved_url,
        "saved_path": saved_path,
        "mime_type": image.get("mime_type") or "image/*",
        "source": image.get("source") or "result",
    }
    if image.get("dimensions"):
        record["dimensions"] = image["dimensions"]
    return record


def append_generation_history(
    *,
    engine: str,
    prompt: str,
    negative_prompt: str = "",
    form_state: Optional[Dict[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
    messages: Optional[List[str]] = None,
    images: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    image_records = [record for image in (images or []) if (record := history_image_record(image))]
    if not image_records:
        return None

    created_at = datetime.now().isoformat(timespec="seconds")
    entry = {
        "id": f"{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}-{safe_filename_part(engine, 'engine')}-{uuid4().hex}",
        "created_at": created_at,
        "engine": engine,
        "favorite": False,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "form_state": dict(form_state or {}),
        "meta": sanitize_history_meta(meta or {}),
        "messages": [compact_text(str(message), 400) for message in (messages or []) if message],
        "images": image_records,
    }
    def mutate_history(payload: Any) -> Dict[str, Any]:
        entries = history_entries_from_payload(payload)
        return history_payload([entry, *entries])

    mutate_json(HISTORY_FILE, [], mutate_history)
    return entry


def legacy_output_entries(known_names: set[str]) -> List[Dict[str, Any]]:
    if not OUTPUTS_DIR.exists():
        return []

    entries: List[Dict[str, Any]] = []
    for path in OUTPUTS_DIR.iterdir():
        if not path.is_file() or path.name in {HISTORY_FILE.name, "history.tmp"}:
            continue
        if path.name in known_names:
            continue
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}:
            continue

        engine = "gpt-image-2" if "gpt-image-2" in path.name else "banana" if "banana" in path.name else "unknown"
        created_at = datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds")
        entries.append(
            {
                "id": legacy_output_entry_id(path.name),
                "created_at": created_at,
                "engine": engine,
                "legacy": True,
                "favorite": False,
                "prompt": "旧输出图片（没有历史参数）",
                "negative_prompt": "",
                "form_state": {},
                "meta": {
                    "output_dir": "outputs",
                    "saved_count": 1,
                    "legacy_record": True,
                },
                "messages": ["这张图是在历史记录功能启用前保存的，所以没有提示词和参数。"],
                "images": [
                    {
                        "name": path.name,
                        "saved_url": f"{OUTPUTS_URL_PREFIX}/{quote(path.name)}",
                        "saved_path": storage_path_display(path),
                        "mime_type": mimetypes.guess_type(path.name)[0] or "image/*",
                        "source": "legacy-output",
                    }
                ],
            }
        )
    return entries


def get_history_payload(limit: int = 120) -> List[Dict[str, Any]]:
    entries = read_history_entries()
    known_names = {
        Path(str(image.get("saved_path") or image.get("name") or "")).name
        for entry in entries
        for image in entry.get("images", [])
        if isinstance(image, dict)
    }
    combined = [*(normalize_history_entry(entry) for entry in entries), *legacy_output_entries(known_names)]
    combined.sort(key=lambda entry: str(entry.get("created_at") or ""), reverse=True)
    return combined[: max(1, min(limit, HISTORY_MAX_ENTRIES))]


def download_remote_image(
    url: str,
    budget: Optional[UpstreamImageBudget] = None,
) -> Optional[Dict[str, str]]:
    active_budget = budget or UpstreamImageBudget()
    active_budget.ensure_image_slot()
    response = None
    try:
        response = requests.get(
            url,
            timeout=(15, 30),
            stream=True,
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "image/*,*/*;q=0.8",
            },
        )
        response.raise_for_status()
        content_length = str(response.headers.get("Content-Length") or "").strip()
        if content_length:
            try:
                parsed_content_length = int(content_length)
            except ValueError:
                parsed_content_length = 0
            if parsed_content_length > active_budget.remaining_checked_bytes:
                raise UpstreamResultLimitError(UPSTREAM_RESULT_LIMIT_MESSAGE)
            if parsed_content_length > REMOTE_RESULT_MAX_BYTES:
                raise ImageSafetyError("远程图片超过容量限制", 413)
        payload = bytearray()
        for chunk in response.iter_content(64 * 1024):
            if not chunk:
                continue
            active_budget.charge_checked_bytes(len(chunk))
            if len(payload) + len(chunk) > REMOTE_RESULT_MAX_BYTES:
                raise ImageSafetyError("远程图片超过容量限制", 413)
            payload.extend(chunk)
        raw_bytes = bytes(payload)
        claimed_mime = (
            response.headers.get("Content-Type", "").split(";", 1)[0].strip()
        )
        mime_type = validate_raster_bytes(
            raw_bytes,
            max_bytes=REMOTE_RESULT_MAX_BYTES,
            claimed_mime=claimed_mime,
        )
        active_budget.accept_image()
        payload = base64.b64encode(raw_bytes).decode("utf-8")
        return {
            "src": data_url_from_base64(payload, mime_type),
            "mime_type": mime_type,
            "source": "downloaded-url",
        }
    except UpstreamResultLimitError:
        raise
    except Exception:
        return None
    finally:
        close_response = getattr(response, "close", None)
        if callable(close_response):
            try:
                close_response()
            except Exception:
                pass


def is_image_url(value: str) -> bool:
    text = (value or "").strip()
    if not text.startswith(("http://", "https://")):
        return False
    if IMAGE_URL_PATTERN.search(text):
        return True

    text_lower = text.lower()
    if not any(re.search(pattern, text_lower) for pattern in IMAGE_HOST_PATTERNS):
        return False
    return any(token in text_lower for token in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", "image", "img", "pic", "photo"))


def extract_image_urls_from_text(text: str) -> List[str]:
    urls = [match.rstrip(".,;:!?") for match in URL_PATTERN.findall(text or "")]
    return [url for url in urls if is_image_url(url)]


def extract_banana_images(
    response_data: Dict[str, Any],
    *,
    _download_urls: bool = True,
    budget: Optional[UpstreamImageBudget] = None,
    max_images: int = 1,
) -> Dict[str, Any]:
    active_budget = budget or UpstreamImageBudget()
    candidate_limit = max(0, min(int(max_images), active_budget.remaining_images))
    images: List[Dict[str, str]] = []
    messages: List[str] = []
    pending_urls: List[str] = []
    image_candidates = 0

    def claim_image_candidate() -> bool:
        nonlocal image_candidates
        if image_candidates >= candidate_limit:
            return False
        image_candidates += 1
        return True

    candidates = response_data.get("candidates") or []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        for part in parts:
            if not isinstance(part, dict):
                continue

            inline_data = part.get("inlineData")
            if isinstance(inline_data, dict):
                base64_data = inline_data.get("data")
                mime_type = inline_data.get("mimeType") or "image/png"
                if (
                    isinstance(base64_data, str)
                    and base64_data.strip()
                    and claim_image_candidate()
                ):
                    extracted = decode_upstream_raster(
                        data_url_from_base64(base64_data, mime_type),
                        active_budget,
                    )
                    if extracted:
                        raw_bytes, detected_mime_type = extracted
                        encoded = base64.b64encode(raw_bytes).decode("utf-8")
                        images.append(
                            {
                                "src": data_url_from_base64(encoded, detected_mime_type),
                                "mime_type": detected_mime_type,
                                "source": "inlineData",
                            }
                        )
                        continue

            file_data = part.get("fileData")
            if isinstance(file_data, dict):
                file_uri = (
                    file_data.get("fileUri")
                    or file_data.get("uri")
                    or file_data.get("url")
                )
                if (
                    isinstance(file_uri, str)
                    and is_image_url(file_uri)
                    and claim_image_candidate()
                ):
                    pending_urls.append(file_uri)
                    continue

            text_value = part.get("text")
            if isinstance(text_value, str) and text_value.strip():
                text_content = text_value.strip()
                markdown_matches = MARKDOWN_BASE64_IMAGE_PATTERN.findall(text_content)
                if markdown_matches:
                    for mime_type, base64_data in markdown_matches:
                        if not claim_image_candidate():
                            break
                        extracted = decode_upstream_raster(
                            data_url_from_base64(base64_data, mime_type),
                            active_budget,
                        )
                        if not extracted:
                            continue
                        raw_bytes, detected_mime_type = extracted
                        encoded = base64.b64encode(raw_bytes).decode("utf-8")
                        images.append(
                            {
                                "src": data_url_from_base64(encoded, detected_mime_type),
                                "mime_type": detected_mime_type,
                                "source": "markdown-base64",
                            }
                        )
                    text_content = MARKDOWN_BASE64_IMAGE_PATTERN.sub("", text_content).strip()

                if not text_content:
                    continue

                if is_image_url(text_content) and claim_image_candidate():
                    pending_urls.append(text_content)
                    continue

                found_urls = extract_image_urls_from_text(text_content)
                if found_urls:
                    for found_url in found_urls:
                        if not claim_image_candidate():
                            break
                        pending_urls.append(found_url)
                    for found_url in found_urls:
                        text_content = text_content.replace(found_url, "").strip()

                if text_content:
                    messages.append(text_content)

            image_url = part.get("image_url") or part.get("imageUrl") or part.get("url")
            if (
                isinstance(image_url, str)
                and is_image_url(image_url)
                and claim_image_candidate()
            ):
                pending_urls.append(image_url)

    if _download_urls:
        for image_url in pending_urls:
            downloaded = download_remote_image(image_url, active_budget)
            if downloaded:
                images.append(downloaded)

    result: Dict[str, Any] = {
        "images": images,
        "messages": [message for message in messages if message],
    }
    if not _download_urls:
        result["_pending_urls"] = pending_urls
    return result


async def extract_banana_images_async(
    response_data: Dict[str, Any],
    *,
    job_id: str = "",
    budget: Optional[UpstreamImageBudget] = None,
    max_images: int = 1,
) -> Dict[str, Any]:
    active_budget = budget or UpstreamImageBudget()
    parsed = extract_banana_images(
        response_data,
        _download_urls=False,
        budget=active_budget,
        max_images=max_images,
    )
    pending_urls = parsed.pop("_pending_urls", [])
    for image_url in pending_urls:
        JOB_REGISTRY.raise_if_canceled(job_id)
        downloaded = await UPSTREAM_EXECUTOR.run(
            "download",
            download_remote_image,
            image_url,
            active_budget,
            before_start=lambda: JOB_REGISTRY.raise_if_canceled(job_id),
        )
        JOB_REGISTRY.raise_if_canceled(job_id)
        if downloaded:
            parsed["images"].append(downloaded)
    JOB_REGISTRY.raise_if_canceled(job_id)
    return parsed


async def read_upload_assets(
    files: Optional[List[UploadFile]],
    limit: int,
) -> List[Dict[str, Any]]:
    uploads = files or []
    if len(uploads) > limit:
        raise HTTPException(status_code=400, detail=f"参考图最多支持 {limit} 张")

    assets: List[Dict[str, Any]] = []
    total_bytes = 0
    for index, upload in enumerate(uploads, start=1):
        raw_bytes = await upload.read(REFERENCE_IMAGE_MAX_BYTES + 1)
        if not raw_bytes:
            continue
        claimed_mime = (
            upload.content_type
            or mimetypes.guess_type(upload.filename or "")[0]
            or ""
        )
        try:
            mime_type = validate_raster_bytes(
                raw_bytes,
                max_bytes=REFERENCE_IMAGE_MAX_BYTES,
                claimed_mime=claimed_mime,
            )
        except ImageSafetyError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail=str(exc),
            ) from exc
        total_bytes += len(raw_bytes)
        if total_bytes > REFERENCE_REQUEST_MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail="参考图总大小超过 150 MiB 限制",
            )
        encoded = base64.b64encode(raw_bytes).decode("utf-8")
        filename = upload.filename or f"reference-{index}{guess_extension(mime_type)}"
        asset = {
            "filename": filename,
            "request_filename": safe_multipart_filename(filename, index, mime_type),
            "mime_type": mime_type,
            "base64_data": encoded,
            "data_url": data_url_from_base64(encoded, mime_type),
            "bytes": raw_bytes,
        }
        dimensions = detect_image_dimensions(raw_bytes, mime_type)
        if dimensions:
            asset["dimensions"] = dimensions
        assets.append(asset)
    return assets


async def read_edit_mask_asset(
    upload: UploadFile,
    *,
    base_asset: Dict[str, Any],
) -> Dict[str, Any]:
    raw_bytes = await upload.read(REFERENCE_IMAGE_MAX_BYTES + 1)
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="遮罩文件为空")
    try:
        dimensions = validate_edit_mask_bytes(
            raw_bytes,
            base_raw=base_asset["bytes"],
            max_bytes=REFERENCE_IMAGE_MAX_BYTES,
        )
    except ImageSafetyError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return {
        "filename": upload.filename or "mask.png",
        "request_filename": "mask.png",
        "mime_type": "image/png",
        "bytes": raw_bytes,
        "dimensions": dimensions,
    }


def normalize_gpt_size(size: str) -> str:
    value = str(size or "auto").strip().lower().replace("×", "x")
    if value.startswith("auto"):
        return "auto"

    match = re.search(r"(\d+)\s*x\s*(\d+)", value)
    if not match:
        raise ValueError("size 格式错误，请填写 auto 或 1536x864 这种 宽x高 格式")

    width = int(match.group(1))
    height = int(match.group(2))
    if width <= 0 or height <= 0:
        raise ValueError("size 宽高必须为正整数")

    long_edge = max(width, height)
    short_edge = min(width, height)
    total_pixels = width * height

    if long_edge > GPT_IMAGE_2_MAX_EDGE:
        raise ValueError("gpt-image-2 的最长边不能超过 3840")
    if width % 16 != 0 or height % 16 != 0:
        raise ValueError("gpt-image-2 的宽高都必须是 16 的倍数")
    if long_edge / short_edge > GPT_IMAGE_2_MAX_RATIO:
        raise ValueError("gpt-image-2 的长宽比不能超过 3:1")
    if total_pixels < GPT_IMAGE_2_MIN_PIXELS or total_pixels > GPT_IMAGE_2_MAX_PIXELS:
        raise ValueError("gpt-image-2 的总像素数必须在 655360 到 8294400 之间")

    return f"{width}x{height}"


def normalize_gpt_endpoint(api_endpoint: str, has_reference_images: bool) -> str:
    endpoint = str(api_endpoint or "auto").strip()
    if not endpoint:
        endpoint = "auto"
    if endpoint != "auto" and not endpoint.startswith("/"):
        endpoint = f"/{endpoint}"

    if endpoint not in GPT_ENDPOINT_OPTIONS:
        raise ValueError(
            "GPT Image 2 的 api_endpoint 只能是 auto、/v1/images/generations、/v1/images/edits 或 /v1/responses"
        )
    if endpoint == "auto":
        return "/v1/images/edits" if has_reference_images else "/v1/images/generations"
    return endpoint


def build_gpt_api_url(base_url: str, endpoint: str = "/v1/images/generations") -> str:
    url = str(base_url or "").strip().rstrip("/")
    if not url:
        raise ValueError("请填写 GPT Image 2 的 Base URL")

    endpoint = str(endpoint or "/v1/images/generations").strip()
    if not endpoint.startswith("/"):
        endpoint = f"/{endpoint}"

    known_endpoints = (
        "/v1/images/generations",
        "/v1/images/edits",
        "/v1/responses",
    )
    for known_endpoint in known_endpoints:
        if re.search(re.escape(known_endpoint) + r"/?$", url):
            root = re.sub(re.escape(known_endpoint) + r"/?$", "", url).rstrip("/")
            root = route_yuzapi_base_url(root, endpoint)
            return f"{root}{endpoint}"

    if re.search(r"/v1/images/?$", url):
        if endpoint.startswith("/v1/images/"):
            url = route_yuzapi_base_url(url, endpoint)
            return f"{url}{endpoint[len('/v1/images'):]}"
        root = re.sub(r"/v1/images/?$", "", url).rstrip("/")
        root = route_yuzapi_base_url(root, endpoint)
        return f"{root}{endpoint}"

    if re.search(r"/v1/?$", url):
        url = route_yuzapi_base_url(url, endpoint)
        if endpoint.startswith("/v1/"):
            return f"{url}{endpoint[len('/v1'):]}"
        return f"{url}{endpoint}"
    url = route_yuzapi_base_url(url, endpoint)
    return f"{url}{endpoint}"


def build_openai_chat_url(base_url: str) -> str:
    return build_gpt_api_url(base_url, "/v1/chat/completions")


def route_yuzapi_base_url(base_url: str, endpoint: str) -> str:
    parsed = urlparse(base_url)
    host = (parsed.hostname or "").lower()
    if host not in {"yuzapi.fun", "image.yuzapi.fun"}:
        return base_url

    target_host = "yuzapi.fun" if endpoint == "/v1/chat/completions" else "image.yuzapi.fun"
    netloc = target_host
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return parsed._replace(netloc=netloc).geturl().rstrip("/")


def fallback_yuzapi_image_url(api_url: str) -> str:
    parsed = urlparse(api_url)
    if (parsed.hostname or "").lower() != "image.yuzapi.fun":
        return ""
    netloc = "yuzapi.fun"
    if parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return parsed._replace(netloc=netloc).geturl()


def extract_openai_chat_reply(payload: Dict[str, Any]) -> str:
    choices = payload.get("choices")
    if isinstance(choices, list):
        parts: List[str] = []
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            message = choice.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str):
                    parts.append(content.strip())
                elif isinstance(content, list):
                    for item in content:
                        if isinstance(item, dict):
                            text = item.get("text") or item.get("content")
                            if isinstance(text, str):
                                parts.append(text.strip())
            text = choice.get("text")
            if isinstance(text, str):
                parts.append(text.strip())
        reply = "\n".join(part for part in parts if part)
        if reply:
            return reply

    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()
    return ""


def extract_banana_text_reply(payload: Dict[str, Any]) -> str:
    parts: List[str] = []
    candidates = payload.get("candidates")
    if isinstance(candidates, list):
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content") or {}
            candidate_parts = content.get("parts") if isinstance(content, dict) else []
            if not isinstance(candidate_parts, list):
                continue
            for part in candidate_parts:
                if not isinstance(part, dict):
                    continue
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())

    text = "\n".join(parts)
    if text.strip():
        return text.strip()
    return ""


def normalize_chat_history_messages(messages: Any, limit: int = 20) -> List[Dict[str, str]]:
    if not isinstance(messages, list):
        return []

    normalized: List[Dict[str, str]] = []
    for item in messages:
        role = ""
        content = ""
        if isinstance(item, dict):
            role = str(item.get("role") or "").strip().lower()
            raw_content = item.get("content")
            if isinstance(raw_content, str):
                content = raw_content.strip()
        elif isinstance(item, str):
            role = "user"
            content = item.strip()

        if role not in {"user", "assistant", "model"} or not content:
            continue
        normalized.append(
            {
                "role": "assistant" if role == "model" else role,
                "content": compact_text(content, 2000),
            }
        )

    return normalized[-limit:]


def build_openai_chat_messages(prompt: str, history_messages: Any) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [
        {
            "role": "system",
            "content": "你是一个中文生图工作台里的创作助手。回答要直接、实用，优先帮助用户改提示词、理解参考图和推进生成方案。",
        }
    ]
    messages.extend(normalize_chat_history_messages(history_messages))
    messages.append({"role": "user", "content": prompt})
    return messages


def build_banana_chat_contents(prompt: str, history_messages: Any) -> List[Dict[str, Any]]:
    contents: List[Dict[str, Any]] = []
    for message in normalize_chat_history_messages(history_messages):
        role = "model" if message["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": message["content"]}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    return contents


def redact_diagnostic_text(text: str, secrets: List[str]) -> str:
    return sanitize_client_error(text, secrets=secrets)


def redact_diagnostic_endpoint(endpoint: str, secrets: List[str]) -> str:
    return sanitize_client_error(
        sanitize_client_url(str(endpoint or "")),
        secrets=secrets,
    )


def diagnostic_result(
    capability: str,
    label: str,
    ok: bool,
    endpoint: str,
    model: str,
    started_at: float,
    status_code: Optional[int] = None,
    error_code: str = "",
    secrets: Optional[List[str]] = None,
) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "capability": capability,
        "label": label,
        "ok": ok,
        "endpoint": redact_diagnostic_endpoint(endpoint, secrets or []),
        "model": sanitize_client_error(model, secrets=secrets, fallback=""),
        "latency_ms": max(0, int((time.monotonic() - started_at) * 1000)),
    }
    if status_code is not None:
        result["status_code"] = status_code
    if not ok:
        resolved_error_code = error_code or upstream_error_classification(status_code or 0)[1]
        result["error_code"] = resolved_error_code
        result["error"] = CLIENT_ERROR_DETAILS[resolved_error_code]
    return result


def summarize_diagnostic_warning(results: List[Dict[str, Any]]) -> str:
    if not results:
        return "未执行诊断。"
    by_capability = {str(item.get("capability")): bool(item.get("ok")) for item in results}
    generation_ok = by_capability.get("generation")
    chat_ok = by_capability.get("chat")
    if generation_ok is True and chat_ok is False:
        return "生图可用，聊天失败。"
    if generation_ok is False and chat_ok is True:
        return "聊天可用，生图失败。"
    failed = [str(item.get("label") or item.get("capability")) for item in results if not item.get("ok")]
    if failed:
        return f"{'、'.join(failed)}诊断失败。"
    return ""


async def run_gpt_generation_diagnostic(payload: Dict[str, Any], secrets: List[str]) -> Dict[str, Any]:
    api_key = str(payload.get("api_key") or "").strip()
    base_url = str(payload.get("base_url") or DEFAULT_GPT_BASE_URL).strip()
    model = str(payload.get("model") or DEFAULT_GPT_MODEL).strip()
    timeout = bounded_timeout(payload.get("timeout"), default=45, maximum=120)
    endpoint = build_gpt_api_url(base_url, "/v1/images/generations")
    started_at = time.monotonic()
    if not api_key:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            error_code="E_UPSTREAM_AUTH",
            secrets=secrets,
        )
    try:
        response = await UPSTREAM_EXECUTOR.run(
            "generation",
            requests.post,
            endpoint,
            headers=gpt_headers(
                api_key,
                content_type="application/json",
            ),
            json={
                "model": model,
                "prompt": "diagnostic connectivity test, simple neutral square",
                "size": "1024x1024",
                "n": 1,
            },
            timeout=timeout,
        )
        if not response.ok:
            public_status, error_code = upstream_error_classification(response.status_code)
            return diagnostic_result(
                "generation",
                "生图",
                False,
                endpoint,
                model,
                started_at,
                public_status,
                error_code,
                secrets,
            )
        response_data = response_json_utf8_first(response)
        parsed_images = await build_gpt_images_from_response_async(
            response_data if isinstance(response_data, dict) else {},
            max_images=1,
            budget=UpstreamImageBudget(max_images=1),
        )
        if not parsed_images:
            return diagnostic_result(
                "generation",
                "生图",
                False,
                endpoint,
                model,
                started_at,
                502,
                "E_UPSTREAM_RESPONSE",
                secrets,
            )
        return diagnostic_result(
            "generation",
            "生图",
            True,
            endpoint,
            model,
            started_at,
            response.status_code,
            secrets=secrets,
        )
    except requests.Timeout:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            status_code=504,
            error_code="E_UPSTREAM_TIMEOUT",
            secrets=secrets,
        )
    except requests.RequestException:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_NETWORK",
            secrets=secrets,
        )
    except Exception:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_RESPONSE",
            secrets=secrets,
        )


async def run_gpt_chat_diagnostic(payload: Dict[str, Any], secrets: List[str]) -> Dict[str, Any]:
    api_key = str(payload.get("api_key") or "").strip()
    base_url = str(payload.get("base_url") or DEFAULT_GPT_BASE_URL).strip()
    model = normalize_gpt_chat_model(payload.get("chat_model") or payload.get("model") or DEFAULT_GPT_CHAT_MODEL)
    reasoning_effort = str(payload.get("reasoning_effort") or "auto").strip()
    timeout = bounded_timeout(payload.get("timeout"), default=45, maximum=120)
    endpoint = build_openai_chat_url(base_url)
    started_at = time.monotonic()
    if not api_key:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            error_code="E_UPSTREAM_AUTH",
            secrets=secrets,
        )
    chat_payload: Dict[str, Any] = {
        "model": model,
        "messages": build_openai_chat_messages("请只回复 OK，用于连接诊断。", []),
    }
    if reasoning_effort in GPT_REASONING_EFFORTS and reasoning_effort != "auto":
        chat_payload["reasoning_effort"] = reasoning_effort
    try:
        response = await UPSTREAM_EXECUTOR.run(
            "chat",
            requests.post,
            endpoint,
            headers=gpt_headers(
                api_key,
                content_type="application/json",
            ),
            json=chat_payload,
            timeout=timeout,
        )
        if not response.ok:
            public_status, error_code = upstream_error_classification(response.status_code)
            return diagnostic_result(
                "chat",
                "聊天",
                False,
                endpoint,
                model,
                started_at,
                public_status,
                error_code,
                secrets,
            )
        response_data = response_json_utf8_first(response)
        if not extract_openai_chat_reply(response_data if isinstance(response_data, dict) else {}):
            return diagnostic_result(
                "chat",
                "聊天",
                False,
                endpoint,
                model,
                started_at,
                502,
                "E_UPSTREAM_RESPONSE",
                secrets,
            )
        return diagnostic_result(
            "chat",
            "聊天",
            True,
            endpoint,
            model,
            started_at,
            response.status_code,
            secrets=secrets,
        )
    except requests.Timeout:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            status_code=504,
            error_code="E_UPSTREAM_TIMEOUT",
            secrets=secrets,
        )
    except requests.RequestException:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_NETWORK",
            secrets=secrets,
        )
    except Exception:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_RESPONSE",
            secrets=secrets,
        )


async def run_banana_generation_diagnostic(payload: Dict[str, Any], secrets: List[str]) -> Dict[str, Any]:
    api_key = str(payload.get("api_key") or "").strip()
    api_base_url = str(payload.get("api_base_url") or DEFAULT_BANANA_BASE_URL).strip()
    model = str(payload.get("model_type") or DEFAULT_BANANA_MODEL).strip()
    timeout = bounded_timeout(
        payload.get("timeout_seconds", payload.get("timeout")),
        default=45,
        maximum=120,
    )
    endpoint = build_banana_api_url(api_base_url, model)
    started_at = time.monotonic()
    if not api_key:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            error_code="E_UPSTREAM_AUTH",
            secrets=secrets,
        )
    try:
        session = create_requests_session(bool(payload.get("bypass_proxy")))
        response = await UPSTREAM_EXECUTOR.run(
            "generation",
            session.post,
            endpoint,
            headers=banana_headers(api_key),
            json=build_banana_request(
                prompt="diagnostic connectivity test, simple neutral square",
                seed=-1,
                aspect_ratio="Auto",
                top_p=0.95,
                image_size="1K",
                reference_assets=[],
            ),
            timeout=timeout,
            verify=not bool(payload.get("disable_ssl")),
        )
        if not response.ok:
            public_status, error_code = upstream_error_classification(response.status_code)
            return diagnostic_result(
                "generation",
                "生图",
                False,
                endpoint,
                model,
                started_at,
                public_status,
                error_code,
                secrets,
            )
        response_data = response_json_utf8_first(response)
        parsed = await extract_banana_images_async(
            response_data if isinstance(response_data, dict) else {},
            budget=UpstreamImageBudget(max_images=1),
            max_images=1,
        )
        if not parsed.get("images"):
            return diagnostic_result(
                "generation",
                "生图",
                False,
                endpoint,
                model,
                started_at,
                502,
                "E_UPSTREAM_RESPONSE",
                secrets,
            )
        return diagnostic_result(
            "generation",
            "生图",
            True,
            endpoint,
            model,
            started_at,
            response.status_code,
            secrets=secrets,
        )
    except requests.Timeout:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            status_code=504,
            error_code="E_UPSTREAM_TIMEOUT",
            secrets=secrets,
        )
    except requests.RequestException:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_NETWORK",
            secrets=secrets,
        )
    except Exception:
        return diagnostic_result(
            "generation",
            "生图",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_RESPONSE",
            secrets=secrets,
        )


async def run_banana_chat_diagnostic(payload: Dict[str, Any], secrets: List[str]) -> Dict[str, Any]:
    api_key = str(payload.get("api_key") or "").strip()
    api_base_url = str(payload.get("api_base_url") or DEFAULT_BANANA_BASE_URL).strip()
    model = str(payload.get("model_type") or DEFAULT_BANANA_MODEL).strip()
    timeout = bounded_timeout(
        payload.get("timeout_seconds", payload.get("timeout")),
        default=45,
        maximum=120,
    )
    endpoint = build_banana_api_url(api_base_url, model)
    started_at = time.monotonic()
    if not api_key:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            error_code="E_UPSTREAM_AUTH",
            secrets=secrets,
        )
    try:
        session = create_requests_session(bool(payload.get("bypass_proxy")))
        response = await UPSTREAM_EXECUTOR.run(
            "chat",
            session.post,
            endpoint,
            headers=banana_headers(api_key),
            json={
                "contents": build_banana_chat_contents("请只回复 OK，用于连接诊断。", []),
                "generationConfig": {"responseModalities": ["TEXT"]},
            },
            timeout=timeout,
            verify=not bool(payload.get("disable_ssl")),
        )
        if not response.ok:
            public_status, error_code = upstream_error_classification(response.status_code)
            return diagnostic_result(
                "chat",
                "聊天",
                False,
                endpoint,
                model,
                started_at,
                public_status,
                error_code,
                secrets,
            )
        response_data = response_json_utf8_first(response)
        if not extract_banana_text_reply(response_data if isinstance(response_data, dict) else {}):
            return diagnostic_result(
                "chat",
                "聊天",
                False,
                endpoint,
                model,
                started_at,
                502,
                "E_UPSTREAM_RESPONSE",
                secrets,
            )
        return diagnostic_result(
            "chat",
            "聊天",
            True,
            endpoint,
            model,
            started_at,
            response.status_code,
            secrets=secrets,
        )
    except requests.Timeout:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            status_code=504,
            error_code="E_UPSTREAM_TIMEOUT",
            secrets=secrets,
        )
    except requests.RequestException:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_NETWORK",
            secrets=secrets,
        )
    except Exception:
        return diagnostic_result(
            "chat",
            "聊天",
            False,
            endpoint,
            model,
            started_at,
            status_code=502,
            error_code="E_UPSTREAM_RESPONSE",
            secrets=secrets,
        )


async def run_diagnostics(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = str(payload.get("engine") or "gpt-image-2").strip()
    if engine not in {"gpt-image-2", "banana"}:
        engine = "gpt-image-2"
    raw_checks = payload.get("checks")
    checks = [str(item) for item in raw_checks] if isinstance(raw_checks, list) else ["generation", "chat"]
    checks = [item for item in checks if item in {"generation", "chat"}] or ["generation", "chat"]
    secrets = [str(payload.get("api_key") or "")]
    results: List[Dict[str, Any]] = []
    if engine == "banana":
        if "generation" in checks:
            results.append(await run_banana_generation_diagnostic(payload, secrets))
        if "chat" in checks:
            results.append(await run_banana_chat_diagnostic(payload, secrets))
    else:
        if "generation" in checks:
            results.append(await run_gpt_generation_diagnostic(payload, secrets))
        if "chat" in checks:
            results.append(await run_gpt_chat_diagnostic(payload, secrets))
    ok = all(bool(item.get("ok")) for item in results)
    return {
        "ok": ok,
        "engine": engine,
        "warning": "" if ok else summarize_diagnostic_warning(results),
        "results": results,
    }


def merge_generation_context_prompt(prompt: str, context_prompt: str) -> str:
    prompt_text = prompt.strip()
    context_text = compact_text(context_prompt.strip(), 1800)
    if not context_text:
        return prompt_text
    return (
        "当前会话上下文，仅作为延续本次创作方向的参考：\n"
        f"{context_text}\n\n"
        "本次生成要求：\n"
        f"{prompt_text}"
    )


def estimate_cost(total_tokens: int) -> str:
    if total_tokens <= 0:
        return "Unknown"
    cost = (total_tokens / 1000.0) * 0.02
    return f"${cost:.4f}"


def extract_gpt_image_values(
    payload: Dict[str, Any],
    *,
    limit: int = UPSTREAM_RESULT_MAX_IMAGES,
) -> List[str]:
    """Collect image values from Images API and Responses API style payloads."""
    values: List[str] = []
    seen = set()
    result_limit = max(0, min(int(limit), UPSTREAM_RESULT_MAX_IMAGES))

    def add_value(key: str, item: Any) -> None:
        if len(values) >= result_limit or not isinstance(item, str):
            return
        stripped = item.strip()
        if not (
            (key in {"b64_json", "result"} and stripped)
            or stripped.startswith("data:image")
            or stripped.startswith("http://")
            or stripped.startswith("https://")
            or len(stripped) > 200
        ):
            return
        if stripped in seen:
            return
        seen.add(stripped)
        values.append(stripped)

    def visit(value: Any) -> None:
        if len(values) >= result_limit:
            return
        if isinstance(value, dict):
            for key in ("b64_json", "url", "image_url", "result"):
                add_value(key, value.get(key))
            for child in value.values():
                visit(child)
            return

        if isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return values


def normalize_plain_base64_image(
    value: str,
    budget: Optional[UpstreamImageBudget] = None,
) -> Optional[Tuple[str, str]]:
    active_budget = budget or UpstreamImageBudget()
    cleaned = re.sub(r"\s+", "", value or "")
    if not cleaned:
        return None
    cleaned += "=" * ((-len(cleaned)) % 4)
    extracted = decode_upstream_raster(
        data_url_from_base64(cleaned, "image/png"),
        active_budget,
    )
    if not extracted:
        return None
    raw_bytes, mime_type = extracted
    encoded = base64.b64encode(raw_bytes).decode("utf-8")
    return data_url_from_base64(encoded, mime_type), mime_type


def build_gpt_image_from_value(
    index: int,
    image_value: str,
    budget: Optional[UpstreamImageBudget] = None,
) -> Optional[Dict[str, str]]:
    active_budget = budget or UpstreamImageBudget()
    if image_value.startswith("data:image"):
        extracted = decode_upstream_raster(image_value, active_budget)
        if not extracted:
            return None
        raw_bytes, mime_type = extracted
        encoded = base64.b64encode(raw_bytes).decode("utf-8")
        return {
            "src": data_url_from_base64(encoded, mime_type),
            "mime_type": mime_type,
            "source": "data-url",
            "name": f"gpt-image-2-{index:02d}{guess_extension(mime_type)}",
        }

    normalized_base64 = normalize_plain_base64_image(image_value, active_budget)
    if not normalized_base64:
        return None
    image_src, mime_type = normalized_base64
    return {
        "src": image_src,
        "mime_type": mime_type,
        "source": "b64_json",
        "name": f"gpt-image-2-{index:02d}{guess_extension(mime_type)}",
    }


def name_downloaded_gpt_image(downloaded: Dict[str, str], index: int) -> Dict[str, str]:
    downloaded["name"] = (
        f"gpt-image-2-{index:02d}{guess_extension(downloaded['mime_type'])}"
    )
    return downloaded


def build_gpt_images_from_response(
    response_data: Dict[str, Any],
    *,
    max_images: Optional[int] = None,
    budget: Optional[UpstreamImageBudget] = None,
) -> List[Dict[str, str]]:
    active_budget = budget or UpstreamImageBudget()
    result_limit = min(
        active_budget.remaining_images,
        int(max_images if max_images is not None else active_budget.remaining_images),
    )
    images: List[Dict[str, str]] = []
    for index, image_value in enumerate(
        extract_gpt_image_values(response_data, limit=result_limit),
        start=1,
    ):
        if image_value.startswith(("http://", "https://")):
            downloaded = download_remote_image(image_value, active_budget)
            if downloaded:
                images.append(name_downloaded_gpt_image(downloaded, index))
            continue
        image = build_gpt_image_from_value(index, image_value, active_budget)
        if image:
            images.append(image)
    return images


async def build_gpt_images_from_response_async(
    response_data: Dict[str, Any],
    *,
    job_id: str = "",
    max_images: Optional[int] = None,
    budget: Optional[UpstreamImageBudget] = None,
) -> List[Dict[str, str]]:
    active_budget = budget or UpstreamImageBudget()
    result_limit = min(
        active_budget.remaining_images,
        int(max_images if max_images is not None else active_budget.remaining_images),
    )
    images: List[Dict[str, str]] = []
    for index, image_value in enumerate(
        extract_gpt_image_values(response_data, limit=result_limit),
        start=1,
    ):
        if image_value.startswith(("http://", "https://")):
            JOB_REGISTRY.raise_if_canceled(job_id)
            downloaded = await UPSTREAM_EXECUTOR.run(
                "download",
                download_remote_image,
                image_value,
                active_budget,
                before_start=lambda: JOB_REGISTRY.raise_if_canceled(job_id),
            )
            JOB_REGISTRY.raise_if_canceled(job_id)
            if downloaded:
                images.append(name_downloaded_gpt_image(downloaded, index))
            continue
        image = build_gpt_image_from_value(index, image_value, active_budget)
        if image:
            images.append(image)
    JOB_REGISTRY.raise_if_canceled(job_id)
    return images


def create_app() -> FastAPI:
    app = FastAPI(title="Image Generate Web Tool", version="1.0.0")
    origins = dev_cors_origins()
    app.add_middleware(RequestBoundaryMiddleware, allowed_origins=origins)
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["*"],
            allow_headers=["*"],
            allow_credentials=False,
        )
    app.add_middleware(TrustedLocalHostMiddleware, allowed_origins=origins)
    app.add_middleware(
        DesktopTokenMiddleware,
        token=os.getenv("IMAGE_TOOL_DESKTOP_TOKEN", ""),
    )
    app.router.route_class = LimitedGenerationMultipartRoute
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    studio_assets_dir = STUDIO_STATIC_DIR / "assets"
    if studio_assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(studio_assets_dir)), name="studio-assets")

    def normalized_request_job_id(value: Any, *, allow_empty: bool) -> str:
        try:
            return normalize_job_id(value, allow_empty=allow_empty)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="job_id 无效") from exc

    async def generation_job_scope(request: Request) -> AsyncIterator[str]:
        form = await request.form(
            max_files=GENERATION_MULTIPART_MAX_FILES,
            max_fields=GENERATION_MULTIPART_MAX_FIELDS,
            max_part_size=GENERATION_MULTIPART_MAX_FIELD_BYTES,
        )
        explicit = "job_id" in form
        raw_job_id = form.get("job_id") if explicit else None
        normalized = normalized_request_job_id(raw_job_id, allow_empty=not explicit)
        if normalized:
            JOB_REGISTRY.register(normalized)
        try:
            yield normalized
        finally:
            if normalized:
                JOB_REGISTRY.forget(normalized)

    async def chat_job_scope(request: Request) -> AsyncIterator[str]:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        explicit = isinstance(payload, dict) and "job_id" in payload
        raw_job_id = payload.get("job_id") if explicit else None
        normalized = normalized_request_job_id(raw_job_id, allow_empty=not explicit)
        if normalized:
            JOB_REGISTRY.register(normalized)
        try:
            yield normalized
        finally:
            if normalized:
                JOB_REGISTRY.forget(normalized)

    @app.exception_handler(ClientSafeHTTPException)
    async def handle_client_safe_http_exception(
        _request: Request,
        exc: ClientSafeHTTPException,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": str(exc.detail),
                "error_code": exc.error_code,
            },
            headers=exc.headers,
        )

    @app.exception_handler(JobCancelled)
    async def handle_job_cancelled(_request: Request, _exc: JobCancelled) -> JSONResponse:
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "canceled": True,
                "images": [],
                "messages": [],
                "history_entry": None,
                "reply": "",
                "meta": {},
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(_request: Request, _exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"detail": "后端内部错误，请重试。", "error_code": "E_INTERNAL"},
        )

    @app.get("/")
    async def index() -> FileResponse:
        studio_index = STUDIO_STATIC_DIR / "index.html"
        if studio_index.exists():
            response = FileResponse(studio_index)
        else:
            response = FileResponse(STATIC_DIR / "index.html")
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    @app.get("/classic")
    async def classic_index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/outputs/{relative_path:path}")
    async def output_image(relative_path: str) -> FileResponse:
        try:
            path = resolve_output_image(OUTPUTS_DIR, relative_path)
            with path.open("rb") as handle:
                mime_type = detect_raster_mime(handle.read(16))
        except (ImageSafetyError, OSError) as exc:
            raise HTTPException(status_code=404, detail="图片不存在") from exc
        response = FileResponse(path, media_type=mime_type)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "private, max-age=3600"
        return response

    @app.get("/api/health")
    async def health() -> Dict[str, Any]:
        return {
            "ok": True,
            "app": "image-generate-web-tool",
            "version": read_app_version(),
            "instance_id": compute_instance_id(),
            "engines": ["banana", "gpt-image-2"],
            "features": {"studio_sessions": True, "session_reference_files": True},
        }

    @app.post("/api/jobs/{job_id:path}/cancel")
    async def cancel_job(job_id: str) -> Dict[str, Any]:
        normalized = normalized_request_job_id(job_id, allow_empty=False)
        JOB_REGISTRY.cancel(normalized)
        return {
            "ok": True,
            "job_id": normalized,
            "canceled": True,
            "warning": "任务已在本地取消；如果上游已经接单，仍可能继续运行或计费。",
        }

    @app.get("/api/config/defaults")
    async def config_defaults() -> Dict[str, Any]:
        payload = build_runtime_defaults()
        return {
            "ok": True,
            **payload,
        }

    @app.post("/api/config/local-file")
    async def write_local_config(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
        try:
            normalized = normalize_config_payload(payload)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            write_config_file_payload(normalized)
        except ConfigSecretError as exc:
            raise HTTPException(status_code=500, detail="桌面配置加密失败，请检查当前 Windows 用户环境") from exc
        return {
            "ok": True,
            "path": str(PRIMARY_CONFIG_FILE.relative_to(ROOT_DIR)).replace("\\", "/"),
        }

    @app.post("/api/diagnostics")
    async def diagnostics(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
        return await run_diagnostics(payload)

    @app.get("/api/history")
    async def generation_history(limit: int = 120) -> Dict[str, Any]:
        return {
            "ok": True,
            "path": storage_path_display(HISTORY_FILE),
            "entries": get_history_payload(limit),
        }

    @app.get("/api/studio/sessions")
    async def studio_sessions() -> Dict[str, Any]:
        state = read_studio_session_state()
        return {
            "ok": True,
            "path": storage_path_display(STUDIO_SESSIONS_FILE),
            **state,
        }

    @app.put("/api/studio/sessions")
    async def write_studio_sessions(payload: Dict[str, Any] = Body(...)) -> Any:
        try:
            state = write_studio_session_state(payload)
        except SessionRevisionConflict as exc:
            return JSONResponse(
                status_code=409,
                content={
                    "detail": "会话已被其他页面更新，请刷新后重试。",
                    "current": exc.current,
                },
            )
        return {
            "ok": True,
            "path": storage_path_display(STUDIO_SESSIONS_FILE),
            "reference_dir": storage_path_display(SESSION_REFS_DIR),
            **state,
        }

    @app.patch("/api/history/{entry_id}")
    async def update_generation_history(entry_id: str, payload: Dict[str, Any] = Body(...), limit: int = 120) -> Dict[str, Any]:
        if entry_id.startswith("legacy-"):
            raise HTTPException(status_code=400, detail="旧输出图片不是 history.json 记录，不能更新收藏状态。")

        updated_entry = update_history_entry(entry_id, payload)
        if updated_entry is None:
            raise HTTPException(status_code=404, detail="没有找到这条历史记录。")

        return {
            "ok": True,
            "entry": updated_entry,
            "path": storage_path_display(HISTORY_FILE),
            "entries": get_history_payload(limit),
        }

    @app.delete("/api/history/{entry_id}")
    async def delete_generation_history(
        entry_id: str,
        limit: int = 120,
        delete_files: bool = False,
        legacy_path: str = "",
    ) -> Dict[str, Any]:
        if entry_id.startswith("legacy-") and not delete_files:
            raise HTTPException(status_code=400, detail="旧输出图片不是 history.json 记录，无法只从历史中删除。")

        deleted, deleted_files = delete_history_entry(entry_id, delete_files=delete_files, legacy_path=legacy_path)
        if not deleted:
            raise HTTPException(status_code=404, detail="没有找到这条历史记录。")

        return {
            "ok": True,
            "deleted_id": entry_id,
            "deleted_files": deleted_files,
            "path": storage_path_display(HISTORY_FILE),
            "entries": get_history_payload(limit),
        }

    @app.post("/api/open-outputs")
    async def open_outputs_folder() -> Dict[str, Any]:
        try:
            open_local_directory(OUTPUTS_DIR)
        except Exception as exc:
            raise client_http_error(
                "E_LOCAL_OPEN_OUTPUTS",
                status_code=500,
            ) from exc

        return {
            "ok": True,
            "path": storage_path_display(OUTPUTS_DIR),
        }

    @app.post("/api/desktop/storage-root")
    async def switch_desktop_storage_root(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
        try:
            path = switch_runtime_outputs_root(str(payload.get("path") or ""))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "ok": True,
            "path": str(path),
            "outputs_root": str(path),
            "restart_required": False,
        }

    @app.post("/api/chat/gpt-image-2")
    async def chat_gpt_image_2(
        payload: Dict[str, Any] = Body(...),
        job_id: str = Depends(chat_job_scope),
    ) -> Dict[str, Any]:
        JOB_REGISTRY.raise_if_canceled(job_id)
        prompt = str(payload.get("prompt") or "").strip()
        api_key = str(payload.get("api_key") or "").strip()
        base_url = str(payload.get("base_url") or DEFAULT_GPT_BASE_URL).strip()
        model = normalize_gpt_chat_model(payload.get("chat_model") or payload.get("model") or DEFAULT_GPT_CHAT_MODEL)
        reasoning_effort = str(payload.get("reasoning_effort") or "auto").strip().lower()
        timeout = bounded_timeout(
            payload.get("timeout"),
            default=120,
            maximum=MAX_CHAT_TIMEOUT,
        )
        if not api_key:
            raise HTTPException(status_code=400, detail="请填写 GPT Image 2 API Key")
        if not prompt:
            raise HTTPException(status_code=400, detail="请先输入聊天内容")
        if not model:
            raise HTTPException(status_code=400, detail="请填写聊天模型名")
        if reasoning_effort not in GPT_REASONING_EFFORTS:
            reasoning_effort = "auto"

        api_url = build_openai_chat_url(base_url)
        chat_payload: Dict[str, Any] = {
            "model": model,
            "messages": build_openai_chat_messages(prompt, payload.get("messages")),
        }
        if reasoning_effort != "auto":
            chat_payload["reasoning_effort"] = reasoning_effort
        started_at = time.time()
        try:
            JOB_REGISTRY.raise_if_canceled(job_id)
            response = await UPSTREAM_EXECUTOR.run(
                "chat",
                requests.post,
                api_url,
                before_start=lambda: JOB_REGISTRY.raise_if_canceled(job_id),
                headers=gpt_headers(
                    api_key,
                    accept="application/json",
                    content_type="application/json",
                ),
                json=chat_payload,
                timeout=timeout,
            )
            JOB_REGISTRY.raise_if_canceled(job_id)
        except requests.Timeout as exc:
            raise client_http_error(
                "E_UPSTREAM_TIMEOUT",
                status_code=504,
            ) from exc
        except requests.RequestException as exc:
            raise client_http_error(
                "E_UPSTREAM_NETWORK",
                status_code=502,
            ) from exc

        if not response.ok:
            public_status, error_code = upstream_error_classification(response.status_code)
            raise client_http_error(
                error_code,
                status_code=public_status,
            )

        try:
            response_data = response_json_utf8_first(response)
            reply = extract_openai_chat_reply(
                response_data if isinstance(response_data, dict) else {}
            )
        except Exception as exc:
            raise client_http_error(
                "E_UPSTREAM_RESPONSE",
                status_code=502,
            ) from exc
        if not reply:
            raise client_http_error(
                "E_UPSTREAM_RESPONSE",
                status_code=502,
            )

        usage = response_data.get("usage") if isinstance(response_data, dict) else {}
        return {
            "ok": True,
            "engine": "gpt-image-2",
            "reply": reply,
            "meta": sanitize_history_meta(
                {
                    "model": model,
                    "api_base_url": api_url,
                    "reasoning_effort": reasoning_effort,
                    "elapsed_seconds": round(time.time() - started_at, 2),
                    "usage": usage if isinstance(usage, dict) else {},
                }
            ),
        }

    @app.post("/api/chat/banana")
    async def chat_banana(
        payload: Dict[str, Any] = Body(...),
        job_id: str = Depends(chat_job_scope),
    ) -> Dict[str, Any]:
        JOB_REGISTRY.raise_if_canceled(job_id)
        prompt = str(payload.get("prompt") or "").strip()
        api_key = str(payload.get("api_key") or "").strip()
        api_base_url = str(payload.get("api_base_url") or DEFAULT_BANANA_BASE_URL).strip()
        model_type = str(payload.get("model_type") or DEFAULT_BANANA_MODEL).strip()
        top_p = float(payload.get("top_p") or 0.95)
        timeout_seconds = bounded_timeout(
            payload.get("timeout_seconds"),
            default=60,
            maximum=MAX_CHAT_TIMEOUT,
        )
        bypass_proxy = bool(payload.get("bypass_proxy") or False)
        disable_ssl = bool(payload.get("disable_ssl") or False)
        if not api_key:
            raise HTTPException(status_code=400, detail="请填写 Banana API Key")
        if not prompt:
            raise HTTPException(status_code=400, detail="请先输入聊天内容")

        api_url = build_banana_api_url(api_base_url, model_type)
        started_at = time.time()
        session = create_requests_session(bypass_proxy=bypass_proxy)
        try:
            JOB_REGISTRY.raise_if_canceled(job_id)
            response = await UPSTREAM_EXECUTOR.run(
                "chat",
                session.post,
                api_url,
                before_start=lambda: JOB_REGISTRY.raise_if_canceled(job_id),
                json={
                    "contents": build_banana_chat_contents(prompt, payload.get("messages")),
                    "generationConfig": {
                        "topP": top_p,
                        "responseModalities": ["TEXT"],
                    },
                },
                headers=banana_headers(api_key),
                timeout=(15, timeout_seconds),
                verify=not disable_ssl,
            )
            JOB_REGISTRY.raise_if_canceled(job_id)
        except requests.Timeout as exc:
            raise client_http_error(
                "E_UPSTREAM_TIMEOUT",
                status_code=504,
            ) from exc
        except requests.RequestException as exc:
            raise client_http_error(
                "E_UPSTREAM_NETWORK",
                status_code=502,
            ) from exc

        if not response.ok:
            public_status, error_code = upstream_error_classification(response.status_code)
            raise client_http_error(
                error_code,
                status_code=public_status,
            )

        try:
            response_data = response_json_utf8_first(response)
            reply = extract_banana_text_reply(
                response_data if isinstance(response_data, dict) else {}
            )
        except Exception as exc:
            raise client_http_error(
                "E_UPSTREAM_RESPONSE",
                status_code=502,
            ) from exc
        if not reply:
            raise client_http_error(
                "E_UPSTREAM_RESPONSE",
                status_code=502,
            )

        return {
            "ok": True,
            "engine": "banana",
            "reply": reply,
            "meta": sanitize_history_meta(
                {
                    "model_type": model_type,
                    "api_base_url": api_url,
                    "elapsed_seconds": round(time.time() - started_at, 2),
                }
            ),
        }

    @app.post("/api/generate/banana")
    async def generate_banana(
        prompt: str = Form(""),
        context_prompt: str = Form(""),
        api_key: str = Form(""),
        api_base_url: str = Form(DEFAULT_BANANA_BASE_URL),
        model_type: str = Form(DEFAULT_BANANA_MODEL),
        batch_size: int = Form(1),
        aspect_ratio: str = Form("Auto"),
        image_size: str = Form("2K"),
        seed: int = Form(-1),
        top_p: float = Form(0.95),
        timeout_seconds: int = Form(60),
        infinite_timeout: bool = Form(False),
        bypass_proxy: bool = Form(False),
        disable_ssl: bool = Form(False),
        reference_files: Optional[List[UploadFile]] = File(default=None),
        job_id: str = Depends(generation_job_scope),
    ) -> Dict[str, Any]:
        JOB_REGISTRY.raise_if_canceled(job_id)
        if not api_key.strip():
            raise HTTPException(status_code=400, detail="请填写 Banana API Key")
        if batch_size < 1 or batch_size > 8:
            raise HTTPException(status_code=400, detail="Banana 的 batch_size 只能是 1 到 8")

        effective_prompt = merge_generation_context_prompt(prompt, context_prompt)
        reference_assets = await read_upload_assets(reference_files, limit=14)
        effective_aspect_ratio = resolve_banana_aspect_ratio_from_reference(aspect_ratio, reference_assets)
        started_at = time.time()
        generated_images: List[Dict[str, str]] = []
        messages: List[str] = []
        batch_error_codes: List[str] = []
        seeds: List[int] = []
        session = create_requests_session(bypass_proxy=bypass_proxy)
        result_budget = UpstreamImageBudget()

        def append_batch_error(batch_number: int, error_code: str) -> None:
            messages.append(
                f"第 {batch_number} 批：{CLIENT_ERROR_DETAILS[error_code]}"
            )
            batch_error_codes.append(error_code)

        for index in range(batch_size):
            JOB_REGISTRY.raise_if_canceled(job_id)
            current_seed = seed + index if seed >= 0 else -1
            seeds.append(current_seed)
            payload = build_banana_request(
                prompt=effective_prompt,
                seed=current_seed,
                aspect_ratio=aspect_ratio,
                top_p=top_p,
                image_size=image_size,
                reference_assets=reference_assets,
            )
            api_url = build_banana_api_url(api_base_url, model_type)
            read_timeout = bounded_timeout(
                0 if infinite_timeout else timeout_seconds,
                default=60,
                maximum=MAX_GENERATION_TIMEOUT,
            )
            timeout = (15, read_timeout)

            try:
                result_budget.ensure_image_slot()
                JOB_REGISTRY.raise_if_canceled(job_id)
                response = await UPSTREAM_EXECUTOR.run(
                    "generation",
                    session.post,
                    api_url,
                    before_start=lambda: JOB_REGISTRY.raise_if_canceled(job_id),
                    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                    headers=banana_headers(api_key),
                    timeout=timeout,
                    verify=not disable_ssl,
                )
                JOB_REGISTRY.raise_if_canceled(job_id)
                if response.status_code >= 400:
                    _public_status, error_code = upstream_error_classification(
                        response.status_code
                    )
                    append_batch_error(index + 1, error_code)
                    continue

                parsed = await extract_banana_images_async(
                    response_json_utf8_first(response),
                    job_id=job_id,
                    budget=result_budget,
                    max_images=1,
                )
                batch_images = parsed["images"]
                batch_messages = parsed["messages"]
                if batch_images:
                    for image_index, image in enumerate(batch_images, start=1):
                        image["name"] = f"banana-{index + 1:02d}-{image_index:02d}{guess_extension(image['mime_type'])}"
                    generated_images.extend(batch_images)
                if batch_messages or not batch_images:
                    append_batch_error(index + 1, "E_UPSTREAM_RESPONSE")
            except JobCancelled:
                raise
            except UpstreamResultLimitError as exc:
                raise client_http_error(
                    "E_UPSTREAM_RESPONSE",
                    status_code=502,
                    detail=UPSTREAM_RESULT_LIMIT_MESSAGE,
                ) from exc
            except requests.Timeout:
                append_batch_error(index + 1, "E_UPSTREAM_TIMEOUT")
            except requests.RequestException:
                append_batch_error(index + 1, "E_UPSTREAM_NETWORK")
            except Exception:
                append_batch_error(index + 1, "E_UPSTREAM_RESPONSE")

        elapsed_seconds = round(time.time() - started_at, 2)
        history_entry: Optional[Dict[str, Any]] = None
        try:
            JOB_REGISTRY.raise_if_canceled(job_id)
            saved_count = await asyncio.to_thread(
                save_generated_images,
                "banana",
                generated_images,
                job_id=job_id,
            )
            JOB_REGISTRY.raise_if_canceled(job_id)
            meta = {
                "model_type": model_type,
                "api_base_url": public_url_hint(api_base_url),
                "batch_size": batch_size,
                "aspect_ratio": aspect_ratio,
                "effective_aspect_ratio": effective_aspect_ratio or "Auto",
                "image_size": image_size,
                "top_p": top_p,
                "timeout_seconds": timeout_seconds,
                "infinite_timeout": infinite_timeout,
                "reference_count": len(reference_assets),
                "image_count": len(generated_images),
                "saved_count": saved_count,
                "output_dir": "outputs",
                "elapsed_seconds": elapsed_seconds,
                "seeds": seeds,
            }
            form_state = {
                "prompt": prompt,
                "context_prompt": compact_text(context_prompt.strip(), 1800),
                "batch_size": batch_size,
                "aspect_ratio": aspect_ratio,
                "image_size": image_size,
                "seed": seed,
                "top_p": top_p,
                "timeout_seconds": timeout_seconds,
                "infinite_timeout": infinite_timeout,
                "bypass_proxy": bypass_proxy,
                "disable_ssl": disable_ssl,
            }
            JOB_REGISTRY.raise_if_canceled(job_id)
            history_entry = await asyncio.to_thread(
                append_generation_history,
                engine="banana",
                prompt=prompt,
                form_state=form_state,
                meta=meta,
                messages=messages,
                images=generated_images,
            )
            JOB_REGISTRY.raise_if_canceled(job_id)
            if history_entry:
                meta["history_id"] = history_entry["id"]
            result: Dict[str, Any] = {
                "ok": bool(generated_images),
                "engine": "banana",
                "images": generated_images,
                "messages": messages,
                "meta": meta,
                "history_entry": history_entry,
            }
            if batch_error_codes:
                result["error_code"] = batch_error_codes[0]
            return result
        except JobCancelled:
            if history_entry:
                delete_history_entry(str(history_entry.get("id") or ""))
            cleanup_generated_image_files(generated_images)
            raise

    @app.post("/api/generate/gpt-image-2")
    async def generate_gpt_image_2(
        api_key: str = Form(""),
        base_url: str = Form(DEFAULT_GPT_BASE_URL),
        model: str = Form(DEFAULT_GPT_MODEL),
        prompt: str = Form(""),
        context_prompt: str = Form(""),
        negative_prompt: str = Form(""),
        poster_text: str = Form(""),
        size: str = Form("auto"),
        quality: str = Form("auto"),
        n: int = Form(1),
        seed: int = Form(-1),
        style_preset: str = Form("none"),
        enhance_prompt: bool = Form(True),
        safety_check: bool = Form(True),
        response_format: str = Form("auto"),
        edit_mode: str = Form("generate"),
        reference_strength: float = Form(0.7),
        timeout: int = Form(300),
        infinite_timeout: bool = Form(False),
        custom_size: str = Form("1536x864"),
        api_endpoint: str = Form("auto"),
        reference_files: Optional[List[UploadFile]] = File(default=None),
        mask_file: Optional[UploadFile] = File(default=None),
        mask_encoding: str = Form("standard"),
        # Compatibility-only field for an older cached Studio build. It is
        # intentionally ignored: masked results are never hard-composited.
        strict_mask: bool = Form(False),
        job_id: str = Depends(generation_job_scope),
    ) -> Dict[str, Any]:
        JOB_REGISTRY.raise_if_canceled(job_id)
        if not api_key.strip():
            raise HTTPException(status_code=400, detail="请填写 GPT Image 2 API Key")
        if not prompt.strip():
            raise HTTPException(status_code=400, detail="请填写提示词")
        if n < 1 or n > 10:
            raise HTTPException(status_code=400, detail="GPT Image 2 的数量只能是 1 到 10")

        try:
            reference_assets = await read_upload_assets(reference_files, limit=16)
            request_reference_assets = reference_assets
            normalized_size = normalize_gpt_size(custom_size if size == "custom" else size)
            mask_asset: Optional[Dict[str, Any]] = None
            normalized_mask_encoding = "standard"
            if mask_file is not None:
                if not reference_assets:
                    raise HTTPException(status_code=400, detail="使用遮罩前请先添加第一张编辑底图")
                requested_endpoint = str(api_endpoint or "auto").strip()
                if requested_endpoint not in {"auto", "/v1/images/edits"}:
                    raise HTTPException(status_code=400, detail="遮罩只支持 GPT 图片编辑接口，请使用 auto 或 /v1/images/edits")
                mask_asset = await read_edit_mask_asset(mask_file, base_asset=reference_assets[0])
                normalized_mask_encoding = normalize_mask_encoding(mask_encoding)
                if mask_asset["dimensions"]["width"] * mask_asset["dimensions"]["height"] > MASK_GUIDANCE_MAX_PIXELS:
                    raise HTTPException(
                        status_code=400,
                        detail="遮罩引导最多支持约 829 万像素，请先缩小底图。",
                    )
                guided_base_raw = await asyncio.to_thread(
                    build_mask_guided_edit_png,
                    base_raw=reference_assets[0]["bytes"],
                    mask_raw=mask_asset["bytes"],
                    mask_encoding=normalized_mask_encoding,
                )
                guided_base_b64 = base64.b64encode(guided_base_raw).decode("ascii")
                guided_base_asset = {
                    **reference_assets[0],
                    "filename": "mask-guided-base.png",
                    "request_filename": "mask-guided-base.png",
                    "mime_type": "image/png",
                    "bytes": guided_base_raw,
                    "base64_data": guided_base_b64,
                    "data_url": data_url_from_base64(guided_base_b64, "image/png"),
                }
                request_reference_assets = [guided_base_asset, *reference_assets[1:]]
                if sum(len(asset["bytes"]) for asset in request_reference_assets) + len(mask_asset["bytes"]) > REFERENCE_REQUEST_MAX_BYTES:
                    raise HTTPException(status_code=413, detail="参考图和遮罩总大小超过 150 MiB 限制")
                resolved_endpoint = "/v1/images/edits"
            else:
                resolved_endpoint = normalize_gpt_endpoint(api_endpoint, bool(reference_assets))
            api_url = build_gpt_api_url(base_url, resolved_endpoint)
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if resolved_endpoint == "/v1/images/edits" and not reference_assets:
            raise HTTPException(
                status_code=400,
                detail="/v1/images/edits 需要至少上传一张参考图；请添加参考图，或把接口类型改为 auto/generations/responses。",
            )

        poster_text_clean = poster_text.strip()
        effective_prompt = merge_generation_context_prompt(prompt, context_prompt)
        if mask_asset is not None:
            effective_prompt = harden_mask_prompt(effective_prompt)
        if poster_text_clean:
            effective_prompt = (
                f"{effective_prompt}\n\n"
                "画面中必须清晰、可读、逐字准确地出现以下文字："
                f"{poster_text_clean}\n"
                "不要省略这些文字，不要改写这些文字，不要使用乱码、伪文字或无法辨认的装饰字。"
            )

        payload: Dict[str, Any] = {
            "model": model,
            "prompt": effective_prompt,
            "size": normalized_size,
            "n": n,
        }
        if response_format != "auto":
            payload["response_format"] = response_format
        if quality != "auto":
            payload["quality"] = quality

        if negative_prompt.strip():
            payload["negative_prompt"] = negative_prompt
        if seed != -1:
            payload["seed"] = seed
        if style_preset != "none":
            payload["style_preset"] = style_preset
        if mask_asset is not None or enhance_prompt is False:
            payload["enhance_prompt"] = False
        if safety_check is False:
            payload["safety_check"] = False

        image_data_urls = [asset["data_url"] for asset in request_reference_assets]
        headers = gpt_headers(api_key)
        request_kwargs: Dict[str, Any]
        files: List[Tuple[str, Tuple[str, bytes, str]]] = []

        if resolved_endpoint == "/v1/responses":
            prompt_text = effective_prompt
            if negative_prompt.strip():
                prompt_text = f"{effective_prompt}\n\nNegative prompt: {negative_prompt.strip()}"
            content: List[Dict[str, Any]] = [{"type": "input_text", "text": prompt_text}]
            for image_data_url in image_data_urls:
                content.append({"type": "input_image", "image_url": image_data_url})

            image_tool: Dict[str, Any] = {"type": "image_generation"}
            if normalized_size != "auto":
                image_tool["size"] = normalized_size
            if quality != "auto":
                image_tool["quality"] = quality
            if n > 1:
                content[0]["text"] = f"{content[0]['text']}\n\nPlease generate {n} separate image result(s)."

            payload = {
                "model": model,
                "input": [{"role": "user", "content": content}],
                "tools": [image_tool],
            }
            headers["Content-Type"] = "application/json"
            request_kwargs = {"json": payload}
        elif resolved_endpoint == "/v1/images/edits":
            files = [
                (
                    "image[]",
                    (
                        asset["request_filename"],
                        asset["bytes"],
                        asset["mime_type"],
                    ),
                )
                for asset in request_reference_assets
            ]
            if mask_asset is not None:
                files.append(
                    (
                        "mask",
                        (
                            mask_asset["request_filename"],
                            mask_asset["bytes"],
                            mask_asset["mime_type"],
                        ),
                    )
                )
            request_kwargs = {"data": payload, "files": files}
        else:
            headers["Content-Type"] = "application/json"
            if image_data_urls:
                payload["image"] = image_data_urls
            request_kwargs = {"json": payload}

        timeout_value = bounded_timeout(
            0 if infinite_timeout else timeout,
            default=300,
            maximum=MAX_GENERATION_TIMEOUT,
        )
        started_at = time.time()
        unknown_param_pattern = re.compile(
            r"(?:Unknown parameter|Unrecognized request argument)[^A-Za-z0-9_.]+([A-Za-z_][A-Za-z0-9_.]*)",
            re.IGNORECASE,
        )
        fallback_api_url = fallback_yuzapi_image_url(api_url)
        used_yuzapi_fallback = False

        async def post_gpt_payload(current_payload: Dict[str, Any], current_request_kwargs: Dict[str, Any]) -> Dict[str, Any]:
            nonlocal api_url, used_yuzapi_fallback
            response_data: Optional[Dict[str, Any]] = None
            retry_delay = 1.0
            retryable_count = 0
            for _ in range(max(8, len(current_payload) + 1)):
                try:
                    JOB_REGISTRY.raise_if_canceled(job_id)
                    response = await UPSTREAM_EXECUTOR.run(
                        "generation",
                        requests.post,
                        api_url,
                        before_start=lambda: JOB_REGISTRY.raise_if_canceled(job_id),
                        headers=headers,
                        timeout=timeout_value,
                        **current_request_kwargs,
                    )
                    JOB_REGISTRY.raise_if_canceled(job_id)
                except requests.Timeout as exc:
                    if fallback_api_url and not used_yuzapi_fallback:
                        JOB_REGISTRY.raise_if_canceled(job_id)
                        api_url = fallback_api_url
                        used_yuzapi_fallback = True
                        continue
                    raise client_http_error(
                        "E_UPSTREAM_TIMEOUT",
                        status_code=504,
                    ) from exc
                except requests.RequestException as exc:
                    if fallback_api_url and not used_yuzapi_fallback:
                        JOB_REGISTRY.raise_if_canceled(job_id)
                        api_url = fallback_api_url
                        used_yuzapi_fallback = True
                        continue
                    raise client_http_error(
                        "E_UPSTREAM_NETWORK",
                        status_code=502,
                    ) from exc

                if response.status_code == 400:
                    error_message = extract_upstream_control_message(response)
                    unknown_param = unknown_param_pattern.search(error_message)
                    if unknown_param:
                        parameter_name = unknown_param.group(1)
                        if parameter_name in current_payload:
                            current_payload.pop(parameter_name, None)
                            if "json" in current_request_kwargs:
                                current_request_kwargs["json"] = current_payload
                            if "data" in current_request_kwargs:
                                current_request_kwargs["data"] = current_payload
                            JOB_REGISTRY.raise_if_canceled(job_id)
                            continue
                    raise client_http_error(
                        "E_UPSTREAM_REQUEST",
                        status_code=400,
                    )

                if response.status_code in GPT_RETRYABLE_STATUSES and retryable_count < 2:
                    retryable_count += 1
                    JOB_REGISTRY.raise_if_canceled(job_id)
                    await asyncio.sleep(retry_delay)
                    JOB_REGISTRY.raise_if_canceled(job_id)
                    retry_delay = min(retry_delay * 1.5, 8.0)
                    continue

                if response.status_code >= 400:
                    public_status, error_code = upstream_error_classification(
                        response.status_code
                    )
                    raise client_http_error(
                        error_code,
                        status_code=public_status,
                    )

                try:
                    response_data = response_json_utf8_first(response)
                except Exception as exc:
                    raise client_http_error(
                        "E_UPSTREAM_RESPONSE",
                        status_code=502,
                    ) from exc
                if not isinstance(response_data, dict):
                    raise client_http_error(
                        "E_UPSTREAM_RESPONSE",
                        status_code=502,
                    )
                break

            if response_data is None:
                raise client_http_error(
                    "E_UPSTREAM_RESPONSE",
                    status_code=502,
                )
            return response_data

        result_budget = UpstreamImageBudget()
        try:
            response_data = await post_gpt_payload(payload, request_kwargs)
            response_payloads = [response_data]
            images = await build_gpt_images_from_response_async(
                response_data,
                job_id=job_id,
                max_images=n,
                budget=result_budget,
            )
            while resolved_endpoint != "/v1/responses" and 0 < len(images) < n:
                JOB_REGISTRY.raise_if_canceled(job_id)
                result_budget.ensure_image_slot()
                remaining = min(n - len(images), result_budget.remaining_images)
                next_payload = {**payload, "n": remaining}
                if resolved_endpoint == "/v1/images/edits":
                    next_request_kwargs = {"data": next_payload, "files": files}
                else:
                    next_request_kwargs = {"json": next_payload}
                next_response_data = await post_gpt_payload(next_payload, next_request_kwargs)
                next_images = await build_gpt_images_from_response_async(
                    next_response_data,
                    job_id=job_id,
                    max_images=remaining,
                    budget=result_budget,
                )
                if not next_images:
                    break
                response_payloads.append(next_response_data)
                images.extend(next_images)
        except UpstreamResultLimitError as exc:
            raise client_http_error(
                "E_UPSTREAM_RESPONSE",
                status_code=502,
                detail=UPSTREAM_RESULT_LIMIT_MESSAGE,
            ) from exc

        elapsed_seconds = round(time.time() - started_at, 2)
        history_entry: Optional[Dict[str, Any]] = None
        try:
            JOB_REGISTRY.raise_if_canceled(job_id)
            saved_count = await asyncio.to_thread(
                save_generated_images,
                "gpt-image-2",
                images,
                job_id=job_id,
            )
            JOB_REGISTRY.raise_if_canceled(job_id)
            total_tokens = sum(int((item.get("usage") or {}).get("total_tokens") or 0) for item in response_payloads)
            meta = {
                "model": model,
                "api_url": public_url_hint(api_url),
                "api_endpoint": resolved_endpoint,
                "size": normalized_size,
                "quality": quality,
                "n": n,
                "seed": response_data.get("seed", seed),
                "edit_mode": edit_mode,
                "style_preset": style_preset,
                "response_format": response_format,
                "reference_count": len(reference_assets),
                "mask_used": mask_asset is not None,
                "mask_encoding": normalized_mask_encoding if mask_asset is not None else "",
                "mask_guidance": "visual-alpha" if mask_asset is not None else "",
                "image_count": len(images),
                "saved_count": saved_count,
                "output_dir": "outputs",
                "elapsed_seconds": elapsed_seconds,
                "tokens_used": total_tokens,
                "estimated_cost": estimate_cost(total_tokens),
            }
            form_state = {
                "prompt": prompt,
                "context_prompt": compact_text(context_prompt.strip(), 1800),
                "negative_prompt": negative_prompt,
                "poster_text": poster_text_clean,
                "size": size,
                "custom_size": custom_size,
                "quality": quality,
                "n": n,
                "seed": seed,
                "style_preset": style_preset,
                "enhance_prompt": enhance_prompt,
                "safety_check": safety_check,
                "response_format": response_format,
                "api_endpoint": api_endpoint,
                "edit_mode": edit_mode,
                "reference_strength": reference_strength,
                "mask_used": mask_asset is not None,
                "mask_encoding": normalized_mask_encoding if mask_asset is not None else "",
                "mask_guidance": "visual-alpha" if mask_asset is not None else "",
                "timeout": timeout,
                "infinite_timeout": infinite_timeout,
            }
            JOB_REGISTRY.raise_if_canceled(job_id)
            history_entry = await asyncio.to_thread(
                append_generation_history,
                engine="gpt-image-2",
                prompt=prompt,
                negative_prompt=negative_prompt,
                form_state=form_state,
                meta=meta,
                messages=[],
                images=images,
            )
            JOB_REGISTRY.raise_if_canceled(job_id)
            if history_entry:
                meta["history_id"] = history_entry["id"]

            return {
                "ok": bool(images),
                "engine": "gpt-image-2",
                "images": images,
                "messages": [],
                "meta": meta,
                "history_entry": history_entry,
            }
        except JobCancelled:
            if history_entry:
                delete_history_entry(str(history_entry.get("id") or ""))
            cleanup_generated_image_files(images)
            raise

    return app


app = create_app()


def main() -> None:
    parser = argparse.ArgumentParser(description="Image Generate Web Tool")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7861)
    args = parser.parse_args()
    validate_bind_host(args.host)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
