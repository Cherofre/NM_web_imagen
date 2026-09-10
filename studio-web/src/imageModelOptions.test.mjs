import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  IMAGE_MODEL_PRESETS,
  buildImageModelOptions,
  composerImageModelOptions,
  decodeModelOptions,
  encodeModelOptions,
  filterImageModelsForEngine,
  imageModelSelectValue,
  isGeminiModelId,
  mergeImageModelOptions,
  normalizeModelIdList,
  parseModelListResponse,
  storedImageModelIds,
} from "./imageModelOptions.ts";

const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
const i18nSource = fs.readFileSync(path.resolve("src/i18n.ts"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

test("each engine only keeps its own family from the shared catalogue", () => {
  const catalogue = [
    "「YS」gpt-image-2.5-flare",
    "「Rim」gemini-3-pro-image-preview",
    "「YS」gpt-image-2.5-sunburst",
    "「Rim」gemini-3.1-flash-image-preview",
    "nano-banana-pro",
    "imagen-4.0-generate-001",
  ];
  assert.deepEqual(filterImageModelsForEngine(catalogue, "gpt-image-2"), [
    "「YS」gpt-image-2.5-flare",
    "「YS」gpt-image-2.5-sunburst",
  ]);
  assert.deepEqual(filterImageModelsForEngine(catalogue, "banana"), [
    "「Rim」gemini-3-pro-image-preview",
    "「Rim」gemini-3.1-flash-image-preview",
    "nano-banana-pro",
    "imagen-4.0-generate-001",
  ]);
  // A relay that only serves the other family still shows something.
  assert.deepEqual(filterImageModelsForEngine(["gemini-2.5-flash-image"], "gpt-image-2"), ["gemini-2.5-flash-image"]);
  assert.deepEqual(filterImageModelsForEngine([], "banana"), []);
  assert.equal(isGeminiModelId("「Rim」gemini-3-pro-image-preview"), true);
  assert.equal(isGeminiModelId("「YS」gpt-image-2.5-sunburst"), false);
});

test("the switcher marks a current model the endpoint never confirmed", () => {
  // The composer always shows the configured model, so an unfetched id is flagged
  // instead of looking like something the relay actually serves.
  const stored = "「Rim」gemini-3-pro-image-preview\n「Rim」gemini-3.1-flash-image-preview";
  assert.deepEqual(storedImageModelIds(stored, "banana"), [
    "「Rim」gemini-3-pro-image-preview",
    "「Rim」gemini-3.1-flash-image-preview",
  ]);
  const options = composerImageModelOptions("gemini-3-pro-image-preview", stored, "banana");
  assert.ok(options.includes("gemini-3-pro-image-preview"));
  const confirmed = new Set(storedImageModelIds(stored, "banana"));
  assert.equal(confirmed.has("gemini-3-pro-image-preview"), false);
  assert.equal(confirmed.has("「Rim」gemini-3-pro-image-preview"), true);
  // Stored ids from the other engine's family never count as confirmed either.
  assert.deepEqual(storedImageModelIds("gemini-2.5-flash-image\ngpt-image-2", "gpt-image-2"), ["gpt-image-2"]);
  assert.match(appSource, /const activeModelUnlisted = Boolean\(activeModelName\) && !composerModelIds\.has\(activeModelName\);/);
  assert.match(appSource, /\? storedImageModelIds\(bananaForm\.model_type_options, "banana"\)\s*: storedImageModelIds\(gptForm\.model_options, "gpt-image-2"\),/);
  assert.match(appSource, /\{activeModelUnlisted && \(/);
  assert.match(appSource, /t\("composer\.imageModelUnlisted", \{ model: activeModelName \}\)/);
  assert.match(appSource, /title=\{composerModelIds\.has\(item\) \? item : t\("composer\.imageModelUnlistedTitle", \{ model: item \}\)\}/);
  // Only the shipped default is offered before the first fetch.
  assert.match(appSource, /const bananaModelPresets = \["gemini-3-pro-image-preview"\];/);
  assert.match(stylesSource, /\.choice-grid\.image-models button\.unlisted \{/);
  assert.match(i18nSource, /"composer\.imageModelUnlisted":/);
});

test("studio filters fetched models per engine and says what it left out", () => {
  assert.match(appSource, /const models = isChat \? fetched : filterImageModelsForEngine\(fetched, isBanana \? "banana" : "gpt-image-2"\);/);
  assert.match(appSource, /const hidden = fetched\.length - models\.length;/);
  assert.match(appSource, /t\("config\.imageModelFetchDoneFiltered", \{ count: merged\.length, hidden \}\)/);
  assert.match(i18nSource, /"config\.imageModelFetchDoneFiltered":/);
});

test("the composer switcher follows the active engine", () => {
  assert.match(appSource, /const composerModelOptions = useMemo\(\s*\(\) =>\s*activeEngine === "banana"\s*\? composerImageModelOptions\(bananaForm\.model_type, bananaForm\.model_type_options, "banana"\)\s*: composerImageModelOptions\(gptForm\.model, gptForm\.model_options, "gpt-image-2"\),/);
  assert.match(appSource, /const activeModelName = activeEngine === "banana" \? bananaForm\.model_type : gptForm\.model;/);
  assert.match(appSource, /const composerModelFetching = activeEngine === "banana" \? bananaModelFetching : imageModelFetching;/);
  assert.match(appSource, /async function fetchActiveModelList\(\) \{\s*await fetchModelListForTarget\(activeEngine === "banana" \? "banana" : "image"\);\s*\}/);
  assert.match(appSource, /function applyActiveModel\(model: string\) \{\s*if \(activeEngine === "banana"\) \{\s*applyBananaModel\(model\);/);
  // The switcher is no longer hidden on the Gemini engine.
  assert.doesNotMatch(appSource, /\{activeEngine !== "banana" && \(\s*<div className="composer-popover-wrap image-model-wrap">/);
  assert.match(appSource, /<span className="generation-settings-summary">\{activeModelName \|\| t\("config\.noModel"\)\}<\/span>/);
  assert.match(appSource, /className=\{`\$\{activeModelName === item \? "selected" : ""\}\$\{composerModelIds\.has\(item\) \? "" : " unlisted"\}`\.trim\(\)\}/);
  // The Gemini profile field is labelled as the image model, like the GPT one.
  assert.match(appSource, /<Field label=\{t\("config\.imageModel"\)\} help=\{t\("config\.modelNameHelp"\)\}>/);
});

test("normalizeModelIdList dedupes, trims, and accepts upstream shapes", () => {
  assert.deepEqual(
    normalizeModelIdList([" 「YS」gpt-image-2.5-flare ", "", "「YS」gpt-image-2.5-flare", "b"]),
    ["「YS」gpt-image-2.5-flare", "b"],
  );
  assert.deepEqual(
    normalizeModelIdList([{ id: "gpt-image-2" }, { name: "flare" }, { model: "sunburst" }, {}]),
    ["gpt-image-2", "flare", "sunburst"],
  );
  assert.deepEqual(normalizeModelIdList("a\nb\na"), ["a", "b"]);
  assert.deepEqual(normalizeModelIdList(null), []);
  assert.equal(normalizeModelIdList(["a", "b", "c"], 2).length, 2);
  assert.equal(normalizeModelIdList(["x".repeat(400)])[0].length, 160);
});

test("model options round trip through the config form string", () => {
  const encoded = encodeModelOptions(["flare", "sunburst", "flare"]);
  assert.equal(encoded, "flare\nsunburst");
  assert.deepEqual(decodeModelOptions(encoded), ["flare", "sunburst"]);
  assert.equal(encodeModelOptions([]), "");
});

test("parseModelListResponse reads our api reply and raw model payloads", () => {
  assert.deepEqual(
    parseModelListResponse({ ok: true, models: ["flare", "sunburst"], count: 2 }),
    ["flare", "sunburst"],
  );
  assert.deepEqual(
    parseModelListResponse({ object: "list", data: [{ id: "gpt-image-2" }] }),
    ["gpt-image-2"],
  );
  assert.deepEqual(parseModelListResponse({ ok: false, models: [], error: "nope" }), []);
  assert.deepEqual(parseModelListResponse("nonsense"), []);
});

test("profile options show fetched ids and only seed presets before the first fetch", () => {
  const fetched = buildImageModelOptions("「YS」gpt-image-2.5-flare", "flare\nsunburst");
  assert.deepEqual(
    fetched.map((item) => item.value),
    ["flare", "sunburst", "「YS」gpt-image-2.5-flare", "custom"],
  );
  assert.equal(fetched[fetched.length - 1].custom, true);

  const seeded = buildImageModelOptions("gpt-image-2", "");
  assert.deepEqual(seeded.map((item) => item.value), ["gpt-image-2", "custom"]);
  IMAGE_MODEL_PRESETS.forEach((preset) => {
    assert.ok(
      buildImageModelOptions("anything", "").some((item) => item.value === preset),
      preset,
    );
  });
  IMAGE_MODEL_PRESETS.forEach((preset) => {
    assert.ok(
      !buildImageModelOptions("anything", "flare").some((item) => item.value === preset),
      `${preset} must not linger once a real catalogue exists`,
    );
  });
});

test("select value falls back to custom for hand written models", () => {
  assert.equal(imageModelSelectValue("flare", "flare\nsunburst"), "flare");
  assert.equal(imageModelSelectValue("brand-new-model", "flare"), "custom");
  assert.equal(imageModelSelectValue("", "flare"), "custom");
});

test("refresh keeps fetched ids first and never drops the current model", () => {
  assert.deepEqual(
    mergeImageModelOptions("old-model", ["flare", "sunburst"], "old-model"),
    ["flare", "sunburst", "old-model"],
  );
  assert.deepEqual(mergeImageModelOptions("", [], "current"), ["current"]);
});

test("composer switcher exposes stored plus current model ids", () => {
  assert.deepEqual(composerImageModelOptions("flare", "flare\nsunburst"), ["flare", "sunburst"]);
  assert.deepEqual(composerImageModelOptions("mine", ""), ["mine"]);
  assert.deepEqual(composerImageModelOptions("", ""), []);
});

test("studio wires the image model switcher into the profile editor and composer", () => {
  const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
  const i18nSource = fs.readFileSync(path.resolve("src/i18n.ts"), "utf8");
  assert.match(appSource, /import \{[\s\S]*?buildImageModelOptions,[\s\S]*?\} from "\.\/imageModelOptions";/);
  assert.match(appSource, /model_options: string;/);
  assert.match(appSource, /async function fetchImageModelList\(/);
  assert.match(appSource, /apiFetch\("\/api\/models"/);
  assert.match(appSource, /t\("config\.imageModelFetch"\)/);
  assert.match(appSource, /t\("config\.customImageModel"\)/);
  assert.match(appSource, /t\("composer\.imageModelTooltip"\)/);
  assert.match(i18nSource, /"config\.imageModelFetch": "读取模型列表"/);
  assert.match(i18nSource, /"config\.customImageModel": "自定义生图模型"/);
  assert.match(i18nSource, /"composer\.imageModelTooltip":/);
  // Fetched ids read one per row, and the fetch action sits on the heading row
  // (composer popover) or on the model input row (profile editor) - never as a
  // loose action below the list.
  assert.match(appSource, /className="image-model-heading-actions"/);
  assert.match(appSource, /className="image-model-row"/);
  assert.ok(!appSource.includes('className="image-model-actions"'));
  assert.ok(!appSource.includes('className="image-model-fetch"'));
  const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
  assert.match(stylesSource, /\.choice-grid\.image-models \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(stylesSource, /\.field \.image-model-row \{/);
});
