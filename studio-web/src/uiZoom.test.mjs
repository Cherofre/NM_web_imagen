import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  UI_ZOOM_MAX,
  UI_ZOOM_MIN,
  UI_ZOOM_STEPS,
  UI_ZOOM_STORAGE_KEY,
  applyUiZoom,
  clampUiZoom,
  formatUiZoom,
  readStoredUiZoom,
  stepUiZoom,
  storeUiZoom,
  zoomActionForEvent,
} from "./uiZoom.ts";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

test("clamp keeps zoom inside the supported range and survives junk input", () => {
  assert.equal(clampUiZoom("1.25"), 1.25);
  assert.equal(clampUiZoom(0.1), UI_ZOOM_MIN);
  assert.equal(clampUiZoom(9), UI_ZOOM_MAX);
  assert.equal(clampUiZoom("nonsense"), 1);
  assert.equal(clampUiZoom(undefined), 1);
  assert.equal(clampUiZoom(1.234), 1.23);
});

test("stepping walks the fixed ladder and stops at both ends", () => {
  assert.equal(stepUiZoom(1, "in"), 1.1);
  assert.equal(stepUiZoom(1, "out"), 0.9);
  assert.equal(stepUiZoom(1.4, "in"), UI_ZOOM_MAX);
  assert.equal(stepUiZoom(UI_ZOOM_MAX, "in"), UI_ZOOM_MAX);
  assert.equal(stepUiZoom(0.8, "out"), UI_ZOOM_MIN);
  assert.equal(stepUiZoom(UI_ZOOM_MIN, "out"), UI_ZOOM_MIN);
  assert.equal(stepUiZoom(1.4, "reset"), 1);
  // A hand written value snaps onto the ladder instead of getting stuck.
  assert.equal(stepUiZoom(1.2, "in"), 1.25);
  assert.equal(stepUiZoom("1.2", "out"), 1.1);
  assert.deepEqual(UI_ZOOM_STEPS, [...UI_ZOOM_STEPS].sort((a, b) => a - b));
});

test("zoom reads as a percentage", () => {
  assert.equal(formatUiZoom(1), "100%");
  assert.equal(formatUiZoom(0.8), "80%");
  assert.equal(formatUiZoom(1.25), "125%");
  assert.equal(formatUiZoom("bogus"), "100%");
});

test("only the browser zoom shortcuts map to an action", () => {
  assert.equal(zoomActionForEvent({ key: "=", ctrlKey: true }), "in");
  assert.equal(zoomActionForEvent({ key: "+", ctrlKey: true }), "in");
  assert.equal(zoomActionForEvent({ key: "Add", ctrlKey: true }), "in");
  assert.equal(zoomActionForEvent({ key: "-", ctrlKey: true }), "out");
  assert.equal(zoomActionForEvent({ key: "_", ctrlKey: true }), "out");
  assert.equal(zoomActionForEvent({ key: "Subtract", metaKey: true }), "out");
  assert.equal(zoomActionForEvent({ key: "0", ctrlKey: true }), "reset");
  assert.equal(zoomActionForEvent({ key: "=" }), null);
  assert.equal(zoomActionForEvent({ key: "=", ctrlKey: true, altKey: true }), null);
  assert.equal(zoomActionForEvent({ key: "a", ctrlKey: true }), null);
  assert.equal(zoomActionForEvent(null), null);
});

test("zoom level round trips through storage", () => {
  const storage = fakeStorage();
  storeUiZoom(1.25, storage);
  assert.equal(storage.data[UI_ZOOM_STORAGE_KEY], "1.25");
  assert.equal(readStoredUiZoom(storage), 1.25);

  assert.equal(readStoredUiZoom(fakeStorage({ [UI_ZOOM_STORAGE_KEY]: "99" })), UI_ZOOM_MAX);
  assert.equal(readStoredUiZoom(fakeStorage({ [UI_ZOOM_STORAGE_KEY]: "junk" })), 1);
  assert.equal(readStoredUiZoom(null), 1);

  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readStoredUiZoom(broken), 1);
  assert.doesNotThrow(() => storeUiZoom(1.1, broken));
});

test("zoom writes the stored level and falls back to CSS zoom without the desktop shell", async () => {
  const root = { style: { zoom: "", removeProperty: () => {} } };

  // Outside the desktop shell the Tauri module cannot load, so every call has to
  // end at the CSS fallback instead of throwing at the caller.
  await applyUiZoom(1.25, { desktop: true, root });
  assert.equal(root.style.zoom, "1.25");

  await applyUiZoom("99", { root });
  assert.equal(root.style.zoom, String(UI_ZOOM_MAX));
});

test("studio wires the desktop zoom shortcuts and the permission they need", () => {
  const appSource = fs.readFileSync(path.resolve("src/App.tsx"), "utf8");
  const i18nSource = fs.readFileSync(path.resolve("src/i18n.ts"), "utf8");
  const capability = JSON.parse(fs.readFileSync(path.resolve("src-tauri/capabilities/default.json"), "utf8"));
  assert.match(appSource, /readStoredUiZoom\(typeof window === "undefined" \? null : window\.localStorage\)/);
  assert.match(appSource, /void applyUiZoom\(uiZoom, \{ desktop: desktopMode \}\)/);
  assert.match(appSource, /window\.addEventListener\("keydown", onZoomKeyDown, true\)/);
  assert.match(appSource, /window\.addEventListener\("wheel", onZoomWheel, \{ capture: true, passive: false \}\)/);
  assert.match(appSource, /t\("status\.uiZoomReset", \{ percent: formatUiZoom\(next\) \}\)/);
  assert.match(
    appSource,
    /target\.closest\("\.mask-editor-stage, \.lightbox-stage"\)/,
    "Ctrl+wheel inside the mask editor or the lightbox must keep that stage's own zoom",
  );
  assert.match(
    fs.readFileSync(path.resolve("src/uiZoom.ts"), "utf8"),
    /target\?\.style\.removeProperty\("zoom"\)/,
    "native zoom must clear a leftover CSS zoom so the two scales cannot multiply",
  );
  assert.match(i18nSource, /"status\.uiZoom": "界面缩放 \{percent\}"/);
  assert.match(i18nSource, /"status\.uiZoomReset": "界面缩放已重置为 \{percent\}"/);
  assert.ok(
    capability.permissions.includes("core:webview:allow-set-webview-zoom"),
    "native zoom needs core:webview:allow-set-webview-zoom",
  );
});
