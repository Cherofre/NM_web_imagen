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
});

test("history-backed previews expose a direct view-details action", () => {
  assert.match(appSource, /function openPreviewHistoryContext\(\)/);
  assert.match(appSource, /previewImage\.historyEntryId/);
  assert.match(appSource, /onClick=\{openPreviewHistoryContext\}/);
  assert.match(i18nSource, /"preview\.viewHistoryDetails"/);
  assert.match(appSource, /target\.closest\("\.lightbox"\)/);
});
