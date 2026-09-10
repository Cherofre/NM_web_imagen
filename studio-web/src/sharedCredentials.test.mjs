import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CREDENTIAL_FIELDS,
  CREDENTIAL_URL_FIELD,
  findSharedPartner,
  isGeneratedProfileName,
  isPlaceholderAddress,
  isSharedCredential,
  mirroredCredentialPatch,
  normalizeCredentialRef,
  otherEngine,
  sharedCredentialPatch,
  sharedPartnerCredentialValues,
  sharedProfileName,
} from "./sharedCredentials.ts";

const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
const i18nSource = fs.readFileSync(path.resolve("src/i18n.ts"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
const appPySource = fs.readFileSync(path.resolve("../app.py"), "utf8");

test("the credential flag is a shared/independent switch", () => {
  assert.equal(normalizeCredentialRef("shared"), "shared");
  assert.equal(normalizeCredentialRef(" shared "), "shared");
  // Legacy files named the source engine; that meant the same thing.
  assert.equal(normalizeCredentialRef("gpt-image-2"), "shared");
  assert.equal(normalizeCredentialRef("banana"), "shared");
  assert.equal(normalizeCredentialRef("midjourney"), "");
  assert.equal(normalizeCredentialRef(""), "");
  assert.equal(normalizeCredentialRef(undefined), "");
  assert.equal(normalizeCredentialRef(null), "");
  assert.equal(isSharedCredential({ credential_ref: "shared" }), true);
  assert.equal(isSharedCredential({}), false);
  assert.equal(otherEngine("banana"), "gpt-image-2");
  assert.equal(otherEngine("gpt-image-2"), "banana");
  assert.deepEqual(CREDENTIAL_FIELDS, ["api_key", "base_url", "api_base_url"]);
  assert.equal(CREDENTIAL_URL_FIELD["gpt-image-2"], "base_url");
  assert.equal(CREDENTIAL_URL_FIELD.banana, "api_base_url");
});

test("enabling sharing pulls both the key and the address across engines", () => {
  // Turned on from the Gemini page: the GPT key and address must arrive here,
  // which is what makes the Gemini tab usable without retyping anything.
  const patch = sharedCredentialPatch("banana", {
    "gpt-image-2": { api_key: "sk-secret", base_url: "http://64.186.244.43:12001" },
    banana: { api_key: "", api_base_url: "https://banana-api.example.com" },
  });
  assert.equal(patch.api_key, "sk-secret");
  assert.equal(patch.base_url, "http://64.186.244.43:12001");
  assert.equal(patch.api_base_url, "http://64.186.244.43:12001");

  // The side the user is on wins when it has something real to offer; the shared
  // credential means one key and one address, so both fields end up identical.
  const fromGpt = sharedCredentialPatch("gpt-image-2", {
    "gpt-image-2": { api_key: "sk-gpt", base_url: "http://relay.local" },
    banana: { api_key: "sk-banana", api_base_url: "http://relay.local/gemini" },
  });
  assert.equal(fromGpt.api_key, "sk-gpt");
  assert.equal(fromGpt.base_url, "http://relay.local");
  assert.equal(fromGpt.api_base_url, "http://relay.local");
});

test("placeholder addresses never win over real ones and nothing is blanked out", () => {
  const patch = sharedCredentialPatch("banana", {
    "gpt-image-2": { api_key: "sk-secret", base_url: "https://gpt-image-api.example.com" },
    banana: { api_key: "", api_base_url: "http://64.186.244.43:12001" },
  });
  assert.equal(patch.api_key, "sk-secret");
  assert.equal(patch.base_url, "http://64.186.244.43:12001");
  assert.equal(patch.api_base_url, "http://64.186.244.43:12001");
  assert.equal(isPlaceholderAddress("https://banana-api.example.com"), true);
  assert.equal(isPlaceholderAddress(""), true);
  assert.equal(isPlaceholderAddress("http://64.186.244.43:12001"), false);
  // Both empty stays empty instead of inventing a value.
  const empty = sharedCredentialPatch("gpt-image-2", { "gpt-image-2": {}, banana: {} });
  assert.equal(empty.api_key, "");
  assert.equal(empty.base_url, "");
});

test("editing one side mirrors onto the other while sharing is on", () => {
  assert.deepEqual(
    mirroredCredentialPatch("gpt-image-2", { api_key: "sk-new" }, true),
    { api_key: "sk-new" },
  );
  assert.deepEqual(
    mirroredCredentialPatch("gpt-image-2", { base_url: "http://relay.local" }, true),
    { api_base_url: "http://relay.local" },
  );
  assert.deepEqual(
    mirroredCredentialPatch("banana", { api_base_url: "http://relay.local" }, true),
    { base_url: "http://relay.local" },
  );
  // Models are engine specific and must never be mirrored.
  assert.deepEqual(mirroredCredentialPatch("gpt-image-2", { model: "sunburst" }, true), {});
  assert.deepEqual(mirroredCredentialPatch("banana", { model_type: "gemini" }, true), {});
  // Nothing is mirrored while the credential layer is independent.
  assert.deepEqual(mirroredCredentialPatch("gpt-image-2", { api_key: "x" }, false), {});
});

test("a shared connection carries one name on both tabs", () => {
  // The hand written name wins over a generated one, whichever tab it is on.
  assert.equal(sharedProfileName("gpt-image-2", { "gpt-image-2": "SillyDream", banana: "默认配置" }), "SillyDream");
  assert.equal(sharedProfileName("banana", { "gpt-image-2": "SillyDream", banana: "默认配置" }), "SillyDream");
  assert.equal(sharedProfileName("banana", { "gpt-image-2": "默认配置", banana: "新配置 3" }), "新配置 3");
  assert.equal(sharedProfileName("gpt-image-2", { "gpt-image-2": "New profile 2", banana: "Default" }), "New profile 2");
  assert.equal(sharedProfileName("banana", { "gpt-image-2": "默认配置", banana: "默认配置" }), "默认配置");
  assert.equal(sharedProfileName("banana", { "gpt-image-2": "", banana: "" }), "");
  assert.equal(isGeneratedProfileName("默认配置"), true);
  assert.equal(isGeneratedProfileName("新配置 3"), true);
  assert.equal(isGeneratedProfileName("New profile 12"), true);
  assert.equal(isGeneratedProfileName("SillyDream"), false);
  assert.equal(isGeneratedProfileName(""), true);
});

test("the config drawer carries its own engine tabs", () => {
  assert.match(appSource, /const \[drawerEngineState, setDrawerEngineState\] = useState<Engine>\("gpt-image-2"\);/);
  assert.match(appSource, /function selectEngineInDrawer\(engine: Engine\) \{[\s\S]*?clearDiagnosticsResult\(\);\s*setDiagnosticsResult\(null\);\s*setDrawerEngineState\(engine\);/);
  assert.match(appSource, /<div className="drawer-engine-tabs mode-tabs" role="tablist" aria-label=\{t\("app\.selectEngine"\)\}>/);
  assert.match(appSource, /\{\(\["gpt-image-2", "banana"\] as Engine\[\]\)\.map\(\(engine\) => \(/);
  assert.match(appSource, /onClick=\{\(\) => selectEngineInDrawer\(engine\)\}/);
  assert.match(stylesSource, /\.drawer-engine-tabs \{/);
  // Managing the other engine inside the drawer never moves the workspace engine.
  assert.match(appSource, /aria-selected=\{drawerEngine === engine\}/);
  assert.match(appSource, /\{drawerProfiles\.map\(\(profile\) => \{/);
  assert.match(appSource, /<input placeholder=\{drawerProfileName\} value=\{drawerProfile\?\.name \|\| ""\} onChange=\{\(event\) => updateActiveProfileName\(drawerEngine, event\.target\.value\)\} \/>/);
  assert.match(appSource, /onClick=\{\(\) => addConfigProfile\(drawerEngine\)\}/);
  assert.match(appSource, /onClick=\{\(\) => void runDiagnostics\(drawerEngine\)\} disabled=\{diagnosticsRunning \|\| !drawerHasCompleteConfig\}/);
  assert.match(appSource, /if \(connectionOpen\) setDrawerEngineState\(activeEngine\);[\s\S]*?\}, \[connectionOpen\]\);/);
  assert.doesNotMatch(appSource, /function selectEngineInDrawer\(engine: Engine\) \{[\s\S]{0,200}?setActiveEngine\(engine\);/);
  // The drawer tabs sit next to the title, and the old hint line is gone.
  assert.match(appSource, /<div className="drawer-head connection-drawer-head">\s*<h2>\{t\("config\.drawerTitle"\)\}<\/h2>\s*<div className="drawer-engine-tabs mode-tabs"/);
  assert.doesNotMatch(appSource, /t\("config\.drawerHint"\)/);
  assert.match(stylesSource, /\.connection-drawer-head \{[\s\S]*?align-items: center;/);
});

test("sharing uses an unambiguous persistent pair, never an active profile or name", () => {
  const profiles = [
    { id: "a", engine: "banana", name: "Same name", form: { credential_ref: "shared", credential_pair_id: "pair-a" } },
    { id: "b", engine: "banana", name: "Same name", form: { credential_ref: "shared", credential_pair_id: "pair-b" } },
  ];
  assert.equal(findSharedPartner(profiles, "gpt-image-2", "pair-a")?.id, "a");
  assert.equal(findSharedPartner(profiles, "gpt-image-2", "pair-b")?.id, "b");
  assert.equal(findSharedPartner(profiles, "gpt-image-2", ""), null);
  assert.equal(findSharedPartner(profiles, "gpt-image-2", "missing"), null);
  assert.equal(findSharedPartner([...profiles, { ...profiles[0], id: "duplicate" }], "gpt-image-2", "pair-a"), null);
  assert.deepEqual(sharedPartnerCredentialValues("gpt-image-2", { api_key: "test", base_url: "https://a.invalid" }), { api_key: "test", api_base_url: "https://a.invalid" });
  assert.match(appSource, /checked=\{sharedCredential\}/);
});
