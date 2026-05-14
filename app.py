import argparse
import asyncio
import base64
from datetime import datetime
import math
from html import unescape
import json
import mimetypes
import os
import random
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, urlparse

import requests
import uvicorn
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


ROOT_DIR = Path(__file__).resolve().parent
STATIC_DIR = ROOT_DIR / "static"
STUDIO_STATIC_DIR = STATIC_DIR / "studio"
OUTPUTS_DIR = ROOT_DIR / "outputs"
OUTPUTS_URL_PREFIX = "/outputs"
HISTORY_FILE = OUTPUTS_DIR / "history.json"
HISTORY_MAX_ENTRIES = 300
STUDIO_SESSIONS_FILE = OUTPUTS_DIR / "studio_sessions.json"
SESSION_REFS_DIR = OUTPUTS_DIR / "session_refs"
STUDIO_MAX_SESSIONS = 80
STUDIO_MAX_TURNS = 80
STUDIO_MAX_REFS_PER_TURN = 8
STUDIO_MAX_REF_FILES = 240
STUDIO_MAX_REF_BYTES = 256 * 1024 * 1024
CONFIG_FILE_CANDIDATES = [
    ROOT_DIR / "config.local.json",
    ROOT_DIR / "config.defaults.json",
]
PRIMARY_CONFIG_FILE = ROOT_DIR / "config.local.json"

DEFAULT_BANANA_BASE_URL = "https://banana-api.example.com"
DEFAULT_BANANA_MODEL = "gemini-3-pro-image-preview"
DEFAULT_GPT_BASE_URL = "https://gpt-image-api.example.com"
DEFAULT_GPT_MODEL = "gpt-image-2"
DEFAULT_GPT_CHAT_MODEL = "gpt-5.4"
GPT_REASONING_EFFORTS = {"auto", "none", "minimal", "low", "medium", "high", "xhigh"}
CONFIG_CONNECTION_FIELDS = {
    "banana-form": {"api_key", "api_base_url", "model_type"},
    "gpt-image-2-form": {"api_key", "base_url", "model", "chat_model", "reasoning_effort"},
}
LOCAL_CORS_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"
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


def compact_text(value: str, limit: int = 600) -> str:
    text = re.sub(r"\s+", " ", value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}..."


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


def guess_extension(mime_type: str) -> str:
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


def extract_error_message(response: requests.Response) -> str:
    if response.status_code in UPSTREAM_TIMEOUT_STATUSES:
        return (
            f"上游接口返回 {response.status_code}: 上游网关超时。"
            "这通常是模型排队、服务繁忙或图片生成耗时过长导致的；可以稍后重试，"
            "或调低质量、尺寸、数量后再试。"
        )

    try:
        payload = response.json()
    except Exception:
        raw_text = response.text or "未知错误"
        if raw_text.lstrip().startswith("<"):
            message = html_error_to_text(raw_text)
        else:
            message = compact_text(raw_text)
        return compact_text(f"上游接口返回 {response.status_code}: {message}")

    if isinstance(payload, dict):
        error_obj = payload.get("error")
        if isinstance(error_obj, dict):
            message = str(error_obj.get("message") or "").strip()
            if message:
                return message[:400]
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()[:400]

    return (response.text or "未知错误").strip()[:400]


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


def pick_env_value(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


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

    return {
        "active_engine": file_payload.get("active_engine", "banana")
        if isinstance(file_payload, dict)
        else "banana",
        "forms": defaults,
        "sources": sources,
    }


def normalize_config_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("配置内容必须是 JSON 对象")

    forms = payload.get("forms")
    if not isinstance(forms, dict):
        raise ValueError("配置内容缺少 forms 字段")

    normalized_forms: Dict[str, Dict[str, Any]] = {}
    for form_id in ("banana-form", "gpt-image-2-form"):
        value = forms.get(form_id, {})
        if not isinstance(value, dict):
            normalized_forms[form_id] = {}
            continue
        allowed_fields = CONFIG_CONNECTION_FIELDS[form_id]
        normalized_forms[form_id] = {
            key: str(value.get(key) or "").strip()
            for key in allowed_fields
            if str(value.get(key) or "").strip()
        }

    active_engine = str(payload.get("active_engine") or "banana").strip()
    if active_engine not in {"banana", "gpt-image-2"}:
        active_engine = "banana"

    return {
        "version": 1,
        "active_engine": active_engine,
        "forms": normalized_forms,
    }


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
    relative = source[len(OUTPUTS_URL_PREFIX):].lstrip("/")
    candidate = (OUTPUTS_DIR / relative).resolve()
    try:
        candidate.relative_to(OUTPUTS_DIR.resolve())
    except ValueError:
        return None
    return candidate


def extract_image_bytes(src: str, fallback_mime_type: str = "image/png") -> Optional[Tuple[bytes, str]]:
    source = str(src or "").strip()
    if not source:
        return None

    if source.startswith("data:"):
        match = re.match(r"^data:(image/[^;]+);base64,(.+)$", source, re.IGNORECASE | re.DOTALL)
        if not match:
            return None
        raw_bytes = base64.b64decode(match.group(2), validate=False)
        mime_type = detect_image_mime_type(raw_bytes, match.group(1) or fallback_mime_type)
        return raw_bytes, mime_type

    if source.startswith(("http://", "https://")):
        try:
            response = requests.get(
                source,
                timeout=(15, 45),
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "image/*,*/*;q=0.8",
                },
            )
            response.raise_for_status()
        except Exception:
            return None

        content_type = response.headers.get("Content-Type", fallback_mime_type).split(";", 1)[0].strip()
        mime_type = detect_image_mime_type(response.content, content_type or fallback_mime_type)
        if not mime_type.startswith("image/"):
            return None
        return response.content, mime_type

    return None


