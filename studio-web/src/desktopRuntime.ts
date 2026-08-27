import { invoke } from "@tauri-apps/api/core";

export type RuntimeMode = "web" | "desktop-installed" | "desktop-portable";

export type DesktopRuntimeInfo = {
  mode: RuntimeMode;
  apiBase: string;
  token: string;
  dataRoot: string;
  outputsRoot: string;
  logPath: string;
  version: string;
};

export type DesktopPathKind = "outputs" | "data" | "log";

let runtimeInfo: DesktopRuntimeInfo = {
  mode: "web",
  apiBase: "",
  token: "",
  dataRoot: "",
  outputsRoot: "",
  logPath: "",
  version: "",
};

function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function initializeDesktopRuntime() {
  if (!hasTauriRuntime()) {
    document.documentElement.dataset.runtime = "web";
    return runtimeInfo;
  }
  runtimeInfo = await invoke<DesktopRuntimeInfo>("desktop_runtime_info");
  if (!runtimeInfo.apiBase || !runtimeInfo.token) {
    throw new Error("Desktop backend runtime information is incomplete");
  }
  document.documentElement.dataset.runtime = "desktop";
  return runtimeInfo;
}

export function getDesktopRuntimeInfo() {
  return { ...runtimeInfo };
}

export function isDesktopRuntime() {
  return runtimeInfo.mode !== "web";
}

export async function openDesktopPath(kind: DesktopPathKind) {
  if (!isDesktopRuntime()) return false;
  const command = {
    outputs: "desktop_open_outputs_directory",
    data: "desktop_open_data_directory",
    log: "desktop_open_backend_log",
  }[kind];
  await invoke(command);
  return true;
}

export async function openDesktopDownloadsDirectory() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_open_downloads_directory");
  return true;
}

export async function downloadDesktopOutput(relativePath: string, name: string) {
  if (!isDesktopRuntime()) return false;
  return await invoke<string>("desktop_download_output", { relativePath, name });
}

export async function saveDesktopOutputAs(relativePath: string, name: string) {
  if (!isDesktopRuntime()) return null;
  return await invoke<string | null>("desktop_save_output_as", { relativePath, suggestedName: name });
}

export async function chooseDesktopFolder(title: string) {
  if (!isDesktopRuntime()) return null;
  return await invoke<string | null>("desktop_choose_folder", { title });
}

export async function getDesktopDocumentsOutputsDirectory() {
  if (!isDesktopRuntime()) return "";
  return await invoke<string>("desktop_documents_outputs_directory");
}

export async function getDesktopDefaultOutputsDirectory() {
  if (!isDesktopRuntime()) return "";
  return await invoke<string>("desktop_default_outputs_directory");
}

export async function shouldShowDesktopOnboarding() {
  if (!isDesktopRuntime()) return false;
  return !(await invoke<boolean>("desktop_onboarding_status"));
}

export async function completeDesktopOnboarding() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_complete_onboarding");
  return true;
}

export type DesktopMigrationScan = {
  sourceRoot: string;
  fileCount: number;
  imageCount: number;
  sessionCount: number;
  historyCount: number;
  totalBytes: number;
};

export async function scanDesktopMigration(source: string) {
  if (!isDesktopRuntime()) return null;
  return await invoke<DesktopMigrationScan>("desktop_scan_migration", { source });
}

export async function importDesktopData(source: string) {
  if (!isDesktopRuntime()) return null;
  return await invoke<{
    scan: DesktopMigrationScan;
    targetRoot: string;
    backupRoot: string | null;
  }>("desktop_import_data", { source });
}

export async function setDesktopOutputsDirectory(path: string) {
  if (!isDesktopRuntime()) return null;
  return await invoke<{ path: string; restartRequired: boolean }>("desktop_set_outputs_directory", { path });
}

export async function switchDesktopStorageRoot(path: string) {
  if (!isDesktopRuntime()) return null;
  const response = await apiFetch("/api/desktop/storage-root", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      detail = String(payload.detail || payload.error || detail);
    } catch {
      // Keep the HTTP fallback when the backend response is not JSON.
    }
    throw new Error(detail);
  }
  return await response.json() as { ok: boolean; path: string; outputs_root: string; restart_required: boolean };
}

export async function openBackendDebugConsole() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_open_backend_console");
  return true;
}

export async function resetDesktopWindow() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_reset_window_state");
  return true;
}

export async function exitDesktopApp() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_exit");
  return true;
}

export async function minimizeDesktopToTray() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_minimize_to_tray");
  return true;
}

export async function showDesktopApp() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_show_main_window");
  return true;
}

export async function confirmDesktopClose(behavior: "tray" | "exit") {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_confirm_close", { behavior });
  return true;
}

function runtimePath(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    if (value.startsWith("/") || url.origin === window.location.origin) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
  }
  return "";
}

export function resolveRuntimeUrl(value: string) {
  if (runtimeInfo.mode === "web" || !value) return value;
  const path = runtimePath(value);
  if (!path.startsWith("/api/") && !path.startsWith("/outputs/")) return value;
  const resolved = new URL(path, `${runtimeInfo.apiBase}/`);
  if (resolved.pathname.startsWith("/outputs/")) {
    resolved.searchParams.set("desktop_token", runtimeInfo.token);
  }
  return resolved.toString();
}

export function isRuntimeOutputUrl(value: string) {
  try {
    const resolved = new URL(resolveRuntimeUrl(value), window.location.origin);
    const expectedOrigin = runtimeInfo.mode === "web" ? window.location.origin : runtimeInfo.apiBase;
    return resolved.origin === expectedOrigin && resolved.pathname.startsWith("/outputs/");
  } catch {
    return false;
  }
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (runtimeInfo.mode === "web") return window.fetch(input, init);

  const raw = input instanceof Request ? input.url : String(input);
  const path = runtimePath(raw);
  if (!path.startsWith("/api/") && !path.startsWith("/outputs/")) {
    return window.fetch(input, init);
  }

  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  headers.set("X-NM-Desktop-Token", runtimeInfo.token);
  const resolved = new URL(path, `${runtimeInfo.apiBase}/`).toString();
  return window.fetch(resolved, { ...init, headers });
}
