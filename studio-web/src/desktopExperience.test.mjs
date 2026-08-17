import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("./desktopRuntime.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");

test("desktop runtime exposes only allowlisted local utility commands", () => {
  assert.match(runtimeSource, /outputsRoot: string;/);
  assert.match(runtimeSource, /logPath: string;/);
  assert.match(runtimeSource, /version: string;/);
  assert.match(runtimeSource, /desktop_open_outputs_directory/);
  assert.match(runtimeSource, /desktop_open_data_directory/);
  assert.match(runtimeSource, /desktop_open_backend_log/);
  assert.match(runtimeSource, /desktop_reset_window_state/);
  assert.doesNotMatch(runtimeSource, /openDesktopPath\(path:/);
  assert.match(runtimeSource, /document\.documentElement\.dataset\.runtime = "desktop"/);
});

test("desktop app provides a full-window settings surface and standard shortcuts", () => {
  assert.match(appSource, /className="desktop-settings-surface"/);
  assert.match(appSource, /type DesktopSettingsSection = "general" \| "storage" \| "shortcuts" \| "about";/);
  assert.match(appSource, /event\.code === "Comma"/);
  assert.match(appSource, /event\.code === "Slash"/);
  assert.match(appSource, /event\.code === "KeyN"/);
  assert.match(appSource, /event\.code === "KeyB"/);
  assert.match(appSource, /\(event\.code === "KeyO" \|\| key === "o"\) && event\.shiftKey/);
  assert.match(appSource, /desktopRuntime\.outputsRoot/);
  assert.match(appSource, /desktopRuntime\.dataRoot/);
  assert.match(appSource, /desktopRuntime\.logPath/);
  assert.match(i18nSource, /"desktop\.settings": "桌面设置"/);
  assert.match(i18nSource, /"desktop\.settings": "Desktop settings"/);
});

test("desktop styling removes the outer web cards without changing web mode", () => {
  assert.match(styles, /html\[data-runtime="desktop"\] \.studio-shell[\s\S]*gap:\s*0;[\s\S]*padding:\s*0;/);
  assert.match(styles, /html\[data-runtime="desktop"\] \.history-sidebar[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none;/);
  assert.match(styles, /html\[data-runtime="desktop"\] \.workspace[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none;/);
  assert.match(styles, /\.desktop-settings-layout[\s\S]*grid-template-columns:\s*220px minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.desktop-settings-layout[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
});
