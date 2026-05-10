export const GPT_CUSTOM_SIZE_MIN = 16;
export const GPT_CUSTOM_SIZE_MAX = 3840;
export const GPT_CUSTOM_SIZE_STEP = 16;
export const GPT_CUSTOM_SIZE_MAX_RATIO = 3;
export const GPT_CUSTOM_SIZE_MIN_PIXELS = 655360;
export const GPT_CUSTOM_SIZE_MAX_PIXELS = 2880 * 2880;
export const GPT_CUSTOM_SIZE_FALLBACK = { width: 1536, height: 864 };

export type NormalizedImageSize = {
  value: string;
  label: string;
  adjusted: boolean;
  roundedToMultiple: boolean;
  clampedToMax: boolean;
  adjustedRatio: boolean;
  adjustedPixelRange: "min" | "max" | null;
  notice: string;
};

export function parseCustomImageSize(value: string) {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*x\s*(\d+)$/);
  if (!match) return { ...GPT_CUSTOM_SIZE_FALLBACK };
  return {
    width: Number(match[1]) || GPT_CUSTOM_SIZE_FALLBACK.width,
    height: Number(match[2]) || GPT_CUSTOM_SIZE_FALLBACK.height,
  };
}

function clampCustomImageDimension(value: number) {
  return Math.min(GPT_CUSTOM_SIZE_MAX, Math.max(GPT_CUSTOM_SIZE_MIN, value));
}

function snapCustomImageDimension(value: number, mode: "round" | "ceil" | "floor" = "round") {
  if (!Number.isFinite(value)) return GPT_CUSTOM_SIZE_STEP;
  const scaled = value / GPT_CUSTOM_SIZE_STEP;
  const snapped =
    mode === "ceil"
      ? Math.ceil(scaled) * GPT_CUSTOM_SIZE_STEP
      : mode === "floor"
        ? Math.floor(scaled) * GPT_CUSTOM_SIZE_STEP
        : Math.round(scaled) * GPT_CUSTOM_SIZE_STEP;
  return clampCustomImageDimension(snapped);
}

function enforceRatio(width: number, height: number) {
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (shortEdge <= 0 || longEdge / shortEdge <= GPT_CUSTOM_SIZE_MAX_RATIO) {
    return { width, height, adjusted: false };
  }
  const requiredShortEdge = snapCustomImageDimension(longEdge / GPT_CUSTOM_SIZE_MAX_RATIO, "ceil");
  return width >= height
    ? { width, height: requiredShortEdge, adjusted: true }
    : { width: requiredShortEdge, height, adjusted: true };
}

function enforcePixelRange(width: number, height: number) {
  let nextWidth = width;
  let nextHeight = height;
  let adjustedPixelRange: "min" | "max" | null = null;
  const area = nextWidth * nextHeight;

  if (area > GPT_CUSTOM_SIZE_MAX_PIXELS) {
    const scale = Math.sqrt(GPT_CUSTOM_SIZE_MAX_PIXELS / area);
    nextWidth = snapCustomImageDimension(nextWidth * scale, "floor");
    nextHeight = snapCustomImageDimension(nextHeight * scale, "floor");
    adjustedPixelRange = "max";
  }

  if (nextWidth * nextHeight < GPT_CUSTOM_SIZE_MIN_PIXELS) {
    const scale = Math.sqrt(GPT_CUSTOM_SIZE_MIN_PIXELS / (nextWidth * nextHeight));
    nextWidth = snapCustomImageDimension(nextWidth * scale, "ceil");
    nextHeight = snapCustomImageDimension(nextHeight * scale, "ceil");
    adjustedPixelRange = "min";
  }

  let guard = 0;
  while (nextWidth * nextHeight > GPT_CUSTOM_SIZE_MAX_PIXELS && guard < 512) {
    if (nextWidth >= nextHeight && nextWidth > GPT_CUSTOM_SIZE_MIN) {
      nextWidth -= GPT_CUSTOM_SIZE_STEP;
    } else if (nextHeight > GPT_CUSTOM_SIZE_MIN) {
      nextHeight -= GPT_CUSTOM_SIZE_STEP;
    } else {
      break;
    }
    adjustedPixelRange = "max";
    guard += 1;
  }

  guard = 0;
  while (nextWidth * nextHeight < GPT_CUSTOM_SIZE_MIN_PIXELS && guard < 512) {
    if (nextWidth <= nextHeight && nextWidth < GPT_CUSTOM_SIZE_MAX) {
      nextWidth += GPT_CUSTOM_SIZE_STEP;
    } else if (nextHeight < GPT_CUSTOM_SIZE_MAX) {
      nextHeight += GPT_CUSTOM_SIZE_STEP;
    } else {
      break;
    }
    adjustedPixelRange = "min";
    guard += 1;
  }

  return { width: nextWidth, height: nextHeight, adjustedPixelRange };
}

export function normalizeCustomImageSize(value: string): NormalizedImageSize {
  const parsed = parseCustomImageSize(value);
  let width = snapCustomImageDimension(parsed.width);
  let height = snapCustomImageDimension(parsed.height);
  const clampedToMax = parsed.width > GPT_CUSTOM_SIZE_MAX || parsed.height > GPT_CUSTOM_SIZE_MAX;
  const roundedToMultiple =
    parsed.width !== width ||
    parsed.height !== height ||
    parsed.width % GPT_CUSTOM_SIZE_STEP !== 0 ||
    parsed.height % GPT_CUSTOM_SIZE_STEP !== 0;

  let ratioResult = enforceRatio(width, height);
  width = ratioResult.width;
  height = ratioResult.height;
  let adjustedRatio = ratioResult.adjusted;

  const pixelResult = enforcePixelRange(width, height);
  width = pixelResult.width;
  height = pixelResult.height;

  ratioResult = enforceRatio(width, height);
  width = ratioResult.width;
  height = ratioResult.height;
  adjustedRatio = adjustedRatio || ratioResult.adjusted;

  const label = `${width} x ${height}`;
  const normalizedValue = `${width}x${height}`;
  const adjusted =
    normalizedValue !== value.trim().toLowerCase().replace(/\s+/g, "") ||
    roundedToMultiple ||
    clampedToMax ||
    adjustedRatio ||
    Boolean(pixelResult.adjustedPixelRange);
  const reasons: string[] = [];
  if (clampedToMax) reasons.push(`单边不超过 ${GPT_CUSTOM_SIZE_MAX}`);
  if (roundedToMultiple) reasons.push("按 16 倍数");
  if (adjustedRatio) reasons.push("比例不超过 3:1");
  if (pixelResult.adjustedPixelRange === "max") reasons.push("总像素不超过 2880 x 2880");
  if (pixelResult.adjustedPixelRange === "min") reasons.push(`总像素不少于 ${GPT_CUSTOM_SIZE_MIN_PIXELS}`);
  return {
    value: normalizedValue,
    label,
    adjusted,
    roundedToMultiple,
    clampedToMax,
    adjustedRatio,
    adjustedPixelRange: pixelResult.adjustedPixelRange,
    notice: adjusted ? `尺寸已自动调整为 ${label}${reasons.length ? `（${reasons.join("，")}）` : ""}` : "",
  };
}
