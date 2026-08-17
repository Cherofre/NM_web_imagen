import { invoke } from "@tauri-apps/api/core";

export type RuntimeMode = "web" | "desktop";

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

export async function resetDesktopWindow() {
  if (!isDesktopRuntime()) return false;
  await invoke("desktop_reset_window_state");
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
