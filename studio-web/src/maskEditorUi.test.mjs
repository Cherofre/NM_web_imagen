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
  assert.match(appSource, /currentMask\.previewFile/);
  assert.match(appSource, /className="turn-reference-thumb turn-mask-thumb"/);
  assert.match(appSource, /isMaskSnapshot:\s*true/);
  assert.match(styleSource, /\.turn-mask-thumb/);
  assert.match(i18nSource, /"mask\.snapshot"/);
});

test("regenerate persists and restores the original alpha mask without a silent unmasked fallback", () => {
  assert.match(appSource, /maskAttachment\?: MaskAttachment<File> \| null;/);
  assert.match(appSource, /maskFileSnapshot\?: ReferenceSnapshot/);
  assert.match(appSource, /const turnMaskPayloadsRef = useRef<Map<string, ReusableMaskPayload<File>>>\(new Map\(\)\);/);
  assert.match(appSource, /async function loadReusableMaskPayloadFromTurn/);
  assert.match(appSource, /const cached = turnMaskPayloadsRef\.current\.get\(turn\.id\);/);
  assert.match(appSource, /turn\.maskFileSnapshot\?\.src/);
  assert.match(appSource, /normalizeMaskEncoding\(turn\.meta\?\.mask_encoding\)/);
  assert.match(appSource, /turnMaskPayloadsRef\.current\.set\(turn\.id, payload\)/);
  assert.match(appSource, /sourceUsesMask \? loadReusableMaskPayloadFromTurn\(turn\) : Promise\.resolve\(null\)/);
  assert.match(appSource, /if \(sourceUsesMask && !reusableMask\) \{[\s\S]*setNotice\(t\("mask\.regenerateUnavailable"\)\);[\s\S]*return;/);
  assert.match(appSource, /restoreReusableMaskAttachment\(reusableMask, turnReferences\[0\]\)/);
  assert.match(appSource, /maskAttachment:\s*regeneratedMask/);
  assert.match(appSource, /maskSnapshot:\s*turn\.maskSnapshot/);
  assert.match(appSource, /maskFileSnapshot:\s*turn\.maskFileSnapshot/);
  assert.match(appSource, /createReferenceSnapshots\(\[currentMask\.maskFile\]\)/);
  assert.match(appSource, /turnMaskPayloadsRef\.current\.set\(turnId, reusableMaskPayload\(currentMask\)\)/);
  assert.match(appSource, /const requestedMaskAttachment = overrides\.maskAttachment === undefined \? maskAttachment : overrides\.maskAttachment;/);
  assert.match(appSource, /activeMaskAttachment\(requestedMaskAttachment, currentReferences\)/);
  assert.match(i18nSource, /"mask\.regenerateWithMask"/);
  assert.match(i18nSource, /"mask\.regenerateNeedsRedraw"/);
  assert.match(i18nSource, /"mask\.regenerateUnavailable"/);
});

test("copying turn references also restores the reusable mask when available", () => {
  const copyStart = appSource.indexOf("async function copyReferencesFromTurn");
  const copyEnd = appSource.indexOf("async function regenerateFromTurn", copyStart);
  const copySource = appSource.slice(copyStart, copyEnd);

  assert.match(copySource, /loadReusableMaskPayloadFromTurn\(turn\)/);
  assert.match(copySource, /restoreReusableMaskAttachment\(reusableMask, baseFile\)/);
  assert.match(copySource, /referencesWithMaskBase\(\[\.\.\.filesToAdd, \.\.\.current\], baseFile, limit\)/);
  assert.match(copySource, /setMaskAttachment\(copiedMask\)/);
  assert.match(copySource, /setActiveEngine\("gpt-image-2"\)/);
  assert.match(copySource, /mask\.copyUnavailable/);
  assert.match(copySource, /mask\.copyBaseUnavailable/);
  assert.match(appSource, /function copyReferencesTurnLabel/);
  assert.match(appSource, /copyReferencesTurnLabel\(turn\)/);
  assert.match(i18nSource, /"reference\.copyWithMask"/);
  assert.match(i18nSource, /"mask\.copiedWithReferences"/);
  assert.match(i18nSource, /"mask\.copiedWithReferencesLimited"/);
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

test("mask editor can keep official alpha semantics or opt into a reverse-alpha gateway mode", () => {
  assert.match(editorSource, /encoding:\s*MaskEncoding/);
  assert.match(editorSource, /if \(encoding === "standard"\) \{[\s\S]*destination-out[\s\S]*\} else \{[\s\S]*source-in/);
  assert.match(editorSource, /setEncoding\(event\.target\.value as MaskEncoding\)/);
  assert.match(editorSource, /select:not\(:disabled\)/);
  assert.match(editorSource, /mask\.encodingLabel/);
  assert.match(editorSource, /mask\.encodingCompat/);
  assert.match(editorSource, /className="mask-editor-footer-actions"/);
  assert.match(appSource, /encoding:\s*result\.encoding/);
  assert.match(appSource, /initialEncoding=\{activeComposerMask\?\.encoding\}/);
  assert.match(styleSource, /\.mask-editor-encoding/);
  assert.match(i18nSource, /"mask\.encodingHelp"/);
});

test("masked submissions use model-side guidance and keep broad prompts non-blocking", () => {
  assert.match(appSource, /maskPromptNeedsSoftGuidance/);
  assert.match(appSource, /mask\.promptBroadGuidance/);
  assert.match(appSource, /composer-textarea-wrap has-mask-guidance/);
  assert.match(appSource, /className="mask-prompt-guidance-inline"/);
  assert.doesNotMatch(appSource, /className=\{`mask-prompt-guidance\$\{/);
  assert.match(appSource, /<Info size=\{11\} aria-hidden="true" \/>/);
  assert.doesNotMatch(appSource, /mask\.promptTargetRequired/);
  assert.match(appSource, /data\.append\("mask_encoding"/);
  assert.doesNotMatch(appSource, /data\.append\("strict_mask"/);
  assert.match(appSource, /maskEncoding:\s*currentMask\?\.encoding/);
  assert.match(appSource, /mask_guidance:\s*Boolean\(currentMask\)/);
  assert.match(appSource, /turn\.meta\?\.mask_guidance/);
  assert.match(i18nSource, /"mask\.strictProtection"/);
  assert.match(i18nSource, /"mask\.promptPlaceholder"/);
  assert.match(i18nSource, /描述遮罩区域要怎么改，例如：换成一束花/);
  assert.match(i18nSource, /Describe how the masked area should change, for example: replace it with a bouquet/);
  assert.match(i18nSource, /未指定具体结果，将由模型结合画面自行选择/);
  assert.match(i18nSource, /No specific result was provided; the model will choose from the image context/);
  assert.match(i18nSource, /不做本地硬切拼接/);
  assert.match(styleSource, /\.mask-prompt-guidance-inline/);
  assert.match(styleSource, /\.composer-textarea-wrap\.has-mask-guidance textarea/);
  assert.match(styleSource, /@media \(max-width: 560px\)[\s\S]*\.mask-prompt-guidance-inline\s*\{[\s\S]*display: none;/);
  assert.doesNotMatch(styleSource, /\.mask-prompt-guidance\s*\{/);
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

test("mask editor derives fit from the actual stage instead of viewport subtraction", () => {
  assert.match(editorSource, /useLayoutEffect/);
  assert.match(editorSource, /stageRef/);
  assert.match(editorSource, /maskCanvasFitScale\(\s*stage\.clientWidth,\s*stage\.clientHeight,\s*dimensions\.width,\s*dimensions\.height/);
  assert.match(editorSource, /new ResizeObserver\(updateFitScale\)/);
  assert.match(editorSource, /ref=\{stageRef\}/);
  assert.match(editorSource, /width:\s*fittedWidth/);
  assert.match(editorSource, /height:\s*fittedHeight/);
  assert.doesNotMatch(styleSource, /max-height:\s*calc\(100vh - (?:290|275)px\)/);
  assert.match(styleSource, /\.mask-editor-canvas-stack canvas\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*max-width:\s*none;[\s\S]*max-height:\s*none;/);
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
  assert.match(i18nSource, /可用于再次生成/);
  assert.match(i18nSource, /刷新后不能继续编辑原遮罩/);
  assert.match(i18nSource, /saved for regeneration/);
  assert.match(i18nSource, /cannot be edited after refresh/);
});
