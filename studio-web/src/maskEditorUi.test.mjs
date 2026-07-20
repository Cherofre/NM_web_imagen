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

test("applied masks create a lightweight review snapshot on the submitted turn", () => {
  assert.match(editorSource, /previewFile:\s*File/);
  assert.match(editorSource, /maskPreviewDimensions/);
  assert.match(editorSource, /new File\(\[previewBlob\], "mask-preview\.webp"/);
  assert.match(appSource, /maskSnapshot\?: ReferenceSnapshot/);
  assert.match(appSource, /maskSnapshot:\s*turn\.maskSnapshot/);
  assert.match(appSource, /currentMask\?\.previewFile/);
  assert.match(appSource, /className="turn-reference-thumb turn-mask-thumb"/);
  assert.match(appSource, /isMaskSnapshot:\s*true/);
  assert.match(styleSource, /\.turn-mask-thumb/);
  assert.match(i18nSource, /"mask\.snapshot"/);
});

test("result preview can become the first reference and open mask editing directly", () => {
  assert.match(appSource, /async function editPreviewMask/);
  assert.match(appSource, /setActiveEngine\("gpt-image-2"\)/);
  assert.match(appSource, /setSubmitMode\("generate"\)/);
  assert.match(appSource, /referencesWithMaskBase\(current, file, 16\)/);
  assert.match(appSource, /const keepCurrentMask = references\[0\] === file/);
  assert.match(appSource, /if \(!keepCurrentMask\) setMaskAttachment\(null\)/);
  assert.match(appSource, /setMaskEditorOpen\(true\)/);
  assert.match(appSource, /className="preview-mask-action"/);
  assert.match(appSource, /onClick=\{\(\) => void editPreviewMask\(previewImage\)\}/);
  assert.match(i18nSource, /"preview\.editMask"/);
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

test("mask editor exposes discoverable keyboard shortcuts for tools, brush size and zoom", () => {
  assert.match(editorSource, /case "b":/);
  assert.match(editorSource, /case "e":/);
  assert.match(editorSource, /case "h":/);
  assert.match(editorSource, /case "\[":/);
  assert.match(editorSource, /case "\]":/);
  assert.match(editorSource, /case "-":/);
  assert.match(editorSource, /case "\+":/);
  assert.match(editorSource, /case "0":/);
  assert.match(editorSource, /aria-keyshortcuts="B"/);
  assert.match(editorSource, /aria-keyshortcuts="\[ \]"/);
  assert.match(editorSource, /aria-keyshortcuts="0"/);
  assert.match(i18nSource, /"mask\.shortcuts"/);
});

test("mask editor shows the real brush footprint under the pointer", () => {
  assert.match(editorSource, /cursorCanvasRef/);
  assert.match(editorSource, /drawBrushCursor/);
  assert.match(editorSource, /brushSize \/ 2/);
  assert.match(editorSource, /onPointerEnter=\{syncBrushCursor\}/);
  assert.match(editorSource, /onPointerLeave=\{hideBrushCursor\}/);
  assert.match(editorSource, /className="mask-editor-brush-cursor"/);
  assert.match(styleSource, /\.mask-editor-brush-cursor\s*\{[\s\S]*?pointer-events:\s*none/);
});

test("mask editor follows the existing product vocabulary and remains usable on narrow screens", () => {
  assert.match(styleSource, /\.mask-editor-card/);
  assert.match(styleSource, /\.mask-editor-toolbar/);
  assert.match(styleSource, /\.mask-editor-stage/);
  assert.match(editorSource, /<span>\{t\("mask\.paintHint"\)\}<\/span>/);
  assert.doesNotMatch(editorSource, /<span>\{t\("mask\.promptLimit"\)\}<\/span>/);
  assert.match(editorSource, /mask-editor-shortcut-help/);
  assert.match(styleSource, /@media \(max-width: 720px\)[\s\S]*\.mask-editor-card/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.spin/);
  assert.match(styleSource, /\.mask-editor-card button:focus-visible/);
  assert.match(i18nSource, /"mask\.edit"/);
  assert.match(i18nSource, /"mask\.paintHint"/);
  assert.match(i18nSource, /"mask\.promptLimit"/);
  assert.match(i18nSource, /"mask\.shortcutHelp"/);
  assert.match(i18nSource, /刷新后不能继续编辑原遮罩/);
  assert.match(i18nSource, /cannot be edited after refresh/);
});
