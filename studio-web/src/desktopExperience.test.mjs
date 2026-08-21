import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("./desktopRuntime.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const tauriMainSource = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const tauriLibSource = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const windowsRuntimeSource = readFileSync(new URL("../src-tauri/src/windows_runtime.rs", import.meta.url), "utf8");
const tauriConfigSource = readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8");
const iconSource = readFileSync(new URL("../src-tauri/icons/icon.svg", import.meta.url), "utf8");

test("desktop runtime exposes only allowlisted local utility commands", () => {
  assert.match(runtimeSource, /outputsRoot: string;/);
  assert.match(runtimeSource, /logPath: string;/);
  assert.match(runtimeSource, /version: string;/);
  assert.match(runtimeSource, /desktop_open_outputs_directory/);
  assert.match(runtimeSource, /desktop_open_data_directory/);
  assert.match(runtimeSource, /desktop_open_backend_log/);
  assert.match(runtimeSource, /openBackendDebugConsole\(\)/);
  assert.match(runtimeSource, /invoke\("desktop_open_backend_console"\)/);
  assert.match(runtimeSource, /desktop_reset_window_state/);
  assert.doesNotMatch(runtimeSource, /openDesktopPath\(path:/);
  assert.doesNotMatch(runtimeSource, /openBackendDebugConsole\([^)]/);
  assert.match(runtimeSource, /document\.documentElement\.dataset\.runtime = "desktop"/);
});

test("desktop app provides a modal settings surface and standard shortcuts", () => {
  assert.match(appSource, /className="desktop-settings-shell"/);
  assert.match(appSource, /className="desktop-settings-backdrop"/);
  assert.match(appSource, /className="desktop-settings-surface"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(appSource, /className="desktop-settings-close"/);
  assert.match(appSource, /type DesktopSettingsSection = "general" \| "storage" \| "shortcuts" \| "about";/);
  assert.match(appSource, /event\.code === "Comma"/);
  assert.match(appSource, /event\.code === "Slash"/);
  assert.match(appSource, /event\.code === "KeyN"/);
  assert.match(appSource, /event\.code === "KeyB"/);
  assert.match(appSource, /\(event\.code === "KeyO" \|\| key === "o"\) && event\.shiftKey/);
  assert.match(appSource, /desktopRuntime\.outputsRoot/);
  assert.match(appSource, /desktopRuntime\.dataRoot/);
  assert.match(appSource, /desktopRuntime\.logPath/);
  assert.match(appSource, /desktop\.openDebugConsole/);
  assert.match(appSource, /desktop\.debugConsoleHint/);
  assert.match(appSource, /className="desktop-settings-trigger"/);
  assert.match(appSource, /title=\{`\$\{t\("desktop\.settings"\)\} · Ctrl\+,`\}/);
  assert.match(appSource, /className="desktop-settings-trigger"[\s\S]*<Settings size=\{17\} \/>/);
  assert.match(i18nSource, /"desktop\.settings": "桌面设置"/);
  assert.match(i18nSource, /"desktop\.settings": "Desktop settings"/);
  assert.match(i18nSource, /"desktop\.openDebugConsole": "打开调试窗口"/);
  assert.match(i18nSource, /"desktop\.openDebugConsole": "Open debug console"/);
});

test("release desktop builds hide the shell console while backend diagnostics stay opt-in", () => {
  assert.match(tauriMainSource, /cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)/);
  assert.match(tauriLibSource, /NM_IMAGE_STUDIO_BACKEND_CONSOLE/);
  assert.match(tauriLibSource, /creation_flags\(0x00000010\)/);
  assert.match(tauriLibSource, /creation_flags\(0x08000000\)/);
  assert.match(tauriLibSource, /fn desktop_open_backend_console\(state: State<'_, DesktopRuntimeState>\)/);
  assert.match(tauriLibSource, /NM_IMAGE_STUDIO_BACKEND_LOG/);
  assert.match(tauriLibSource, /\.env\("IMAGE_TOOL_DESKTOP_MODE", "1"\)/);
  assert.match(tauriLibSource, /Get-Content -LiteralPath \$logPath -Tail 200 -Wait/);
  assert.match(tauriLibSource, /state\._backend_job\.assign\(&child\)/);
  assert.match(tauriLibSource, /\.env\("PYTHONUNBUFFERED", "1"\)/);
  assert.match(tauriLibSource, /desktop_open_backend_console,/);
});

test("Windows desktop runtime enforces one shell and crash-cleans the backend", () => {
  assert.match(windowsRuntimeSource, /CreateMutexW/);
  assert.match(windowsRuntimeSource, /ERROR_ALREADY_EXISTS/);
  assert.match(windowsRuntimeSource, /EnumWindows/);
  assert.match(windowsRuntimeSource, /SetForegroundWindow/);
  assert.match(windowsRuntimeSource, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
  assert.match(windowsRuntimeSource, /AssignProcessToJobObject/);
  assert.match(tauriLibSource, /SingleInstanceGuard::acquire\(\)/);
  assert.match(tauriLibSource, /backend_job\.assign\(&child\)/);
});

test("desktop styling removes the outer web cards without changing web mode", () => {
  assert.match(styles, /html\[data-runtime="desktop"\] \.studio-shell[\s\S]*gap:\s*0;[\s\S]*padding:\s*0;/);
  assert.match(styles, /html\[data-runtime="desktop"\] \.history-sidebar[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none;/);
  assert.match(styles, /html\[data-runtime="desktop"\] \.workspace[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none;/);
  assert.match(styles, /\.desktop-settings-shell[\s\S]*place-items:\s*center;/);
  assert.match(styles, /\.desktop-settings-backdrop[\s\S]*position:\s*absolute;/);
  assert.match(styles, /\.desktop-settings-layout[\s\S]*grid-template-columns:\s*220px minmax\(0, 1fr\);/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.desktop-settings-layout[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
});

test("desktop branding ships the generated application icon set", () => {
  assert.match(tauriConfigSource, /"icon":\s*\[[\s\S]*icons\/32x32\.png[\s\S]*icons\/128x128@2x\.png[\s\S]*icons\/icon\.ico/);
  assert.match(iconSource, /<rect[^>]*fill="#1c1917"/);
  assert.match(iconSource, /<path d="M9 22h14L16 8 9 22Z" fill="#f5f5f4"/);
});
