export type HistoryOrigin = "sidebar" | "quick" | "browser";

export type HistorySurfaceState =
  | { mode: "closed" }
  | { mode: "quick" }
  | { mode: "browser"; detailId?: string; origin?: HistoryOrigin };

type HistoryEntryLike = {
  images?: unknown[];
};

type RectLike = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type ViewportLike = {
  width: number;
  height: number;
};

type PopoverSize = {
  width: number;
  height: number;
};

export type HistoryQuickPosition = {
  left: number;
  top: number;
  width: number;
  placement: "above" | "below";
};

export function recentHistoryEntriesWithImages<T extends HistoryEntryLike>(entries: T[], limit = 12): T[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  return entries
    .filter((entry) => Array.isArray(entry.images) && entry.images.length > 0)
    .slice(0, safeLimit);
}

export function historySurfaceAfterEscape(state: HistorySurfaceState): HistorySurfaceState {
  if (state.mode === "quick") return { mode: "closed" };
  if (state.mode === "browser" && state.detailId) {
    if (state.origin === "sidebar") return { mode: "closed" };
    if (state.origin === "quick") return { mode: "quick" };
    return { mode: "browser" };
  }
  if (state.mode === "browser") return { mode: "closed" };
  return state;
}

export function positionHistoryQuickPopover(
  anchor: RectLike,
  viewport: ViewportLike,
  requestedSize: PopoverSize,
  margin = 8,
  gap = 8,
): HistoryQuickPosition {
  const width = Math.max(0, Math.min(requestedSize.width, viewport.width - margin * 2));
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const left = Math.max(margin, Math.min(maxLeft, anchor.right - width));
  const belowTop = anchor.bottom + gap;
  const fitsBelow = belowTop + requestedSize.height <= viewport.height - margin;
  const fitsAbove = anchor.top - gap - requestedSize.height >= margin;
  const placement = !fitsBelow && fitsAbove ? "above" : "below";
  const desiredTop = placement === "above"
    ? anchor.top - gap - requestedSize.height
    : belowTop;
  const maxTop = Math.max(margin, viewport.height - requestedSize.height - margin);
  const top = Math.max(margin, Math.min(maxTop, desiredTop));

  return { left, top, width, placement };
}
