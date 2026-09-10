/**
 * Whole-interface zoom, driven by the same shortcuts a browser uses
 * (Ctrl/⌘ + `+`, `-`, `0`) plus Ctrl + mouse wheel.
 *
 * The desktop shell applies it through the WebView2 zoom factor so `vh` units,
 * fixed elements and scrollbars all scale like a real page zoom; a CSS `zoom`
 * on the root element is only the fallback when that command is unavailable.
 */

export const UI_ZOOM_MIN = 0.8;
export const UI_ZOOM_MAX = 1.6;
export const UI_ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
export const UI_ZOOM_STORAGE_KEY = "nm-image-studio:ui-zoom";

export type UiZoomAction = "in" | "out" | "reset";

export function clampUiZoom(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return 1;
  const rounded = Math.round(parsed * 100) / 100;
  if (rounded < UI_ZOOM_MIN) return UI_ZOOM_MIN;
  if (rounded > UI_ZOOM_MAX) return UI_ZOOM_MAX;
  return rounded;
}

/**
 * Next zoom level in `UI_ZOOM_STEPS`; `reset` jumps back to 1.
 *
 * Stepping is "next level above/below the current value", not "nearest level
 * then one more", so a hand written value such as 1.2 still lands on 1.25
 * instead of jumping to 1.4.
 */
export function stepUiZoom(current: unknown, action: UiZoomAction): number {
  if (action === "reset") return 1;
  const value = clampUiZoom(current);
  const epsilon = 1e-9;
  if (action === "in") {
    return UI_ZOOM_STEPS.find((step) => step > value + epsilon) ?? UI_ZOOM_MAX;
  }
  const lower = [...UI_ZOOM_STEPS].reverse().find((step) => step < value - epsilon);
  return lower ?? UI_ZOOM_MIN;
}

export function formatUiZoom(scale: unknown): string {
  return `${Math.round(clampUiZoom(scale) * 100)}%`;
}

type ZoomKeyEvent = {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

/** Maps a keyboard event to a zoom action, or `null` when it is unrelated. */
export function zoomActionForEvent(event: ZoomKeyEvent | null | undefined): UiZoomAction | null {
  if (!event) return null;
  if (!event.ctrlKey && !event.metaKey) return null;
  if (event.altKey) return null;
  switch (String(event.key ?? "")) {
    case "+":
    case "=":
    case "Add":
      return "in";
    case "-":
    case "_":
    case "Subtract":
      return "out";
    case "0":
      return "reset";
    default:
      return null;
  }
}

type ZoomStorage = Pick<Storage, "getItem" | "setItem"> | null | undefined;

export function readStoredUiZoom(storage?: ZoomStorage): number {
  if (!storage) return 1;
  try {
    const raw = storage.getItem(UI_ZOOM_STORAGE_KEY);
    return raw ? clampUiZoom(raw) : 1;
  } catch {
    return 1;
  }
}

export function storeUiZoom(scale: unknown, storage?: ZoomStorage): void {
  if (!storage) return;
  try {
    storage.setItem(UI_ZOOM_STORAGE_KEY, String(clampUiZoom(scale)));
  } catch {
    /* storage can be unavailable (private mode); zoom still works for the session */
  }
}

/** Fallback for runtimes where the native webview zoom is unavailable. */
export function applyCssUiZoom(scale: unknown, root?: HTMLElement | null): void {
  const target = root || (typeof document === "undefined" ? null : document.documentElement);
  if (!target) return;
  target.style.zoom = String(clampUiZoom(scale));
}

/**
 * Applies the zoom for real. The desktop shell uses the WebView2 zoom factor
 * (so `vh` units, fixed elements and scrollbars scale like a browser), and only
 * falls back to a CSS `zoom` when that command is unavailable.
 */
export async function applyUiZoom(
  scale: unknown,
  options: { desktop?: boolean; root?: HTMLElement | null } = {},
): Promise<void> {
  const value = clampUiZoom(scale);
  if (options.desktop) {
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().setZoom(value);
      // An earlier call may have fallen back to CSS zoom; keeping both would
      // multiply the two scales instead of replacing them.
      const target = options.root || (typeof document === "undefined" ? null : document.documentElement);
      target?.style.removeProperty("zoom");
      return;
    } catch {
      /* permission denied or webview unavailable: fall through to CSS zoom */
    }
  }
  applyCssUiZoom(value, options.root);
}
