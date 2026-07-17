import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const editorSource = fs.readFileSync(new URL("./MaskEditor.tsx", import.meta.url), "utf8");
const styleSource = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const i18nSource = fs.readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");

test("Studio exposes a first-reference mask editor and snapshots the mask into queued jobs", () => {
  assert.match(appSource, /import \{ MaskEditor, type MaskEditorResult \} from "\.\/MaskEditor"/);
  assert.match(appSource, /maskAttachment/);
  assert.match(appSource, /activeMaskAttachment/);
  assert.match(appSource, /maskFile:\s*currentMask\?\.maskFile/);
  assert.match(appSource, /<MaskEditor/);
  assert.match(appSource, /mask\.baseBadge/);
  assert.match(appSource, /mask\.appliedBadge/);
  assert.match(appSource, /index === 0 && maskCapability\.available/);
});

test("mask editor provides real canvas drawing, PNG export, undo redo and pan controls", () => {
  assert.match(editorSource, /onPointerDown/);
  assert.match(editorSource, /setPointerCapture/);
  assert.match(editorSource, /destination-out/);
  assert.match(editorSource, /toBlob/);
  assert.match(editorSource, /image\/png/);
  assert.match(editorSource, /mask\.brush/);
  assert.match(editorSource, /mask\.eraser/);
  assert.match(editorSource, /mask\.move/);
  assert.match(editorSource, /mask\.undo/);
  assert.match(editorSource, /mask\.redo/);
  assert.match(editorSource, /mask\.apply/);
  assert.match(editorSource, /event\.key === "Tab"/);
  assert.match(editorSource, /querySelectorAll<HTMLElement>/);
  assert.match(editorSource, /aria-label=\{t\("mask\.title"\)\}/);
});

test("mask editor follows the existing product vocabulary and remains usable on narrow screens", () => {
  assert.match(styleSource, /\.mask-editor-card/);
  assert.match(styleSource, /\.mask-editor-toolbar/);
  assert.match(styleSource, /\.mask-editor-stage/);
  assert.match(styleSource, /@media \(max-width: 720px\)[\s\S]*\.mask-editor-card/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mask-editor-card \.spin/);
  assert.match(styleSource, /\.mask-editor-card button:focus-visible/);
  assert.match(i18nSource, /"mask\.edit"/);
  assert.match(i18nSource, /"mask\.paintHint"/);
  assert.match(i18nSource, /"mask\.promptLimit"/);
  assert.match(i18nSource, /刷新页面后不会保留/);
  assert.match(i18nSource, /not kept after a page refresh/);
});
