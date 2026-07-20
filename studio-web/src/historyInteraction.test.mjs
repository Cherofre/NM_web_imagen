import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = fs.readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");

test("history detail remembers whether it came from the sidebar, quick history or browser", () => {
  assert.match(appSource, /type PreviewImage = \{[\s\S]*historyEntryId\?: string;[\s\S]*historyOrigin\?: HistoryOrigin;/);
  assert.match(appSource, /function openHistoryContext\(entry: HistoryEntry, origin: HistoryOrigin = "browser"\)/);
  assert.match(appSource, /setHistorySurface\(\{ mode: "browser", detailId: entry\.id, origin \}\)/);
  assert.match(appSource, /openHistoryContext\(entry, "sidebar"\)/);
  assert.match(appSource, /historyOrigin: "quick"/);
});

test("Escape closes only the image preview before changing the history surface", () => {
  const previewHandler = appSource.slice(
    appSource.indexOf("function handlePreviewKeyDown"),
    appSource.indexOf("async function outputReferenceFile"),
  );
  assert.match(previewHandler, /event\.key === "Escape"[\s\S]*closePreviewImage\(\)/);
  assert.doesNotMatch(previewHandler, /closeOnEscape\(event\)/);
  assert.match(appSource, /onKeyDown=\{handleHistorySurfaceKeyDown\}/);

  const historyHandler = appSource.slice(
    appSource.indexOf("function handleHistorySurfaceKeyDown"),
    appSource.indexOf("function handlePreviewKeyDown"),
  );
  assert.match(historyHandler, /if \(previewImage\) \{[\s\S]*closePreviewImage\(\);[\s\S]*return;[\s\S]*escapeHistorySurface\(\);/);
  assert.match(appSource, /const previewDialogRef = useRef<HTMLDivElement \| null>\(null\);/);
  assert.match(appSource, /if \(!previewImage\) return undefined;[\s\S]*previewDialogRef\.current\?\.focus\(\)/);
  assert.match(appSource, /ref=\{previewDialogRef\}[\s\S]*onKeyDown=\{handlePreviewKeyDown\}/);
});

test("history-backed previews expose a direct view-details action", () => {
  assert.match(appSource, /function openPreviewHistoryContext\(\)/);
  assert.match(appSource, /previewImage\.historyEntryId/);
  assert.match(appSource, /onClick=\{openPreviewHistoryContext\}/);
  assert.match(i18nSource, /"preview\.viewHistoryDetails"/);
  assert.match(appSource, /target\.closest\("\.lightbox"\)/);
});

test("preview actions follow workflow priority and keep close at the far right", () => {
  const previewStart = appSource.indexOf("{previewImage && (");
  const toolbarEnd = appSource.indexOf("className={`lightbox-stage", previewStart);
  const toolbar = appSource.slice(previewStart, toolbarEnd);
  const positions = [
    toolbar.indexOf("preview-history-action"),
    toolbar.indexOf("preview-mask-action"),
    toolbar.indexOf("addOutputAsReference(previewImage.src"),
    toolbar.indexOf("<a href={previewImage.src}"),
    toolbar.indexOf('<button type="button" onClick={closePreviewImage} aria-label={t("preview.close")}'),
  ];
  assert.ok(positions.every((value) => value >= 0), positions);
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
});

test("quick history stays open while its own thumbnail grid scrolls", () => {
  const effectStart = appSource.indexOf('if (historySurface.mode !== "quick") return undefined;');
  const effectEnd = appSource.indexOf('}, [historySurface.mode]);', effectStart);
  const effect = appSource.slice(effectStart, effectEnd);
  assert.match(effect, /function closeForViewportScroll\(event: Event\)/);
  assert.match(effect, /target\.closest\("\.history-quick-popover"\)[\s\S]*return;/);
  assert.match(effect, /window\.addEventListener\("scroll", closeForViewportScroll, true\)/);
  assert.match(effect, /window\.removeEventListener\("scroll", closeForViewportScroll, true\)/);
});
