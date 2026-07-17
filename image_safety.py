from __future__ import annotations

import base64
import binascii
import re
from pathlib import Path
from typing import Iterable


REFERENCE_IMAGE_MAX_BYTES = 25 * 1024 * 1024
REFERENCE_REQUEST_MAX_BYTES = 150 * 1024 * 1024
REMOTE_RESULT_MAX_BYTES = 50 * 1024 * 1024
ALLOWED_RASTER_MIMES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}
_RASTER_MIME_BY_EXTENSION = {
    extension: mime_type
    for mime_type, extension in ALLOWED_RASTER_MIMES.items()
}
_RASTER_MIME_BY_EXTENSION[".jpeg"] = "image/jpeg"


class ImageSafetyError(ValueError):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def raster_extension(mime_type: str) -> str:
    normalized = str(mime_type or "").split(";", 1)[0].strip().lower()
    return ALLOWED_RASTER_MIMES.get(normalized, "")


def detect_raster_mime(raw: bytes) -> str:
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    if raw.startswith(b"BM"):
        return "image/bmp"
    return ""


def validate_raster_bytes(
    raw: bytes,
    *,
    max_bytes: int,
    claimed_mime: str = "",
) -> str:
    del claimed_mime
    if len(raw) > max_bytes:
        raise ImageSafetyError(
            f"图片超过 {max_bytes // (1024 * 1024)} MiB 限制",
            413,
        )
    mime_type = detect_raster_mime(raw)
    if not mime_type:
        raise ImageSafetyError("只支持 PNG、JPEG、GIF、WebP 或 BMP 栅格图片")
    return mime_type


def _png_header(raw: bytes, *, label: str) -> tuple[int, int, int]:
    if (
        len(raw) < 33
        or not raw.startswith(b"\x89PNG\r\n\x1a\n")
        or int.from_bytes(raw[8:12], "big") != 13
        or raw[12:16] != b"IHDR"
    ):
        raise ImageSafetyError(f"{label} PNG 头信息无效")
    width = int.from_bytes(raw[16:20], "big")
    height = int.from_bytes(raw[20:24], "big")
    if width <= 0 or height <= 0:
        raise ImageSafetyError(f"{label}尺寸无效")
    return width, height, raw[25]


def validate_edit_mask_bytes(
    raw: bytes,
    *,
    base_raw: bytes,
    max_bytes: int,
) -> dict[str, int]:
    mask_mime = validate_raster_bytes(raw, max_bytes=max_bytes)
    if mask_mime != "image/png":
        raise ImageSafetyError("遮罩只支持 PNG")
    base_mime = detect_raster_mime(base_raw)
    if base_mime != "image/png":
        raise ImageSafetyError("使用遮罩时第一张底图必须是 PNG")

    base_width, base_height, _base_color_type = _png_header(base_raw, label="底图")
    mask_width, mask_height, mask_color_type = _png_header(raw, label="遮罩")
    if mask_color_type not in {4, 6}:
        raise ImageSafetyError("遮罩 PNG 必须包含 Alpha 通道")
    if (mask_width, mask_height) != (base_width, base_height):
        raise ImageSafetyError("遮罩尺寸必须与第一张底图一致")
    return {"width": mask_width, "height": mask_height}


def decode_raster_data_url(source: str, *, max_bytes: int) -> tuple[bytes, str]:
    match = re.fullmatch(
        r"data:(image/[^;]+);base64,([A-Za-z0-9+/=\r\n]+)",
        source,
        re.IGNORECASE,
    )
    if not match:
        raise ImageSafetyError("参考图 data URL 格式无效")

    encoded = re.sub(r"\s+", "", match.group(2))
    padding = len(encoded) - len(encoded.rstrip("="))
    estimated_size = ((len(encoded) + 3) // 4) * 3 - min(padding, 2)
    if estimated_size > max_bytes:
        raise ImageSafetyError("参考图超过单图容量限制", 413)

    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ImageSafetyError("参考图 Base64 内容无效") from exc
    mime_type = validate_raster_bytes(
        raw,
        max_bytes=max_bytes,
        claimed_mime=match.group(1),
    )
    return raw, mime_type


def resolve_output_image(outputs_dir: Path, relative_path: str) -> Path:
    root = outputs_dir.resolve()
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ImageSafetyError("图片不存在", 404) from exc
    if candidate == root or not candidate.is_file():
        raise ImageSafetyError("图片不存在", 404)
    expected_mime = _RASTER_MIME_BY_EXTENSION.get(candidate.suffix.lower())
    if not expected_mime:
        raise ImageSafetyError("输出文件扩展名不受支持")
    if candidate.stat().st_size > REMOTE_RESULT_MAX_BYTES:
        raise ImageSafetyError("输出图片超过容量限制", 413)
    with candidate.open("rb") as handle:
        header = handle.read(16)
    detected_mime = detect_raster_mime(header)
    if not detected_mime or detected_mime != expected_mime:
        raise ImageSafetyError("输出文件不是受支持的栅格图片")
    return candidate


def read_limited_chunks(chunks: Iterable[bytes], *, max_bytes: int) -> bytes:
    payload = bytearray()
    for chunk in chunks:
        if not chunk:
            continue
        if len(payload) + len(chunk) > max_bytes:
            raise ImageSafetyError("远程图片超过容量限制", 413)
        payload.extend(chunk)
    return bytes(payload)
