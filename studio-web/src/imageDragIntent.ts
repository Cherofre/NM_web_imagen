// Native image dragging already has a browser movement threshold; this adds a short hold guard.
export const INTERNAL_IMAGE_DRAG_DELAY_MS = 180;

export type InternalImageDragIntent = {
  startedAt: number;
};

export function shouldAllowInternalImageDrag(
  intent: InternalImageDragIntent | null,
  now: number
) {
  return Boolean(intent && now - intent.startedAt >= INTERNAL_IMAGE_DRAG_DELAY_MS);
}
