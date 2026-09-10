import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildImageModelOptions,
  imageModelSelectValue,
} from "./imageModelOptions.ts";
import { profileFormSnapshot } from "./configProfiles.ts";

const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
const i18nSource = fs.readFileSync(path.resolve("src/i18n.ts"), "utf8");
const profilesSource = fs.readFileSync(path.resolve("src/configProfiles.ts"), "utf8");
const stylesSource = fs.readFileSync(path.resolve("src/styles.css"), "utf8");

test("chat model picker reuses the fetched catalogue and keeps friendly preset labels", () => {
  const presets = ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.5"];
  assert.deepEqual(
    buildImageModelOptions("gpt-5.6-sol", "", presets).map((item) => item.value),
    ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.5", "custom"],
  );
  // Once the relay has answered, the preset seeds step aside for real ids.
  assert.deepEqual(
    buildImageModelOptions("gpt-5.6-sol", "relay-chat-a\nrelay-chat-b", presets).map((item) => item.value),
    ["relay-chat-a", "relay-chat-b", "gpt-5.6-sol", "custom"],
  );
  assert.equal(imageModelSelectValue("gpt-5.6-luna", "", presets), "gpt-5.6-luna");
  assert.equal(imageModelSelectValue("relay-chat-a", "relay-chat-a", presets), "relay-chat-a");
  assert.equal(imageModelSelectValue("hand-written", "relay-chat-a", presets), "custom");
});

test("studio exposes one fetch path for the image, chat and Gemini model lists", () => {
  assert.match(appSource, /async function fetchModelListForTarget\(target: "image" \| "chat" \| "banana"\)/);
  assert.match(appSource, /async function fetchImageModelList\(\) \{\s*await fetchModelListForTarget\("image"\);\s*\}/);
  assert.match(appSource, /async function fetchChatModelList\(\) \{\s*await fetchModelListForTarget\("chat"\);\s*\}/);
  assert.match(appSource, /async function fetchBananaModelList\(\) \{\s*await fetchModelListForTarget\("banana"\);\s*\}/);
  assert.match(appSource, /chat_model_options: encodeModelOptions\(merged\)/);
  assert.match(appSource, /t\("config\.imageModelFetchDone", \{ count: merged\.length \}\)/);
  assert.match(appSource, /className="image-model-fetch-button" onClick=\{\(\) => void fetchChatModelList\(\)\}/);
  // The Gemini side reads the same catalogue with its own address field.
  assert.match(appSource, /const baseUrl = \(isBanana \? bananaForm\.api_base_url : gptForm\.base_url\)\.trim\(\);/);
  assert.match(appSource, /\? \{ engine: "banana", api_base_url: baseUrl, api_key: apiKey \}/);
  assert.match(appSource, /className="image-model-fetch-button" onClick=\{\(\) => void fetchBananaModelList\(\)\} disabled=\{bananaModelFetching\}/);
  assert.match(appSource, /value=\{imageModelSelectValue\(bananaForm\.model_type, bananaForm\.model_type_options, bananaModelPresets, "banana"\)\}/);
  assert.match(i18nSource, /"config\.modelNameHelp":/);
  assert.match(i18nSource, /"config\.customModelName":/);
});

test("chat is off unless the profile turns it on", () => {
  // An empty value (never configured) means off, so a fresh install has no chat.
  assert.match(appSource, /const chatSwitchOn = gptForm\.chat_enabled === "1";/);
  assert.match(appSource, /const chatEnabled = activeEngine !== "gpt-image-2" \|\| chatSwitchOn;/);
  assert.match(appSource, /if \(!chatEnabled && submitMode === "chat"\) setSubmitMode\("generate"\);/);
  assert.match(appSource, /\{chatEnabled \? \(\s*<div className="submit-mode-switch"/);
  assert.match(appSource, /<span className="submit-mode-static">\{t\("submit\.generate"\)\}<\/span>/);
  assert.match(appSource, /checked=\{chatSwitchOn\}/);
  assert.match(appSource, /chat_enabled: "0",/);
  assert.match(appSource, /chat_enabled: coerceSwitchFlag\(value\.chat_enabled, "0"\),/);
  assert.doesNotMatch(appSource, /chat_enabled !== "0"/);
  assert.match(appSource, /function setChatEnabled\(enabled: boolean\)[\s\S]*chat_enabled: enabled \? "1" : "0"[\s\S]*setSubmitMode\("generate"\)/);
  // Turning the switch off folds away the model and thinking-effort fields, and
  // the section rule only appears when those fields do.
  assert.match(appSource, /<Toggle\s*label=\{t\("config\.chatEnabled"\)\}[\s\S]*?checked=\{chatSwitchOn\}\s*onChange=\{setChatEnabled\}\s*\/>\s*\{chatSwitchOn && \(/);
  assert.match(appSource, /<div className="chat-config-section" aria-hidden="true" \/>\s*<Field label=\{t\("config\.chatModel"\)\}/);
  assert.match(appSource, /disabled=\{chatModelFetching\}/);
  assert.match(stylesSource, /\.chat-config-section \{/);
  assert.match(stylesSource, /\.connection-fields \.toggle \{[\s\S]*?width: fit-content;[\s\S]*?min-height: 42px;/);
  assert.match(stylesSource, /\.submit-mode-static \{/);
  assert.match(i18nSource, /"config\.chatEnabled": "启用聊天"/);
  assert.match(i18nSource, /"config\.chatEnabled": "Enable chat"/);
  assert.match(i18nSource, /"config\.chatEnabledHelp": "关闭后工具栏不再显示「聊天」入口/);
});

test("chat settings stay with the profile that declares them", () => {
  const current = { api_key: "", base_url: "", model: "m", model_options: "a", chat_model: "c", chat_model_options: "x", chat_enabled: "0" };
  const other = { base_url: "https://relay.example.com" };
  const snapshot = profileFormSnapshot(current, other);
  assert.equal(snapshot.model_options, "");
  assert.equal(snapshot.chat_model_options, "");
  assert.equal(snapshot.chat_enabled, "");
  // A profile that does define its own values keeps them.
  const withOwnChat = profileFormSnapshot(current, { chat_enabled: "1", chat_model_options: "own" });
  assert.equal(withOwnChat.chat_enabled, "1");
  assert.equal(withOwnChat.chat_model_options, "own");
});
