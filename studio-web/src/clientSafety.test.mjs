import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const safety = await import("./clientSafety.ts");
const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");

test("sanitizeForBrowserStorage recursively removes api_key regardless of key casing", () => {
  const input = {
    api_key: "top-secret",
    apiKey: "keep-this-different-field",
    model: "gpt-image-2",
    nested: {
      API_KEY: "nested-secret",
      endpoint: "https://example.com/v1",
      deeper: [{ Api_KeY: "array-secret", enabled: true }],
    },
  };

  assert.deepEqual(safety.sanitizeForBrowserStorage(input), {
    apiKey: "keep-this-different-field",
    model: "gpt-image-2",
    nested: {
      endpoint: "https://example.com/v1",
      deeper: [{ enabled: true }],
    },
  });
  assert.equal(input.nested.deeper[0].Api_KeY, "array-secret", "sanitizing must not mutate live form state");
});

test("sanitizeStoredJson sanitizes legacy JSON before returning it", () => {
  const fallback = { model: "fallback" };
  const restored = safety.sanitizeStoredJson(
    JSON.stringify({ api_key: "old-secret", model: "saved", nested: { API_KEY: "nested", value: 3 } }),
    fallback,
  );

  assert.deepEqual(restored, { model: "saved", nested: { value: 3 } });
});

test("sanitizeStoredJson returns the supplied fallback for malformed or absent JSON", () => {
  const fallback = { model: "fallback", api_key: "" };

  assert.strictEqual(safety.sanitizeStoredJson("{not-json", fallback), fallback);
  assert.strictEqual(safety.sanitizeStoredJson(null, fallback), fallback);
});

test("Studio migrates legacy form storage and only persists sanitized forms", () => {
  assert.match(appSource, /import \{ sanitizeForBrowserStorage, sanitizeStoredJson \} from "\.\/clientSafety";/);
  assert.match(appSource, /function loadSanitizedBrowserForm<T>\(key: string, fallback: T\)/);
  assert.match(appSource, /const sanitized = sanitizeStoredJson\(localStorage\.getItem\(key\), fallback\);/);
  assert.match(appSource, /localStorage\.setItem\(key, JSON\.stringify\(sanitizeForBrowserStorage\(sanitized\)\)\);/);
  assert.match(appSource, /useState<GptForm>\(\(\) => normalizeGptForm\(loadSanitizedBrowserForm\(gptStorageKey, defaultGptForm\)\)\)/);
  assert.match(appSource, /useState<BananaForm>\(\(\) => normalizeBananaForm\(loadSanitizedBrowserForm\(bananaStorageKey, defaultBananaForm\)\)\)/);
  assert.match(appSource, /localStorage\.setItem\(gptStorageKey, JSON\.stringify\(sanitizeForBrowserStorage\(gptForm\)\)\)/);
  assert.match(appSource, /localStorage\.setItem\(bananaStorageKey, JSON\.stringify\(sanitizeForBrowserStorage\(bananaForm\)\)\)/);

  const saveConfigStart = appSource.indexOf("async function saveConfig()");
  const loadHistoryStart = appSource.indexOf("async function loadHistory()", saveConfigStart);
  const saveConfigSource = appSource.slice(saveConfigStart, loadHistoryStart);
  assert.match(saveConfigSource, /body: JSON\.stringify\(buildConfigPayload\(/);
  assert.doesNotMatch(saveConfigSource, /sanitizeForBrowserStorage/);
});
