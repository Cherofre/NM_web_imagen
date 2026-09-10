import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_IMPORT_MAX_BYTES,
  CONFIG_TRANSFER_FORM_KEYS,
  CONFIG_TRANSFER_KIND,
  buildConfigExport,
  configExportFileName,
  mergeImportedConfig,
  parseConfigImport,
} from "./configTransfer.ts";

const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
const i18nSource = fs.readFileSync(path.resolve("src/i18n.ts"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
const appPySource = fs.readFileSync(path.resolve("../app.py"), "utf8");

function profile(id, engine, form, name = id) {
  return { id, engine, name, form };
}

test("export strips every secret but keeps the rest of the profile", () => {
  const exported = buildConfigExport(
    [
      profile("p1", "gpt-image-2", {
        base_url: "http://relay.local:12001",
        api_key: "sk-secret",
        model: "sunburst",
        model_options: "flare\nsunburst",
        chat_model: "gpt-5.6-luna",
        chat_model_options: "luna",
        chat_enabled: "0",
      }),
      profile("b1", "banana", { api_base_url: "https://banana.local", api_key: "banana-key", model_type: "gemini" }),
    ],
    { "gpt-image-2": "p1", banana: "b1" },
    "gpt-image-2",
    "1.1.2",
    "2026-09-10T00:00:00.000Z",
  );

  assert.equal(exported.kind, CONFIG_TRANSFER_KIND);
  assert.equal(exported.app_version, "1.1.2");
  assert.equal(exported.profiles.length, 2);
  exported.profiles.forEach((item) => {
    assert.ok(!("api_key" in item.form), `${item.id} must not export a key`);
  });
  assert.equal(exported.profiles[0].form.chat_enabled, "0");
  assert.equal(exported.profiles[0].form.chat_model_options, "luna");
  assert.equal(exported.profiles[0].form.model_options, "flare\nsunburst");
  assert.equal(exported.profiles[1].form.api_base_url, "https://banana.local");
  assert.deepEqual(exported.active_profile_ids, { "gpt-image-2": "p1", banana: "b1" });
  assert.ok(!JSON.stringify(exported).includes("sk-secret"));
  assert.equal(configExportFileName("1.1.2", "SillyDream", new Date("2026-09-10T12:00:00Z")), "nm-image-studio-config-SillyDream-1.1.2-2026-09-10.json");
});

test("the export file name carries the profile name it was exported from", () => {
  const stamp = new Date("2026-09-10T12:00:00Z");
  // Chinese names are fine on Windows, but the characters the file system
  // rejects never are; spaces collapse so the name stays one readable token.
  assert.equal(
    configExportFileName("1.1.2", "主力配置", stamp),
    "nm-image-studio-config-主力配置-1.1.2-2026-09-10.json",
  );
  assert.equal(
    configExportFileName("1.1.2", 'relay A/B: "main"', stamp),
    "nm-image-studio-config-relay-A-B-main-1.1.2-2026-09-10.json",
  );
  assert.equal(configExportFileName("1.1.2", "   ", stamp), "nm-image-studio-config-1.1.2-2026-09-10.json");
  assert.equal(configExportFileName("", "SillyDream", stamp), "nm-image-studio-config-SillyDream-unknown-2026-09-10.json");
  assert.equal(
    configExportFileName("1.1.2", "x".repeat(80), stamp).length,
    "nm-image-studio-config-".length + 40 + "-1.1.2-2026-09-10.json".length,
  );
  assert.match(appSource, /const fileName = configExportFileName\(transfer\.app_version, drawerProfileName\);/);
});

test("import accepts an exported file, a nested file, and a raw config payload", () => {
  const raw = {
    version: 2,
    active_engine: "gpt-image-2",
    active_profile_ids: { "gpt-image-2": "p1" },
    profiles: [profile("p1", "gpt-image-2", { base_url: "http://relay.local", model: "sunburst" })],
  };
  const fromRaw = parseConfigImport(JSON.stringify(raw));
  assert.equal(fromRaw.profiles.length, 1);
  assert.equal(fromRaw.profiles[0].form.model, "sunburst");

  const nested = parseConfigImport(JSON.stringify({ kind: CONFIG_TRANSFER_KIND, config: raw }));
  assert.equal(nested.profiles.length, 1);

  assert.throws(() => parseConfigImport("not json"), /config\.importInvalid/);
  assert.throws(() => parseConfigImport(JSON.stringify({ hello: "world" })), /config\.importInvalid/);
  assert.throws(() => parseConfigImport(JSON.stringify({ profiles: [] })), /config\.importInvalid/);
  assert.throws(
    () => parseConfigImport(JSON.stringify({ kind: CONFIG_TRANSFER_KIND, profiles: [] })),
    /config\.importEmpty/,
  );
  assert.throws(() => parseConfigImport("x".repeat(CONFIG_IMPORT_MAX_BYTES + 1)), /config\.importTooLarge/);
  // Unknown engines and duplicate ids are dropped rather than trusted.
  const messy = parseConfigImport(
    JSON.stringify({
      profiles: [
        profile("p1", "gpt-image-2", { model: "a" }),
        profile("p1", "gpt-image-2", { model: "b" }),
        profile("x1", "midjourney", { model: "c" }),
        { engine: "banana", form: { api_key: "leak", model_type: "gemini" } },
      ],
    }),
  );
  assert.deepEqual(messy.profiles.map((item) => item.id), ["p1", "banana-4"]);
  assert.equal(messy.profiles[1].form.api_key, undefined);
});

test("import updates matching profiles, appends new ones, and keeps local keys", () => {
  const current = [
    profile("p1", "gpt-image-2", { base_url: "http://relay.local:12001", api_key: "local-key", model: "old" }),
    profile("keep", "gpt-image-2", { base_url: "http://other.local", api_key: "other-key", model: "keep" }),
  ];
  const imported = parseConfigImport(
    JSON.stringify({
      active_engine: "gpt-image-2",
      active_profile_ids: { "gpt-image-2": "p2" },
      profiles: [
        profile("p1", "gpt-image-2", { base_url: "http://relay.local:12001", model: "new" }),
        profile("p2", "gpt-image-2", { base_url: "http://fresh.local", model: "fresh" }),
      ],
    }),
  );

  const result = mergeImportedConfig(current, { "gpt-image-2": "p1", banana: "banana-default" }, imported);
  assert.equal(result.addedCount, 1);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.keptKeyCount, 1);
  assert.equal(result.keysMissing, 1);
  const byId = Object.fromEntries(result.profiles.map((item) => [item.id, item]));
  // Updated in place, with the key this machine already trusts.
  assert.equal(byId.p1.form.model, "new");
  assert.equal(byId.p1.form.api_key, "local-key");
  // Untouched local profile survives.
  assert.equal(byId.keep.form.model, "keep");
  // New profile arrives without a key.
  assert.equal(byId.p2.form.api_key, "");
  assert.equal(result.profiles.length, 3);
  assert.equal(result.activeProfileIds["gpt-image-2"], "p2");
  assert.equal(result.activeProfileIds.banana, "banana-default");
});

test("import matches a shared profile by endpoint instead of duplicating it", () => {
  const current = [profile("mine", "gpt-image-2", { base_url: "HTTP://Relay.local:12001/", api_key: "local-key", model: "old" })];
  const imported = parseConfigImport(
    JSON.stringify({
      profiles: [profile("theirs", "gpt-image-2", { base_url: "http://relay.local:12001", model: "shared" })],
    }),
  );
  const result = mergeImportedConfig(current, { "gpt-image-2": "mine", banana: "banana-default" }, imported);
  assert.equal(result.addedCount, 0);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].id, "mine");
  assert.equal(result.profiles[0].form.model, "shared");
  assert.equal(result.profiles[0].form.api_key, "local-key");
});

