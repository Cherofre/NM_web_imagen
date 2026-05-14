export type GptComposerSizeTier = "auto" | "1K" | "2K" | "4K";
export type GptComposerAspect = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3" | "21:9" | "9:21" | "3:1" | "1:3";
export type GptSizeSelectionMode = "auto" | "preset" | "custom";

export type GptSizeSelection = {
  mode: GptSizeSelectionMode;
  tier: GptComposerSizeTier | null;
  aspect: GptComposerAspect | null;
  value: string;
  summary: string;
};

const PRESET_MATRIX: Record<Exclude<GptComposerSizeTier, "auto">, Record<GptComposerAspect, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "16:9": "1536x864",
    "9:16": "864x1536",
    "4:3": "1280x960",
    "3:4": "960x1280",
    "3:2": "1536x1024",
    "2:3": "1024x1536",
    "21:9": "1792x768",
    "9:21": "768x1792",
    "3:1": "1536x512",
    "1:3": "512x1536",
  },
  "2K": {
    "1:1": "2048x2048",
    "16:9": "2048x1152",
    "9:16": "1152x2048",
    "4:3": "2048x1536",
    "3:4": "1536x2048",
    "3:2": "2016x1344",
    "2:3": "1344x2016",
    "21:9": "2048x880",
    "9:21": "880x2048",
    "3:1": "2016x672",
    "1:3": "672x2016",
  },
  "4K": {
    "1:1": "2880x2880",
    "16:9": "3840x2160",
    "9:16": "2160x3840",
    "4:3": "3264x2448",
    "3:4": "2448x3264",
    "3:2": "3504x2336",
    "2:3": "2336x3504",
    "21:9": "3840x1648",
    "9:21": "1648x3840",
    "3:1": "3840x1280",
    "1:3": "1280x3840",
  },
};

const PRESET_LOOKUP = new Map<string, { tier: Exclude<GptComposerSizeTier, "auto">; aspect: GptComposerAspect }>();

for (const [tier, aspects] of Object.entries(PRESET_MATRIX) as Array<[Exclude<GptComposerSizeTier, "auto">, Record<GptComposerAspect, string>]>) {
  for (const [aspect, value] of Object.entries(aspects) as Array<[GptComposerAspect, string]>) {
    PRESET_LOOKUP.set(value, { tier, aspect });
  }
}

function normalizeSizeValue(value: string) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d+)\s*x\s*(\d+)$/);
  if (!match) return "";
  return `${Number(match[1])}x${Number(match[2])}`;
}

export function deriveGptSizeSelection(input: { size?: string; custom_size?: string }): GptSizeSelection {
  if (input.size === "auto") {
    return {
      mode: "auto",
      tier: "auto",
      aspect: null,
      value: "auto",
      summary: "自动尺寸由上游决定",
    };
  }

  const effectiveValue = input.size === "custom"
    ? normalizeSizeValue(input.custom_size || "")
    : normalizeSizeValue(input.size || "");

  const presetMatch = PRESET_LOOKUP.get(effectiveValue);
  if (presetMatch) {
    return {
      mode: "preset",
      tier: presetMatch.tier,
      aspect: presetMatch.aspect,
      value: effectiveValue,
      summary: `${presetMatch.tier} · ${presetMatch.aspect} · ${effectiveValue}`,
    };
  }

  return {
    mode: "custom",
    tier: null,
    aspect: null,
    value: effectiveValue,
    summary: effectiveValue ? `自定义 · ${effectiveValue}` : "自定义",
  };
}
