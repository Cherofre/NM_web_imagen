export function editorWheelFactor(deltaY: number, deltaMode = 0) {
  if (!Number.isFinite(deltaY)) return 1;
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 120 : 1);
  return Math.exp(-Math.max(-120, Math.min(120, pixels)) * 0.002);
}

export function bindEditorWheelZoom(stage: HTMLElement, changeZoom: (factor: number) => void, enabled: () => boolean) {
  const handler = (event: WheelEvent) => {
    const target = event.target as Element | null;
    // Text notes must retain their own scrolling; only the image area controls zoom.
    if (typeof target?.closest === "function" && target.closest(".image-comment-popover, textarea, input, select, button")) return;
    if (!event.deltaY || !Number.isFinite(event.deltaY)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!enabled()) return;
    changeZoom(editorWheelFactor(event.deltaY, event.deltaMode));
  };
  // React's delegated wheel listener is passive in Chromium: use an explicit
  // active listener to stop document scrolling and Ctrl+wheel page zoom.
  stage.addEventListener("wheel", handler, { passive: false });
  return () => stage.removeEventListener("wheel", handler);
}