test("an imported active profile that does not exist is ignored", () => {
  const result = mergeImportedConfig(
    [],
    { "gpt-image-2": "p1", banana: "banana-default" },
    parseConfigImport(
      JSON.stringify({
        active_profile_ids: { "gpt-image-2": "ghost", banana: "ghost" },
        profiles: [profile("p1", "gpt-image-2", { model: "a" })],
      }),
    ),
  );
  assert.equal(result.activeProfileIds["gpt-image-2"], "p1");
  assert.equal(result.activeProfileIds.banana, "banana-default");
});

test("the exported field set is exactly what the backend can store again", () => {
  // Exporting generation-only fields (size, quality, ...) would promise a restore
  // the backend cannot perform, so the export is limited to the stored fields.
  const exported = buildConfigExport(
    [
      profile("p1", "gpt-image-2", {
        base_url: "http://relay.local",
        api_key: "sk-secret",
        model: "m",
        model_options: "m",
        chat_model: "c",
        chat_model_options: "c",
        chat_enabled: "1",
        reasoning_effort: "high",
        credential_ref: "banana",
        quality: "high",
        size: "1024x1024",
        seed: 42,
      }),
      profile("b1", "banana", { api_base_url: "http://relay.local", model_type: "gemini", credential_ref: "gpt-image-2", image_size: "4K", seed: 7 }),
    ],
    {},
    "gpt-image-2",
    "1.1.2",
  );
  const gpt = exported.profiles[0].form;
  const banana = exported.profiles[1].form;
  assert.ok(!("quality" in gpt) && !("size" in gpt) && !("seed" in gpt));
  assert.ok(!("image_size" in banana) && !("seed" in banana));
  assert.equal(gpt.credential_ref, "banana");
  assert.equal(banana.credential_ref, "gpt-image-2");

  // Keep this list in step with CONFIG_CONNECTION_FIELDS in app.py.
  const block = appPySource.match(/CONFIG_CONNECTION_FIELDS = \{([\s\S]*?)\n\}/);
  assert.ok(block, "CONFIG_CONNECTION_FIELDS must exist in app.py");
  const backendKeys = (name) => {
    const form = block[1].match(new RegExp(`"${name}": \\{([\\s\\S]*?)\\}`, "m"));
    assert.ok(form, `${name} must be declared`);
    return form[1]
      .split(/[,\s]+/)
      .map((item) => item.replace(/["']/g, "").trim())
      .filter((item) => /^[a-z_]+$/.test(item))
      .filter((item) => item !== "api_key")
      .sort();
  };
  assert.deepEqual(backendKeys("gpt-image-2-form"), [...CONFIG_TRANSFER_FORM_KEYS["gpt-image-2"]].sort());
  assert.deepEqual(backendKeys("banana-form"), [...CONFIG_TRANSFER_FORM_KEYS.banana].sort());
});

test("studio wires export and import into the profile drawer", () => {
  assert.match(appSource, /import \{[\s\S]*?buildConfigExport,[\s\S]*?\} from "\.\/configTransfer";/);
  assert.match(appSource, /const configImportRef = useRef<HTMLInputElement \| null>\(null\);/);
  assert.match(appSource, /async function exportConfigFile\(\)/);
  assert.match(appSource, /async function importConfigFile\(event: React\.ChangeEvent<HTMLInputElement>\)/);
  assert.match(appSource, /async function applyConfigFile\(file: File\)/);
  // Desktop export goes through the native save dialog so the user chooses the
  // folder and the toast can name the exact path; the browser falls back to a
  // download plus a hint about where it landed.
  assert.match(appSource, /const savedPath = await saveDesktopTextAs\(fileName, text\);/);
  assert.match(appSource, /setNotice\(`\$\{summary\} \$\{t\("config\.exportSavedTo", \{ path: savedPath \}\)\}`\)/);
  assert.match(appSource, /link\.download = fileName;/);
  assert.match(appSource, /t\("config\.exportBrowserHint", \{ name: fileName \}\)/);
  // Import is reachable by button, and by dropping the file onto the drawer.
  assert.match(appSource, /<button type="button" onClick=\{\(\) => void exportConfigFile\(\)\} title=\{t\("config\.exportConfigHelp"\)\}>\{t\("config\.exportConfig"\)\}<\/button>/);
  assert.match(appSource, /<button type="button" onClick=\{\(\) => configImportRef\.current\?\.click\(\)\} title=\{t\("config\.importConfigHelp"\)\}>\{t\("config\.importConfig"\)\}<\/button>/);
  assert.match(appSource, /ref=\{configImportRef\} hidden type="file" accept="application\/json,\.json"/);
  assert.match(appSource, /onDragOver=\{onConfigDrawerDragOver\} onDragLeave=\{onConfigDrawerDragLeave\} onDrop=\{onConfigDrawerDrop\}/);
  assert.match(appSource, /function onConfigDrawerDrop\(event: React\.DragEvent<HTMLElement>\)/);
  assert.match(appSource, /void applyConfigFile\(file\);/);
  // The drop hint belongs under the drawer title; the button row stays one line.
  assert.match(appSource, /<p className="drawer-drop-hint" role="note">\s*\{configDragActive \? t\("config\.importDropActive"\) : t\("config\.importDropHint"\)\}/);
  assert.doesNotMatch(appSource, /drawer-actions"[\s\S]{0,600}config-transfer-note/);
  assert.match(stylesSource, /\.drawer-drop-hint \{/);
  assert.match(stylesSource, /\.connection-drawer\.drag-active \{/);
  // The imported profiles are persisted through the existing config endpoint.
  assert.match(appSource, /apiFetch\("\/api\/config\/local-file", \{[\s\S]*?buildConfigPayload\(nextEngine, nextProfiles, nextActiveProfileIds, nextGpt, nextBanana\)/);
  assert.match(i18nSource, /"config\.exportConfig": "导出配置"/);
  assert.match(i18nSource, /"config\.importConfig": "Import config"/);
  assert.match(i18nSource, /"config\.importDone":/);
  assert.match(i18nSource, /"config\.importInvalid":/);
  assert.match(i18nSource, /"config\.importDropHint":/);
  assert.match(i18nSource, /"config\.exportSavedTo":/);
});
