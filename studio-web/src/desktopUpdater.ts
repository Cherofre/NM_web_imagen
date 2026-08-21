import { Channel, invoke } from "@tauri-apps/api/core";

export type DesktopUpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "readyToInstall"
  | "portableDownloaded"
  | "installing"
  | "failed";

export type DesktopUpdateInfo = {
  available: boolean;
  currentVersion: string;
  version: string | null;
  notes: string | null;
  publishedAt: string | null;
  mode: "desktop-installed" | "desktop-portable" | string;
  releasePage: string;
  packageUrl: string | null;
  packageName: string | null;
};

export type DesktopDownloadEvent =
  | { event: "Started"; data: { contentLength: number | null } }
  | { event: "Progress"; data: { downloaded: number; contentLength: number | null } }
  | { event: "Finished" };

export type DesktopDownloadResult = {
  mode: string;
  version: string;
  readyToInstall: boolean;
  downloadedPath: string | null;
};

export const DESKTOP_UPDATE_AUTO_CHECK_KEY = "image-generate-web-tool:desktop-update-auto-check-v1";
export const DESKTOP_UPDATE_LAST_CHECK_KEY = "image-generate-web-tool:desktop-update-last-check-v1";
export const DESKTOP_UPDATE_SNOOZE_KEY = "image-generate-web-tool:desktop-update-snooze-v1";
export const DESKTOP_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function readDesktopUpdateAutoCheck(storage: Storage | null | undefined) {
  return storage?.getItem(DESKTOP_UPDATE_AUTO_CHECK_KEY) !== "false";
}

export function saveDesktopUpdateAutoCheck(storage: Storage | null | undefined, value: boolean) {
  storage?.setItem(DESKTOP_UPDATE_AUTO_CHECK_KEY, String(value));
}

export function readDesktopUpdateLastCheck(storage: Storage | null | undefined) {
  const value = Number(storage?.getItem(DESKTOP_UPDATE_LAST_CHECK_KEY) || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function saveDesktopUpdateLastCheck(storage: Storage | null | undefined, value = Date.now()) {
  storage?.setItem(DESKTOP_UPDATE_LAST_CHECK_KEY, String(value));
}

export function shouldAutoCheckDesktopUpdate(storage: Storage | null | undefined, now = Date.now()) {
  return now - readDesktopUpdateLastCheck(storage) >= DESKTOP_UPDATE_CHECK_INTERVAL_MS;
}

export function saveDesktopUpdateSnooze(storage: Storage | null | undefined, version: string | null) {
  if (version) storage?.setItem(DESKTOP_UPDATE_SNOOZE_KEY, JSON.stringify({ version, until: Date.now() + DESKTOP_UPDATE_CHECK_INTERVAL_MS }));
}

export function isDesktopUpdateSnoozed(storage: Storage | null | undefined, version: string | null, now = Date.now()) {
  if (!version) return false;
  try {
    const value = JSON.parse(storage?.getItem(DESKTOP_UPDATE_SNOOZE_KEY) || "null") as { version?: unknown; until?: unknown } | null;
    return value?.version === version && Number(value.until) > now;
  } catch {
    return false;
  }
}

export function formatDesktopDownloadSize(bytes: number | null) {
  if (!Number.isFinite(bytes) || bytes === null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function checkDesktopUpdate() {
  return invoke<DesktopUpdateInfo>("desktop_check_update");
}

export async function downloadDesktopUpdate(onEvent: (event: DesktopDownloadEvent) => void) {
  const channel = new Channel<DesktopDownloadEvent>(onEvent);
  return invoke<DesktopDownloadResult>("desktop_download_update", { onEvent: channel });
}

export async function installDesktopUpdate(activeQueueCount: number) {
  return invoke<void>("desktop_install_update", { activeQueueCount });
}

export async function openDesktopReleasePage() {
  return invoke<void>("desktop_open_release_page");
}
