/**
 * Image model switching helpers.
 *
 * One connection profile can talk to a relay that serves several image models
 * (for example `flare` and `sunburst`). The profile keeps the model ids it has
 * seen for that endpoint in `model_options`, so the config drawer and the
 * composer can both offer a switcher without another network round trip.
 */

export const IMAGE_MODEL_OPTIONS_MAX_ITEMS = 120;
export const IMAGE_MODEL_ID_MAX_CHARS = 160;

/**
 * Built-in presets offered in the profile editor before anything has been
 * fetched from the endpoint. Deliberately tiny: relays invent their own model
 * ids, so the real list comes from `/api/models` and free text stays available.
 * The composer switcher ignores these 鈥?it only offers ids this profile has
 * actually seen, so it never suggests a model the endpoint may not serve.
 */
export const IMAGE_MODEL_PRESETS = ["gpt-image-2"];

export type ImageModelOption = {
  value: string;
  label: string;
  custom: boolean;
};

function compactText(value: unknown, limit: number): string {
  const text = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit).trim() : text;
}

/** Dedupe and sanitize model ids coming from a form field or an upstream reply. */
export function normalizeModelIdList(values: unknown, limit = IMAGE_MODEL_OPTIONS_MAX_ITEMS): string[] {
  const items: unknown[] = Array.isArray(values)
    ? values
    : typeof values === "string"
      ? values.split(/[\r\n,;]+/)
      : values === null || values === undefined
        ? []
        : [values];

  const result: string[] = [];
  const seen = new Set<string>();
  const capped = Math.max(1, Math.floor(limit));
  items.forEach((item) => {
    if (result.length >= capped) return;
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const raw = record ? record.id ?? record.name ?? record.model ?? "" : item;
    const modelId = compactText(raw, IMAGE_MODEL_ID_MAX_CHARS);
    if (!modelId || seen.has(modelId)) return;
    seen.add(modelId);
    result.push(modelId);
  });
  return result;
}

/** `model_options` travels through config.local.json as a newline separated string. */
export function encodeModelOptions(values: unknown): string {
  return normalizeModelIdList(values).join("\n");
}

export function decodeModelOptions(value: unknown): string[] {
  return normalizeModelIdList(value);
}

/** Accepts our own `/api/models` reply as well as a raw OpenAI style payload. */
export function parseModelListResponse(payload: unknown): string[] {
  if (Array.isArray(payload)) return normalizeModelIdList(payload);
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.models)) return normalizeModelIdList(record.models);
    if (Array.isArray(record.data)) return normalizeModelIdList(record.data);
  }
  return [];
}

/**
 * Options shown in the profile editor: remembered ids (or the built-in presets
 * while this profile has never fetched a list), then the configured model, and a
 * trailing "custom" entry for free text.
 *
 * Presets disappear as soon as real ids are known: once the endpoint has
 * answered, a hardcoded id is noise and may not even exist there.
 */
export function buildImageModelOptions(
  currentModel: string,
  storedOptions: unknown,
  presets: readonly string[] = IMAGE_MODEL_PRESETS,
  engine?: AppEngineId,
): ImageModelOption[] {
  const stored = storedImageModelIds(storedOptions, engine);
  const base = stored.length > 0 ? stored : presets;
  const merged = normalizeModelIdList([...base, currentModel]);
  const options = merged.map((value) => ({ value, label: value, custom: false }));
  options.push({ value: "custom", label: "custom", custom: true });
  return options;
}

/** The value a `<select>` should show for the configured model. */
export function imageModelSelectValue(
  currentModel: string,
  storedOptions: unknown,
  presets: readonly string[] = IMAGE_MODEL_PRESETS,
  engine?: AppEngineId,
): string {
  const model = compactText(currentModel, IMAGE_MODEL_ID_MAX_CHARS);
  if (!model) return "custom";
  const known = [...storedImageModelIds(storedOptions, engine), ...presets];
  return normalizeModelIdList(known).includes(model) ? model : "custom";
}

/** Merge a freshly fetched catalogue into the stored list, keeping the current model. */
export function mergeImageModelOptions(
  storedOptions: unknown,
  fetched: unknown,
  currentModel = "",
  engine?: AppEngineId,
): string[] {
  return normalizeModelIdList([
    ...normalizeModelIdList(fetched),
    ...storedImageModelIds(storedOptions, engine),
    currentModel,
  ]);
}

/** The composer switcher is only useful when there is a real choice to make. */
export function composerImageModelOptions(
  currentModel: string,
  storedOptions: unknown,
  engine?: AppEngineId,
): string[] {
  return normalizeModelIdList([...storedImageModelIds(storedOptions, engine), currentModel]);
}

export type AppEngineId = "gpt-image-2" | "banana";

/**
 * Which catalogue entries belong to which engine.
 *
 * Aggregator relays answer one catalogue for every engine, so the GPT side used
 * to offer Gemini models and vice versa. Names are the only signal available, and
 * the two families are easy to tell apart: Gemini/Imagen ids never serve the
 * OpenAI image endpoint, and `gpt-image-*` ids never serve the Gemini endpoint.
 */
const GEMINI_MODEL_PATTERN = /(gemini|nano-?banana|imagen)/i;

export function isGeminiModelId(modelId: string): boolean {
  return GEMINI_MODEL_PATTERN.test(String(modelId || ""));
}

/**
 * Keep only the ids this engine can actually use.
 *
 * If nothing matches 鈥?a relay that only serves the other family, or an
 * unfamiliar naming scheme 鈥?the full list is returned untouched so the user is
 * never left with an empty switcher.
 */
export function filterImageModelsForEngine(models: unknown, engine: AppEngineId): string[] {
  const all = normalizeModelIdList(models);
  const matches = all.filter((item) => (engine === "banana" ? isGeminiModelId(item) : !isGeminiModelId(item)));
  return matches.length > 0 ? matches : all;
}

/** Remembered ids, with any leftover ids from the other engine's family dropped. */
export function storedImageModelIds(storedOptions: unknown, engine?: AppEngineId): string[] {
  const stored = decodeModelOptions(storedOptions);
  return engine ? filterImageModelsForEngine(stored, engine) : stored;
}

