import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
const i18nSource = fs.existsSync(path.resolve("src/i18n.ts"))
  ? fs.readFileSync(path.resolve("src/i18n.ts"), "utf8")
  : "";
const i18n = await import("./i18n.ts");

test("studio has a lightweight bilingual i18n layer", () => {
  assert.match(i18nSource, /export type AppLanguage = "zh-CN" \| "en";/);
  assert.match(i18nSource, /export const DEFAULT_LANGUAGE: AppLanguage = "zh-CN";/);
  assert.match(i18nSource, /export function createTranslator/);
  assert.match(i18nSource, /export function resolveInitialLanguage/);
  assert.match(i18nSource, /export const messages/);
  assert.match(i18nSource, /"app\.title"/);
  assert.match(i18nSource, /"Generate images and chat"/);
});

test("studio exposes a persistent language switcher", () => {
  assert.match(appSource, /const \[language, setLanguage\]/);
  assert.match(appSource, /localStorage\.setItem\(LANGUAGE_STORAGE_KEY, language\)/);
  assert.match(appSource, /document\.documentElement\.lang = language;/);
  assert.match(appSource, /className="language-switcher"/);
  assert.match(appSource, /aria-label=\{t\("language\.switcher"\)\}/);
  assert.match(appSource, /onClick=\{\(\) => setLanguage\("zh-CN"\)\}/);
  assert.match(appSource, /onClick=\{\(\) => setLanguage\("en"\)\}/);
});

test("studio translates user-visible system states without translating user content", () => {
  assert.match(appSource, /t\("queue\.title"\)/);
  assert.match(appSource, /t\("submit\.generate"\)/);
  assert.match(appSource, /t\("submit\.chat"\)/);
  assert.match(appSource, /t\("config\.testConnection"\)/);
  assert.match(appSource, /t\("status\.historyApplied"\)/);
  assert.match(appSource, /autoSummary:\s*t\("composer\.autoSizeSummary"\)/);
  assert.match(appSource, /customPrefix:\s*t\("config\.custom"\)/);
  assert.match(i18nSource, /"composer\.autoSizeSummary": "Auto size decided by upstream"/);
  assert.match(i18nSource, /"composer\.sessionPromptShort": "Session"/);
  assert.match(i18nSource, /"composer\.sessionPromptUnsetShort": "Unset"/);
  assert.match(i18nSource, /"composer\.expandPromptShort": "Expand"/);
  assert.match(i18nSource, /"inspiration\.characterPoster\.title": "Collectible Character Poster"/);
  assert.match(appSource, /formatUpstreamError\(t,/);
  assert.match(appSource, /historyDetail\.prompt \|\| t\("history\.noPrompt"\)/);
  assert.match(appSource, /turn\.prompt/);
  assert.doesNotMatch(appSource, /\bt\(turn\.prompt\)/);
});

test("i18n runtime handles fallback, interpolation, and browser language", () => {
  const t = i18n.createTranslator("en");
  assert.equal(t("composer.count", { count: 3 }), "Count 3");
  assert.equal(t("missing.key"), "missing.key");
  assert.equal(i18n.formatUpstreamError(t, "  raw upstream error  "), "raw upstream error");

  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: "en-US" },
  });
  try {
    assert.equal(i18n.resolveInitialLanguage({ getItem: () => null }), "en");
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      delete globalThis.navigator;
    }
  }
});

test("chat references and real generation diagnostics use exact bilingual disclosures", () => {
  assert.equal(
    i18n.messages["zh-CN"]["reference.chatNotSent"],
    "聊天暂不发送参考图；这些图片会保留，切回生图后仍可使用。",
  );
  assert.equal(
    i18n.messages.en["reference.chatNotSent"],
    "Chat does not currently send reference images. These images will be kept and remain available after you switch back to image generation.",
  );
  assert.equal(
    i18n.messages["zh-CN"]["submit.chatTooltip"],
    "调用聊天接口，仅发送文字上下文；当前不发送参考图。",
  );
  assert.equal(
    i18n.messages.en["submit.chatTooltip"],
    "Call the chat API and send text context only; reference images are not currently sent.",
  );
  assert.equal(
    i18n.messages["zh-CN"]["config.generationDiagnosticBilling"],
    "生图诊断会发起一次最小真实请求，上游可能计费。",
  );
  assert.equal(
    i18n.messages.en["config.generationDiagnosticBilling"],
    "The image-generation diagnostic sends one minimal real request and may be billed by the upstream provider.",
  );
  assert.match(appSource, /title=\{submitMode === "chat" \? t\("submit\.chatTooltip"\)/);
  assert.match(appSource, /aria-label=\{submitMode === "chat" \? t\("submit\.chatTooltip"\)/);
  assert.match(appSource, /t\("config\.generationDiagnosticBilling"\)/);
});
