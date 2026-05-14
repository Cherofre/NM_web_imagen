import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const moduleUrl = pathToFileURL(path.resolve("src/gptSizeSelection.ts")).href;
const selection = await import(moduleUrl);

test("deriveGptSizeSelection marks auto size explicitly", () => {
  const result = selection.deriveGptSizeSelection({
    size: "auto",
    custom_size: "1536x864",
  });

  assert.deepEqual(result, {
    mode: "auto",
    tier: "auto",
    aspect: null,
    value: "auto",
    summary: "自动尺寸由上游决定",
  });
});

test("deriveGptSizeSelection matches 3840x2160 to 4K 16:9", () => {
  const result = selection.deriveGptSizeSelection({
    size: "custom",
    custom_size: "3840x2160",
  });

  assert.deepEqual(result, {
    mode: "preset",
    tier: "4K",
    aspect: "16:9",
    value: "3840x2160",
    summary: "4K · 16:9 · 3840x2160",
  });
});

test("deriveGptSizeSelection matches 3840x1648 to 4K 21:9", () => {
  const result = selection.deriveGptSizeSelection({
    size: "custom",
    custom_size: "3840x1648",
  });

  assert.deepEqual(result, {
    mode: "preset",
    tier: "4K",
    aspect: "21:9",
    value: "3840x1648",
    summary: "4K · 21:9 · 3840x1648",
  });
});

test("deriveGptSizeSelection keeps unmatched values as pure custom", () => {
  const result = selection.deriveGptSizeSelection({
    size: "custom",
    custom_size: "3536x2288",
  });

  assert.deepEqual(result, {
    mode: "custom",
    tier: null,
    aspect: null,
    value: "3536x2288",
    summary: "自定义 · 3536x2288",
  });
});
