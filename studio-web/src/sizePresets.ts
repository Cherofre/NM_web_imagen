import { normalizeCustomImageSize } from "./sizeRules";

export const gptComposerSizeTiers = ["auto", "1K", "2K", "4K"] as const;
export const gptComposerAspectOptions = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21", "3:1", "1:3"] as const;

export type GptComposerSizeTier = (typeof gptComposerSizeTiers)[number];
export type GptComposerAspect = (typeof gptComposerAspectOptions)[number];

const gptComposerSizeMatrix: Record<Exclude<GptComposerSizeTier, "auto">, Record<GptComposerAspect, string>> = {
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

export function resolveGptComposerPresetSize(tier: GptComposerSizeTier, aspect: GptComposerAspect) {
  if (tier === "auto") return "auto";
  return normalizeCustomImageSize(gptComposerSizeMatrix[tier][aspect]).value;
}