def save_generated_images(engine: str, images: List[Dict[str, str]]) -> int:
    if not images:
        return 0

    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    engine_name = safe_filename_part(engine, "engine")
    saved_count = 0

    for index, image in enumerate(images, start=1):
        try:
            extracted = extract_image_bytes(image.get("src", ""), image.get("mime_type", "image/png"))
            if not extracted:
                image["save_status"] = "skipped"
                continue

            raw_bytes, mime_type = extracted
            filename = f"{run_id}-{engine_name}-{index:02d}{guess_extension(mime_type)}"
            output_path = OUTPUTS_DIR / filename
            output_path.write_bytes(raw_bytes)
            dimensions = detect_image_dimensions(raw_bytes, mime_type)

            image["mime_type"] = mime_type
            image["saved_name"] = filename
            image["saved_path"] = str(output_path.relative_to(ROOT_DIR)).replace("\\", "/")
            image["saved_url"] = f"{OUTPUTS_URL_PREFIX}/{quote(filename)}"
            image["save_status"] = "saved"
            if dimensions:
                image["dimensions"] = dimensions
            saved_count += 1
        except Exception as exc:
            image["save_status"] = "failed"
            image["save_error"] = compact_text(str(exc), 220)

    return saved_count


def public_url_hint(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        parsed = urlparse(text)
        host = parsed.netloc or text
        path = parsed.path if parsed.path and parsed.path != "/" else ""
        return f"{host}{path}"
    except Exception:
        return re.sub(r"^https?://", "", text, flags=re.IGNORECASE)


def read_history_entries() -> List[Dict[str, Any]]:
    if not HISTORY_FILE.exists():
        return []
    try:
        payload = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    if isinstance(payload, dict):
        entries = payload.get("entries", [])
    else:
        entries = payload
    return [entry for entry in entries if isinstance(entry, dict)]


def write_history_entries(entries: List[Dict[str, Any]]) -> None:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "entries": entries[:HISTORY_MAX_ENTRIES],
    }
    temp_path = HISTORY_FILE.with_suffix(".tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(HISTORY_FILE)


def read_studio_session_state() -> Dict[str, Any]:
    if not STUDIO_SESSIONS_FILE.exists():
        return {"version": 1, "sessions": [], "active_session_id": ""}
    try:
        payload = json.loads(STUDIO_SESSIONS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"version": 1, "sessions": [], "active_session_id": ""}
    if not isinstance(payload, dict):
        return {"version": 1, "sessions": [], "active_session_id": ""}
    sessions = payload.get("sessions")
    return {
        "version": int(payload.get("version") or 1),
        "updated_at": payload.get("updated_at"),
        "active_session_id": str(payload.get("active_session_id") or ""),
        "sessions": sessions if isinstance(sessions, list) else [],
    }


def normalize_studio_reference(snapshot: Any, session_id: str, turn_id: str, index: int) -> Optional[Dict[str, Any]]:
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
        existing_path = path_from_output_url(src)
        if existing_path and existing_path.is_file():
            normalized["src"] = src
            return normalized

        extracted = extract_image_bytes(src, normalized["mime_type"])
        if extracted:
            raw_bytes, detected_mime_type = extracted
            extension = guess_extension(detected_mime_type)
            filename = (
                f"{safe_filename_part(session_id, 'session')}-"
                f"{safe_filename_part(turn_id, 'turn')}-"
                f"{index + 1:02d}-{safe_filename_part(name, 'reference')}{extension}"
            )
            SESSION_REFS_DIR.mkdir(parents=True, exist_ok=True)
            target_path = SESSION_REFS_DIR / filename
            target_path.write_bytes(raw_bytes)
            normalized["src"] = output_url_for_path(target_path)
            normalized["mime_type"] = detected_mime_type
            normalized["size"] = len(raw_bytes)
            dimensions = detect_image_dimensions(raw_bytes, detected_mime_type)
            if dimensions:
                normalized["dimensions"] = dimensions
    return normalized


def compact_studio_turn(turn: Any, session_id: str) -> Optional[Dict[str, Any]]:
    if not isinstance(turn, dict):
        return None
    now = datetime.now().isoformat(timespec="seconds")
    turn_id = str(turn.get("id") or f"turn-{int(time.time() * 1000)}").strip()
    compact: Dict[str, Any] = {
        "id": turn_id,
        "engine": str(turn.get("engine") or "gpt-image-2"),
        "mode": str(turn.get("mode") or "generate"),
        "prompt": str(turn.get("prompt") or ""),
        "createdAt": str(turn.get("createdAt") or now),
        "status": str(turn.get("status") or "success"),
        "images": [image for image in turn.get("images", []) if isinstance(image, dict)][:20],
    }
    for key in ("negativePrompt", "posterText", "finishedAt", "reply", "error"):
        value = turn.get(key)
        if isinstance(value, str) and value:
            compact[key] = value
    if isinstance(turn.get("elapsedSeconds"), (int, float)):
        compact["elapsedSeconds"] = turn["elapsedSeconds"]
    if isinstance(turn.get("meta"), dict):
        compact["meta"] = sanitize_history_meta(turn["meta"])

    snapshots = turn.get("referenceSnapshots")
    if isinstance(snapshots, list):
        refs = [
            normalized
            for index, snapshot in enumerate(snapshots[:STUDIO_MAX_REFS_PER_TURN])
            if (normalized := normalize_studio_reference(snapshot, session_id, turn_id, index))
        ]
        if refs:
            compact["referenceSnapshots"] = refs
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


def compact_studio_session(session: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(session, dict):
        return None
    now = datetime.now().isoformat(timespec="seconds")
    session_id = str(session.get("id") or f"session-{int(time.time() * 1000)}").strip()
    raw_turns = session.get("turns") if isinstance(session.get("turns"), list) else []
    turns = [
        compact_turn
        for turn in raw_turns[-STUDIO_MAX_TURNS:]
        if (compact_turn := compact_studio_turn(turn, session_id))
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
                "fixed_prompt": str(shared_draft.get("fixed_prompt") or ""),
            }
        gpt_draft = drafts.get("gpt")
        if isinstance(gpt_draft, dict):
            compact_gpt = {
                "prompt": str(gpt_draft.get("prompt") or ""),
                "negative_prompt": str(gpt_draft.get("negative_prompt") or ""),
                "poster_text": str(gpt_draft.get("poster_text") or ""),
            }
            compact_drafts["gpt"] = compact_gpt
        banana_draft = drafts.get("banana")
        if isinstance(banana_draft, dict):
            compact_drafts["banana"] = {
                "prompt": str(banana_draft.get("prompt") or ""),
            }
        if compact_drafts:
            compact_session["drafts"] = compact_drafts
    return compact_session


def collect_referenced_output_paths(sessions: List[Dict[str, Any]]) -> set[Path]:
    paths: set[Path] = set()
    for session in sessions:
        for turn in session.get("turns", []):
            refs = turn.get("referenceSnapshots", [])
            if not isinstance(refs, list):
                continue
            for ref in refs:
                if not isinstance(ref, dict):
                    continue
                path = path_from_output_url(str(ref.get("src") or ""))
                if path:
                    paths.add(path.resolve())
    return paths


def prune_session_reference_files(sessions: List[Dict[str, Any]]) -> None:
    if not SESSION_REFS_DIR.exists():
        return
    referenced = collect_referenced_output_paths(sessions)
    files = [path for path in SESSION_REFS_DIR.iterdir() if path.is_file()]
    for path in files:
        if path.resolve() not in referenced:
            try:
                path.unlink()
            except OSError:
                pass

    remaining = sorted(
        [path for path in SESSION_REFS_DIR.iterdir() if path.is_file()],
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    total = 0
    for index, path in enumerate(remaining):
        try:
            size = path.stat().st_size
        except OSError:
            continue
        total += size
        if index >= STUDIO_MAX_REF_FILES or total > STUDIO_MAX_REF_BYTES:
            try:
                path.unlink()
            except OSError:
                pass


def normalize_studio_session_state(payload: Dict[str, Any]) -> Dict[str, Any]:
    sessions_value = payload.get("sessions") if isinstance(payload, dict) else []
    sessions = [
        compact_session
        for session in (sessions_value if isinstance(sessions_value, list) else [])
        if (compact_session := compact_studio_session(session))
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
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    normalized = normalize_studio_session_state(payload)
    prune_session_reference_files(normalized["sessions"])
    temp_path = STUDIO_SESSIONS_FILE.with_suffix(".tmp")
    temp_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(STUDIO_SESSIONS_FILE)
    return normalized


def normalize_history_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(entry)
    normalized["favorite"] = bool(normalized.get("favorite", False))
    return normalized


def update_history_entry(entry_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target_id = str(entry_id or "").strip()
    if not target_id:
        return None

    entries = read_history_entries()
    updated_entry: Optional[Dict[str, Any]] = None
    next_entries: List[Dict[str, Any]] = []
    allowed_keys = {"favorite"}
    clean_updates = {key: updates[key] for key in allowed_keys if key in updates}
    for entry in entries:
        if str(entry.get("id") or "") == target_id:
            entry = dict(entry)
            if "favorite" in clean_updates:
                entry["favorite"] = bool(clean_updates["favorite"])
            updated_entry = entry
        next_entries.append(entry)

    if updated_entry is None:
        return None

    write_history_entries(next_entries)
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


def delete_history_entry(entry_id: str, *, delete_files: bool = False, legacy_path: str = "") -> Tuple[bool, List[str]]:
    target_id = str(entry_id or "").strip()
    if not target_id:
        return False, []

    if target_id.startswith("legacy-") and delete_files:
        stem = target_id.removeprefix("legacy-")
        deleted_files: List[str] = []
        legacy_candidates: List[Path] = []
        if legacy_path:
            legacy_candidates.append(ROOT_DIR / legacy_path)
        for path in OUTPUTS_DIR.iterdir() if OUTPUTS_DIR.exists() else []:
            if path.is_file() and path.stem == stem:
                legacy_candidates.append(path)
        for path in legacy_candidates:
            try:
                resolved = path.resolve()
                outputs_root = OUTPUTS_DIR.resolve()
                if not resolved.is_file() or outputs_root not in resolved.parents:
                    continue
                resolved.unlink()
                deleted_files.append(str(resolved.relative_to(ROOT_DIR)).replace("\\", "/"))
            except Exception:
                continue
        return bool(deleted_files), deleted_files

    entries = read_history_entries()
    removed_entries = [entry for entry in entries if str(entry.get("id") or "") == target_id]
    next_entries = [entry for entry in entries if str(entry.get("id") or "") != target_id]
    if not removed_entries:
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
                    deleted_files.append(str(path.relative_to(ROOT_DIR)).replace("\\", "/"))
                except Exception:
                    continue

    write_history_entries(next_entries)
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


def sanitize_history_meta(meta: Dict[str, Any]) -> Dict[str, Any]:
    sanitized: Dict[str, Any] = {}
    for key, value in (meta or {}).items():
        if key in {"api_base_url", "api_url"}:
            sanitized[f"{key}_host"] = public_url_hint(str(value))
            continue
        sanitized[key] = value
    return sanitized


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
        "id": f"{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}-{safe_filename_part(engine, 'engine')}",
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
    entries = read_history_entries()
    write_history_entries([entry, *entries])
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
                "id": f"legacy-{path.stem}",
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
                        "saved_path": str(path.relative_to(ROOT_DIR)).replace("\\", "/"),
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


def download_remote_image(url: str) -> Optional[Dict[str, str]]:
    try:
        response = requests.get(
            url,
            timeout=(15, 30),
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "image/*,*/*;q=0.8",
            },
        )
        response.raise_for_status()
        mime_type = (
            response.headers.get("Content-Type", "image/png").split(";", 1)[0].strip()
            or "image/png"
        )
        if not mime_type.startswith("image/"):
            detected_mime_type = detect_image_mime_type(response.content, fallback="")
            if not detected_mime_type.startswith("image/"):
                return None
            mime_type = detected_mime_type
        payload = base64.b64encode(response.content).decode("utf-8")
        return {
            "src": data_url_from_base64(payload, mime_type),
            "mime_type": mime_type,
            "source": "downloaded-url",
        }
    except Exception:
        return None


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


def extract_banana_images(response_data: Dict[str, Any]) -> Dict[str, Any]:
    images: List[Dict[str, str]] = []
    messages: List[str] = []
    pending_urls: List[str] = []

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
                if isinstance(base64_data, str) and base64_data.strip():
                    images.append(
                        {
                            "src": data_url_from_base64(base64_data, mime_type),
                            "mime_type": mime_type,
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
                if isinstance(file_uri, str) and is_image_url(file_uri):
                    pending_urls.append(file_uri)
                    continue

            text_value = part.get("text")
            if isinstance(text_value, str) and text_value.strip():
                text_content = text_value.strip()
                markdown_matches = MARKDOWN_BASE64_IMAGE_PATTERN.findall(text_content)
                if markdown_matches:
                    for mime_type, base64_data in markdown_matches:
                        images.append(
                            {
                                "src": data_url_from_base64(base64_data, mime_type),
                                "mime_type": mime_type,
                                "source": "markdown-base64",
                            }
                        )
                    text_content = MARKDOWN_BASE64_IMAGE_PATTERN.sub("", text_content).strip()

                if not text_content:
                    continue

                if is_image_url(text_content):
                    pending_urls.append(text_content)
                    continue

                found_urls = extract_image_urls_from_text(text_content)
                if found_urls:
                    pending_urls.extend(found_urls)
                    for found_url in found_urls:
                        text_content = text_content.replace(found_url, "").strip()

                if text_content:
                    messages.append(text_content)

            image_url = part.get("image_url") or part.get("imageUrl") or part.get("url")
            if isinstance(image_url, str) and is_image_url(image_url):
                pending_urls.append(image_url)

    for image_url in pending_urls:
        downloaded = download_remote_image(image_url)
        if downloaded:
            images.append(downloaded)
        else:
            images.append(
                {
                    "src": image_url,
                    "mime_type": "image/*",
                    "source": "remote-url",
                }
            )

    return {
        "images": images,
        "messages": [message for message in messages if message],
    }


async def read_upload_assets(
    files: Optional[List[UploadFile]],
    limit: int,
) -> List[Dict[str, Any]]:
    uploads = files or []
    if len(uploads) > limit:
        raise HTTPException(status_code=400, detail=f"参考图最多支持 {limit} 张")

    assets: List[Dict[str, Any]] = []
    for index, upload in enumerate(uploads, start=1):
        raw_bytes = await upload.read()
        if not raw_bytes:
            continue
        mime_type = (
            upload.content_type
            or mimetypes.guess_type(upload.filename or "")[0]
            or "image/png"
        )
        if not mime_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="上传的参考文件必须是图片")
        mime_type = detect_image_mime_type(raw_bytes, mime_type)
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


def try_download_or_keep_url(url: str) -> Dict[str, str]:
    downloaded = download_remote_image(url)
    if downloaded:
        return downloaded
    return {
        "src": url,
        "mime_type": "image/*",
        "source": "remote-url",
    }


def extract_gpt_image_values(payload: Dict[str, Any]) -> List[str]:
    """Collect image values from Images API and Responses API style payloads."""
    values: List[str] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key in ("b64_json", "url", "image_url", "result"):
                item = value.get(key)
                if isinstance(item, str):
                    stripped = item.strip()
                    if (
                        (key in {"b64_json", "result"} and stripped)
                        or
                        stripped.startswith("data:image")
                        or stripped.startswith("http://")
                        or stripped.startswith("https://")
                        or len(stripped) > 200
                    ):
                        values.append(stripped)
            for child in value.values():
                visit(child)
            return

        if isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)

    unique: List[str] = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        unique.append(value)
        seen.add(value)
    return unique


def normalize_plain_base64_image(value: str) -> Optional[Tuple[str, str]]:
    cleaned = re.sub(r"\s+", "", value or "")
    if not cleaned:
        return None
    cleaned += "=" * ((-len(cleaned)) % 4)
    try:
        raw_bytes = base64.b64decode(cleaned, validate=False)
    except Exception:
        return None
    mime_type = detect_image_mime_type(raw_bytes, "")
    if not mime_type.startswith("image/"):
        return None
    encoded = base64.b64encode(raw_bytes).decode("utf-8")
    return data_url_from_base64(encoded, mime_type), mime_type


def build_gpt_images_from_response(response_data: Dict[str, Any]) -> List[Dict[str, str]]:
    images: List[Dict[str, str]] = []
    for index, image_value in enumerate(extract_gpt_image_values(response_data), start=1):
        if image_value.startswith(("http://", "https://")):
            kept = try_download_or_keep_url(image_value)
            kept["name"] = f"gpt-image-2-{index:02d}{guess_extension(kept['mime_type'])}"
            images.append(kept)
            continue

        if image_value.startswith("data:image"):
            mime_match = re.match(r"data:(image/[^;]+);base64,", image_value)
            mime_type = mime_match.group(1) if mime_match else "image/png"
            images.append(
                {
                    "src": image_value,
                    "mime_type": mime_type,
                    "source": "data-url",
                    "name": f"gpt-image-2-{index:02d}{guess_extension(mime_type)}",
                }
            )
            continue

        normalized_base64 = normalize_plain_base64_image(image_value)
        if not normalized_base64:
            continue
        image_src, mime_type = normalized_base64
        images.append(
            {
                "src": image_src,
                "mime_type": mime_type,
                "source": "b64_json",
                "name": f"gpt-image-2-{index:02d}{guess_extension(mime_type)}",
            }
        )
    return images


def create_app() -> FastAPI:
    app = FastAPI(title="Image Generate Web Tool", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_origin_regex=LOCAL_CORS_ORIGIN_REGEX,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount(OUTPUTS_URL_PREFIX, StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")

    @app.exception_handler(Exception)
    async def handle_unexpected_exception(_request: Request, exc: Exception) -> JSONResponse:
        message = compact_text(str(exc), 360) or "没有返回具体错误"
        return JSONResponse(
            status_code=500,
            content={"detail": f"后端内部错误：{exc.__class__.__name__} - {message}"},
        )

    @app.get("/")
    async def index() -> FileResponse:
        studio_index = STUDIO_STATIC_DIR / "index.html"
        if studio_index.exists():
            return FileResponse(studio_index)
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/classic")
    async def classic_index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/api/health")
    async def health() -> Dict[str, Any]:
        return {
            "ok": True,
            "app": "image-generate-web-tool",
            "engines": ["banana", "gpt-image-2"],
            "features": {"studio_sessions": True, "session_reference_files": True},
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

        PRIMARY_CONFIG_FILE.write_text(
            json.dumps(normalized, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return {
            "ok": True,
            "path": str(PRIMARY_CONFIG_FILE.relative_to(ROOT_DIR)).replace("\\", "/"),
        }

    @app.get("/api/history")
    async def generation_history(limit: int = 120) -> Dict[str, Any]:
        return {
            "ok": True,
            "path": str(HISTORY_FILE.relative_to(ROOT_DIR)).replace("\\", "/"),
            "entries": get_history_payload(limit),
        }

    @app.get("/api/studio/sessions")
    async def studio_sessions() -> Dict[str, Any]:
        state = read_studio_session_state()
        return {
            "ok": True,
            "path": str(STUDIO_SESSIONS_FILE.relative_to(ROOT_DIR)).replace("\\", "/"),
            **state,
        }

    @app.put("/api/studio/sessions")
    async def write_studio_sessions(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
        state = write_studio_session_state(payload)
        return {
            "ok": True,
            "path": str(STUDIO_SESSIONS_FILE.relative_to(ROOT_DIR)).replace("\\", "/"),
            "reference_dir": str(SESSION_REFS_DIR.relative_to(ROOT_DIR)).replace("\\", "/"),
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
            "path": str(HISTORY_FILE.relative_to(ROOT_DIR)).replace("\\", "/"),
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
            "path": str(HISTORY_FILE.relative_to(ROOT_DIR)).replace("\\", "/"),
            "entries": get_history_payload(limit),
        }

    @app.post("/api/open-outputs")
    async def open_outputs_folder() -> Dict[str, Any]:
        try:
            open_local_directory(OUTPUTS_DIR)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"打开 outputs 文件夹失败：{exc}") from exc

        return {
            "ok": True,
            "path": str(OUTPUTS_DIR.relative_to(ROOT_DIR)).replace("\\", "/"),
        }

    @app.post("/api/chat/gpt-image-2")
    async def chat_gpt_image_2(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
        prompt = str(payload.get("prompt") or "").strip()
        api_key = str(payload.get("api_key") or "").strip()
        base_url = str(payload.get("base_url") or DEFAULT_GPT_BASE_URL).strip()
        model = str(payload.get("chat_model") or payload.get("model") or DEFAULT_GPT_CHAT_MODEL).strip()
        reasoning_effort = str(payload.get("reasoning_effort") or "auto").strip().lower()
        timeout = int(payload.get("timeout") or 120)
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
            response = requests.post(
                api_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json=chat_payload,
                timeout=max(10, timeout),
            )
        except requests.Timeout as exc:
            raise HTTPException(status_code=504, detail="聊天请求超时：上游接口长时间没有返回。") from exc
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"聊天网络请求失败：{type(exc).__name__} {compact_text(str(exc), 220)}") from exc

        if not response.ok:
            raise HTTPException(status_code=response.status_code, detail=extract_error_message(response))

        response_data = response.json()
        reply = extract_openai_chat_reply(response_data)
        if not reply:
            raise HTTPException(status_code=502, detail="聊天接口没有返回可读文本")

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
    async def chat_banana(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
        prompt = str(payload.get("prompt") or "").strip()
        api_key = str(payload.get("api_key") or "").strip()
        api_base_url = str(payload.get("api_base_url") or DEFAULT_BANANA_BASE_URL).strip()
        model_type = str(payload.get("model_type") or DEFAULT_BANANA_MODEL).strip()
        top_p = float(payload.get("top_p") or 0.95)
        timeout_seconds = int(payload.get("timeout_seconds") or 60)
        bypass_proxy = bool(payload.get("bypass_proxy") or False)
        disable_ssl = bool(payload.get("disable_ssl") or False)
        if not api_key:
            raise HTTPException(status_code=400, detail="请填写 Banana API Key")
        if not prompt:
            raise HTTPException(status_code=400, detail="请先输入聊天内容")

        api_url = build_banana_api_url(api_base_url, model_type)
        started_at = time.time()
        session = create_requests_session(bypass_proxy=bypass_proxy)
        read_timeout = None if timeout_seconds <= 0 else max(10, timeout_seconds)
        try:
            response = session.post(
                api_url,
                json={
                    "contents": build_banana_chat_contents(prompt, payload.get("messages")),
                    "generationConfig": {
                        "topP": top_p,
                        "responseModalities": ["TEXT"],
                    },
                },
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "X-API-Key": api_key,
                    "X-Banana-Client": "image-generate-web-tool",
                },
                timeout=(15, read_timeout),
                verify=not disable_ssl,
            )
        except requests.Timeout as exc:
            raise HTTPException(status_code=504, detail="聊天请求超时：上游接口长时间没有返回。") from exc
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"聊天网络请求失败：{type(exc).__name__} {compact_text(str(exc), 220)}") from exc

        if not response.ok:
            raise HTTPException(status_code=response.status_code, detail=extract_error_message(response))

        response_data = response.json()
        reply = extract_banana_text_reply(response_data)
        if not reply:
            raise HTTPException(status_code=502, detail="聊天接口没有返回可读文本")

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
    ) -> Dict[str, Any]:
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
        seeds: List[int] = []
        session = create_requests_session(bypass_proxy=bypass_proxy)

        for index in range(batch_size):
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
            read_timeout = None if infinite_timeout or timeout_seconds <= 0 else max(60, timeout_seconds)
            timeout = (15, read_timeout)

            try:
                response = session.post(
                    api_url,
                    data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key.strip()}",
                        "X-API-Key": api_key.strip(),
                        "X-Banana-Client": "image-generate-web-tool",
                    },
                    timeout=timeout,
                    verify=not disable_ssl,
                )
                if response.status_code >= 400:
                    detail = extract_error_message(response)
                    messages.append(f"第 {index + 1} 批请求失败: {detail}")
                    continue

                parsed = extract_banana_images(response.json())
                batch_images = parsed["images"]
                batch_messages = parsed["messages"]
                if batch_images:
                    for image_index, image in enumerate(batch_images, start=1):
                        image["name"] = f"banana-{index + 1:02d}-{image_index:02d}{guess_extension(image['mime_type'])}"
                    generated_images.extend(batch_images)
                else:
                    messages.append(f"第 {index + 1} 批未返回图片")

                for message in batch_messages:
                    messages.append(f"第 {index + 1} 批: {message}")
            except requests.RequestException as exc:
                messages.append(f"第 {index + 1} 批网络异常: {type(exc).__name__} {exc}")
            except Exception as exc:
                messages.append(f"第 {index + 1} 批处理失败: {exc}")

        elapsed_seconds = round(time.time() - started_at, 2)
        saved_count = save_generated_images("banana", generated_images)
        meta = {
            "model_type": model_type,
            "api_base_url": api_base_url,
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
        history_entry = append_generation_history(
            engine="banana",
            prompt=prompt,
            form_state=form_state,
            meta=meta,
            messages=messages,
            images=generated_images,
        )
        if history_entry:
            meta["history_id"] = history_entry["id"]
        return {
            "ok": bool(generated_images),
            "engine": "banana",
            "images": generated_images,
            "messages": messages,
            "meta": meta,
            "history_entry": history_entry,
        }

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
    ) -> Dict[str, Any]:
        if not api_key.strip():
            raise HTTPException(status_code=400, detail="请填写 GPT Image 2 API Key")
        if not prompt.strip():
            raise HTTPException(status_code=400, detail="请填写提示词")
        if n < 1 or n > 10:
            raise HTTPException(status_code=400, detail="GPT Image 2 的数量只能是 1 到 10")

        try:
            reference_assets = await read_upload_assets(reference_files, limit=16)
            normalized_size = normalize_gpt_size(custom_size if size == "custom" else size)
            resolved_endpoint = normalize_gpt_endpoint(api_endpoint, bool(reference_assets))
            api_url = build_gpt_api_url(base_url, resolved_endpoint)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if resolved_endpoint == "/v1/images/edits" and not reference_assets:
            raise HTTPException(
                status_code=400,
                detail="/v1/images/edits 需要至少上传一张参考图；请添加参考图，或把接口类型改为 auto/generations/responses。",
            )

        poster_text_clean = poster_text.strip()
        effective_prompt = merge_generation_context_prompt(prompt, context_prompt)
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
        if enhance_prompt is False:
            payload["enhance_prompt"] = False
        if safety_check is False:
            payload["safety_check"] = False

        image_data_urls = [asset["data_url"] for asset in reference_assets]
        headers: Dict[str, str] = {
            "Authorization": f"Bearer {api_key.strip()}",
            "Accept": "*/*",
        }
        request_kwargs: Dict[str, Any]

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
                for asset in reference_assets
            ]
            request_kwargs = {"data": payload, "files": files}
        else:
            headers["Content-Type"] = "application/json"
            if image_data_urls:
                payload["image"] = image_data_urls
            request_kwargs = {"json": payload}

        timeout_value = None if infinite_timeout else timeout
        started_at = time.time()
        response_data: Optional[Dict[str, Any]] = None
        unknown_param_pattern = re.compile(
            r"(?:Unknown parameter|Unrecognized request argument)[^A-Za-z0-9_.]+([A-Za-z_][A-Za-z0-9_.]*)",
            re.IGNORECASE,
        )
        retry_delay = 1.0
        retryable_count = 0
        fallback_api_url = fallback_yuzapi_image_url(api_url)
        used_yuzapi_fallback = False

        for _ in range(max(8, len(payload) + 1)):
            try:
                response = await asyncio.to_thread(
                    requests.post,
                    api_url,
                    headers=headers,
                    timeout=None if timeout_value is None else timeout_value,
                    **request_kwargs,
                )
            except requests.Timeout as exc:
                if fallback_api_url and not used_yuzapi_fallback:
                    api_url = fallback_api_url
                    used_yuzapi_fallback = True
                    continue
                raise HTTPException(
                    status_code=504,
                    detail="GPT Image 2 请求超时：上游接口长时间没有返回。可以稍后重试，或调低质量/尺寸/数量。",
                ) from exc
            except requests.RequestException as exc:
                if fallback_api_url and not used_yuzapi_fallback:
                    api_url = fallback_api_url
                    used_yuzapi_fallback = True
                    continue
                raise HTTPException(
                    status_code=502,
                    detail=f"GPT Image 2 网络请求失败：{type(exc).__name__} {compact_text(str(exc), 220)}",
                ) from exc

            if response.status_code == 400:
                try:
                    error_payload = response.json()
                except Exception:
                    error_payload = {}
                error_message = (
                    error_payload.get("error", {}).get("message")
                    if isinstance(error_payload, dict)
                    else None
                ) or extract_error_message(response)
                unknown_param = unknown_param_pattern.search(error_message or "")
                if unknown_param:
                    parameter_name = unknown_param.group(1)
                    if parameter_name in payload:
                        payload.pop(parameter_name, None)
                        if "json" in request_kwargs:
                            request_kwargs["json"] = payload
                        if "data" in request_kwargs:
                            request_kwargs["data"] = payload
                        continue
                raise HTTPException(status_code=400, detail=f"GPT Image 2 请求失败: {error_message}")

            if response.status_code in GPT_RETRYABLE_STATUSES and retryable_count < 2:
                retryable_count += 1
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 8.0)
                continue

            if response.status_code >= 400:
                status_code = 504 if response.status_code == 504 else 502
                failed_detail = extract_error_message(response)
                raise HTTPException(
                    status_code=status_code,
                    detail=f"GPT Image 2 请求失败: {failed_detail}",
                )

            try:
                response_data = response.json()
            except ValueError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"GPT Image 2 返回不是 JSON: {extract_error_message(response)}",
                ) from exc
            break

        if response_data is None:
            raise HTTPException(status_code=502, detail="GPT Image 2 请求失败，未获得有效响应")

        images = build_gpt_images_from_response(response_data)

        elapsed_seconds = round(time.time() - started_at, 2)
        saved_count = save_generated_images("gpt-image-2", images)
        usage = response_data.get("usage") or {}
        total_tokens = int(usage.get("total_tokens") or 0)
        meta = {
            "model": model,
            "api_url": api_url,
            "api_endpoint": resolved_endpoint,
            "size": normalized_size,
            "quality": quality,
            "n": n,
            "seed": response_data.get("seed", seed),
            "edit_mode": edit_mode,
            "style_preset": style_preset,
            "response_format": response_format,
            "reference_count": len(reference_assets),
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
            "timeout": timeout,
            "infinite_timeout": infinite_timeout,
        }
        history_entry = append_generation_history(
            engine="gpt-image-2",
            prompt=prompt,
            negative_prompt=negative_prompt,
            form_state=form_state,
            meta=meta,
            messages=[],
            images=images,
        )
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

    return app


app = create_app()


def main() -> None:
    parser = argparse.ArgumentParser(description="Image Generate Web Tool")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7861)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
