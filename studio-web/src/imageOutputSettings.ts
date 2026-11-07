export const IMAGE_OUTPUT_FORMATS = ["auto", "png", "jpeg", "webp", "gif"] as const;
export const IMAGE_BACKGROUNDS = ["auto", "opaque", "transparent"] as const;

export function selectOutputFormat<T extends { output_format: string; background: string }>(form: T, output_format: string): T {
  const background = form.background === "transparent" && !["png", "webp", "auto"].includes(output_format) ? "auto" : form.background;
  return { ...form, output_format: background === "transparent" && output_format === "auto" ? "png" : output_format, background };
}

export function selectBackground<T extends { output_format: string; background: string }>(form: T, background: string): T {
  return { ...form, background, output_format: background === "transparent" && !["png", "webp"].includes(form.output_format) ? "png" : form.output_format };
}

const RESERVED_PARAMETERS = new Set([
  "model", "prompt", "input", "image", "image[]", "mask", "tools", "type",
  "n", "size", "quality", "seed", "negative_prompt", "style_preset",
  "enhance_prompt", "safety_check", "response_format", "output_format", "background",
  "frame_count", "frame_duration_ms", "stream", "partial_images",
  "api_key", "authorization", "headers", "base_url", "api_base_url",
  "__proto__", "constructor", "prototype",
]);

/** The UI validates drafts; the backend remains authoritative before any request. */
export function imageExtraBodyError(text = ""): string {
  if (!text.trim()) return "";
  if (new TextEncoder().encode(text).length > 16 * 1024) return "settings.extraBodyTooLarge";
  let value: unknown;
  try { value = JSON.parse(text); } catch { return "settings.extraBodyInvalid"; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "settings.extraBodyInvalid";
  if (Object.keys(value).some((key) => RESERVED_PARAMETERS.has(key.toLowerCase()))) return "settings.extraBodyReserved";
  return "";
}

export function imageOutputLabel(format: string, autoLabel: string): string {
  return format === "auto" ? autoLabel : format.toUpperCase();
}
