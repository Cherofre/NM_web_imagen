import {
  AlertCircle,
  Brush,
  Check,
  Eraser,
  Hand,
  Keyboard,
  Loader2,
  Maximize2,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { maskPreviewDimensions } from "./maskEditorModel";

type Translator = (key: string, params?: Record<string, string | number>) => string;
type MaskTool = "brush" | "eraser" | "move";
type MaskPoint = { x: number; y: number };
type MaskCommand =
  | { kind: "stroke"; tool: "brush" | "eraser"; size: number; points: MaskPoint[] }
  | { kind: "clear" }
  | { kind: "fill" };

export type MaskEditorResult = {
  baseFile: File;
  maskFile: File;
  previewFile: File;
  coverage: number;
};

type MaskEditorProps = {
  file: File;
  initialMaskFile?: File | null;
  t: Translator;
  onCancel: () => void;
  onApply: (result: MaskEditorResult) => void;
  onRemove?: () => void;
};

const MAX_MASK_PIXELS = 24_000_000;
const MAX_MASK_FILE_BYTES = 25 * 1024 * 1024;
const MASK_COLOR = "rgba(239, 68, 68, 1)";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pngName(name: string) {
  const stem = String(name || "reference").replace(/\.[^.]+$/, "") || "reference";
  return `${stem}.png`;
}

function canvasBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed"));
    }, type, quality);
  });
}

function loadImage(source: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image decode failed"));
    };
    image.src = url;
  });
}

function drawStroke(context: CanvasRenderingContext2D, command: Extract<MaskCommand, { kind: "stroke" }>) {
  const { points } = command;
  if (!points.length) return;
  context.save();
  context.globalCompositeOperation = command.tool === "brush" ? "source-over" : "destination-out";
  context.strokeStyle = MASK_COLOR;
  context.fillStyle = MASK_COLOR;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = command.size;
  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, command.size / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x, points[index].y);
    }
    context.stroke();
  }
  context.restore();
}

function drawCommand(context: CanvasRenderingContext2D, command: MaskCommand) {
  if (command.kind === "clear") {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    return;
  }
  if (command.kind === "fill") {
    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = MASK_COLOR;
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    context.restore();
    return;
  }
  drawStroke(context, command);
}

export function MaskEditor({ file, initialMaskFile, t, onCancel, onApply, onRemove }: MaskEditorProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baselineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cursorClientRef = useRef<MaskPoint | null>(null);
  const commandsRef = useRef<MaskCommand[]>([]);
  const redoRef = useRef<MaskCommand[]>([]);
  const activeStrokeRef = useRef<Extract<MaskCommand, { kind: "stroke" }> | null>(null);
  const pointerRef = useRef<{
    pointerId: number;
    mode: "draw" | "pan";
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const [tool, setTool] = useState<MaskTool>("brush");
  const [brushSize, setBrushSize] = useState(64);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);

  function rebuildOverlay() {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const context = overlay.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, overlay.width, overlay.height);
    if (baselineCanvasRef.current) {
      context.drawImage(baselineCanvasRef.current, 0, 0);
    }
    commandsRef.current.forEach((command) => drawCommand(context, command));
  }

  function commit(command: MaskCommand) {
    commandsRef.current.push(command);
    redoRef.current = [];
    setHistoryVersion((value) => value + 1);
  }

  function clearBrushCursor() {
    const cursor = cursorCanvasRef.current;
    const context = cursor?.getContext("2d");
    if (!cursor || !context) return;
    context.clearRect(0, 0, cursor.width, cursor.height);
  }

  function drawBrushCursor(point: MaskPoint) {
    const cursor = cursorCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    const context = cursor?.getContext("2d");
    if (!cursor || !overlay || !context) return;
    context.clearRect(0, 0, cursor.width, cursor.height);
    if (!ready || saving || tool === "move") return;

    const rect = overlay.getBoundingClientRect();
    if (!rect.width || !rect.height || !overlay.width || !overlay.height) return;
    const scaleX = rect.width / overlay.width;
    const scaleY = rect.height / overlay.height;
    const displayScale = Math.max(0.0001, (scaleX + scaleY) / 2);
    const radius = brushSize / 2;

    context.save();
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(0, 0, 0, 0.9)";
    context.lineWidth = 3 / displayScale;
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(255, 255, 255, 0.96)";
    context.lineWidth = 1 / displayScale;
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, 2.5 / displayScale, 0, Math.PI * 2);
    context.fillStyle = "rgba(0, 0, 0, 0.9)";
    context.fill();
    context.beginPath();
    context.arc(point.x, point.y, 1 / displayScale, 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 255, 255, 0.96)";
    context.fill();
    context.restore();
  }

  function redrawBrushCursor() {
    const client = cursorClientRef.current;
    const overlay = overlayCanvasRef.current;
    if (!client || !overlay) {
      clearBrushCursor();
      return;
    }
    const rect = overlay.getBoundingClientRect();
    if (
      !rect.width
      || !rect.height
      || client.x < rect.left
      || client.x > rect.right
      || client.y < rect.top
      || client.y > rect.bottom
    ) {
      clearBrushCursor();
      return;
    }
    drawBrushCursor({
      x: (client.x - rect.left) * (overlay.width / rect.width),
      y: (client.y - rect.top) * (overlay.height / rect.height),
    });
  }

  function syncBrushCursor(event: PointerEvent<HTMLCanvasElement>) {
    cursorClientRef.current = { x: event.clientX, y: event.clientY };
    redrawBrushCursor();
  }

  function hideBrushCursor() {
    cursorClientRef.current = null;
    clearBrushCursor();
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    commandsRef.current = [];
    redoRef.current = [];
    cursorClientRef.current = null;
    clearBrushCursor();
    setHistoryVersion((value) => value + 1);

    async function prepare() {
      try {
        const image = await loadImage(file);
        if (cancelled) return;
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (!width || !height) throw new Error(t("mask.loadFailed"));
        if (width * height > MAX_MASK_PIXELS) {
          throw new Error(t("mask.tooLarge", { max: 24 }));
        }

        const base = baseCanvasRef.current;
        const overlay = overlayCanvasRef.current;
        const cursor = cursorCanvasRef.current;
        if (!base || !overlay || !cursor) return;
        base.width = width;
        base.height = height;
        overlay.width = width;
        overlay.height = height;
        cursor.width = width;
        cursor.height = height;
        const baseContext = base.getContext("2d");
        const overlayContext = overlay.getContext("2d");
        const cursorContext = cursor.getContext("2d");
        if (!baseContext || !overlayContext || !cursorContext) throw new Error(t("mask.loadFailed"));
        baseContext.clearRect(0, 0, width, height);
        baseContext.drawImage(image, 0, 0, width, height);
        overlayContext.clearRect(0, 0, width, height);
        cursorContext.clearRect(0, 0, width, height);

        const baseline = document.createElement("canvas");
        baseline.width = width;
        baseline.height = height;
        baselineCanvasRef.current = baseline;

        if (initialMaskFile) {
          const maskImage = await loadImage(initialMaskFile);
          if (cancelled) return;
          if (maskImage.naturalWidth !== width || maskImage.naturalHeight !== height) {
            throw new Error(t("mask.sizeMismatch"));
          }
          const decodeCanvas = document.createElement("canvas");
          decodeCanvas.width = width;
          decodeCanvas.height = height;
          const decodeContext = decodeCanvas.getContext("2d", { willReadFrequently: true });
          const baselineContext = baseline.getContext("2d");
          if (!decodeContext || !baselineContext) throw new Error(t("mask.loadFailed"));
          decodeContext.drawImage(maskImage, 0, 0, width, height);
          const pixels = decodeContext.getImageData(0, 0, width, height);
          const selected = baselineContext.createImageData(width, height);
          for (let index = 3; index < pixels.data.length; index += 4) {
            if (pixels.data[index] < 128) {
              selected.data[index - 3] = 239;
              selected.data[index - 2] = 68;
              selected.data[index - 1] = 68;
              selected.data[index] = 255;
            }
          }
          baselineContext.putImageData(selected, 0, 0);
          overlayContext.drawImage(baseline, 0, 0);
        }

        setDimensions({ width, height });
        setBrushSize(clamp(Math.round(Math.min(width, height) * 0.04), 16, 384));
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setReady(true);
        setTimeout(() => dialogRef.current?.focus(), 0);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error && cause.message ? cause.message : t("mask.loadFailed"));
        }
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [file, initialMaskFile, t]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(redrawBrushCursor);
    return () => window.cancelAnimationFrame(frame);
  }, [brushSize, tool, ready, saving, zoom, pan.x, pan.y, dimensions.width, dimensions.height]);

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp((event.clientX - rect.left) * (canvas.width / rect.width), 0, canvas.width),
      y: clamp((event.clientY - rect.top) * (canvas.height / rect.height), 0, canvas.height),
    };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!ready || saving) return;
    event.preventDefault();
    syncBrushCursor(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "move") {
      pointerRef.current = {
        pointerId: event.pointerId,
        mode: "pan",
        clientX: event.clientX,
        clientY: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }
    const point = canvasPoint(event);
    const overlay = overlayCanvasRef.current;
    const context = overlay?.getContext("2d");
    if (!point || !context) return;
    const stroke: Extract<MaskCommand, { kind: "stroke" }> = {
      kind: "stroke",
      tool,
      size: brushSize,
      points: [point],
    };
    activeStrokeRef.current = stroke;
    pointerRef.current = {
      pointerId: event.pointerId,
      mode: "draw",
      clientX: event.clientX,
      clientY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    drawStroke(context, stroke);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    syncBrushCursor(event);
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (pointer.mode === "pan") {
      setPan({
        x: pointer.panX + event.clientX - pointer.clientX,
        y: pointer.panY + event.clientY - pointer.clientY,
      });
      return;
    }
    const stroke = activeStrokeRef.current;
    const point = canvasPoint(event);
    const overlay = overlayCanvasRef.current;
    const context = overlay?.getContext("2d");
    if (!stroke || !point || !context) return;
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1.5) return;
    stroke.points.push(point);
    drawStroke(context, { ...stroke, points: [previous, point] });
  }

  function finishPointer(event: PointerEvent<HTMLCanvasElement>) {
    syncBrushCursor(event);
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointer.mode === "draw" && activeStrokeRef.current) {
      commit(activeStrokeRef.current);
      activeStrokeRef.current = null;
    }
    pointerRef.current = null;
  }

  function undo() {
    const command = commandsRef.current.pop();
    if (!command) return;
    redoRef.current.push(command);
    rebuildOverlay();
    setHistoryVersion((value) => value + 1);
  }

  function redo() {
    const command = redoRef.current.pop();
    if (!command) return;
    commandsRef.current.push(command);
    rebuildOverlay();
    setHistoryVersion((value) => value + 1);
  }

  function clearMask() {
    commit({ kind: "clear" });
    rebuildOverlay();
  }

  function fillMask() {
    commit({ kind: "fill" });
    rebuildOverlay();
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (!ready) return;
    event.preventDefault();
    setZoom((value) => clamp(value * (event.deltaY < 0 ? 1.12 : 0.89), 0.5, 4));
  }

  function coverage() {
    const overlay = overlayCanvasRef.current;
    const context = overlay?.getContext("2d", { willReadFrequently: true });
    if (!overlay || !context) return 0;
    const pixels = context.getImageData(0, 0, overlay.width, overlay.height).data;
    const totalPixels = overlay.width * overlay.height;
    const sampleStep = Math.max(1, Math.ceil(totalPixels / 500_000));
    let selected = 0;
    let sampled = 0;
    for (let pixel = 0; pixel < totalPixels; pixel += sampleStep) {
      sampled += 1;
      if (pixels[pixel * 4 + 3] > 0) selected += 1;
    }
    return sampled ? selected / sampled : 0;
  }

  async function applyMask() {
    const base = baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!base || !overlay || !ready || saving) return;
    const selectedCoverage = coverage();
    if (selectedCoverage <= 0) {
      setError(t("mask.empty"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = overlay.width;
      maskCanvas.height = overlay.height;
      const maskContext = maskCanvas.getContext("2d");
      if (!maskContext) throw new Error(t("mask.exportFailed"));
      maskContext.fillStyle = "#ffffff";
      maskContext.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskContext.globalCompositeOperation = "destination-out";
      maskContext.drawImage(overlay, 0, 0);
      maskContext.globalCompositeOperation = "source-over";

      const previewCanvas = document.createElement("canvas");
      const previewSize = maskPreviewDimensions(base.width, base.height);
      previewCanvas.width = previewSize.width;
      previewCanvas.height = previewSize.height;
      const previewContext = previewCanvas.getContext("2d");
      if (!previewContext) throw new Error(t("mask.exportFailed"));
      previewContext.drawImage(base, 0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.save();
      previewContext.globalAlpha = 0.52;
      previewContext.drawImage(overlay, 0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.restore();

      const [baseBlob, maskBlob, previewBlob] = await Promise.all([
        canvasBlob(base),
        canvasBlob(maskCanvas),
        canvasBlob(previewCanvas, "image/webp", 0.82),
      ]);
      if (baseBlob.size > MAX_MASK_FILE_BYTES || maskBlob.size > MAX_MASK_FILE_BYTES) {
        throw new Error(t("mask.fileTooLarge"));
      }
      const stamp = Date.now();
      onApply({
        baseFile: new File([baseBlob], pngName(file.name), { type: "image/png", lastModified: stamp }),
        maskFile: new File([maskBlob], "mask.png", { type: "image/png", lastModified: stamp }),
        previewFile: new File([previewBlob], "mask-preview.webp", { type: "image/webp", lastModified: stamp }),
        coverage: selectedCoverage,
      });
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("mask.exportFailed"));
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === "Tab") {
      const dialog = dialogRef.current;
      const focusable = dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ))
        : [];
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (!ready || saving || event.ctrlKey || event.metaKey || event.altKey) return;
    const shortcut = event.key.toLowerCase();
    switch (shortcut) {
      case "b":
        event.preventDefault();
        setTool("brush");
        break;
      case "e":
        event.preventDefault();
        setTool("eraser");
        break;
      case "h":
        event.preventDefault();
        setTool("move");
        break;
      case "[":
        event.preventDefault();
        setBrushSize((value) => clamp(value - 8, 8, 512));
        break;
      case "]":
        event.preventDefault();
        setBrushSize((value) => clamp(value + 8, 8, 512));
        break;
      case "-":
        event.preventDefault();
        setZoom((value) => clamp(value - 0.25, 0.5, 4));
        break;
      case "+":
      case "=":
        event.preventDefault();
        setZoom((value) => clamp(value + 0.25, 0.5, 4));
        break;
      case "0":
        event.preventDefault();
        resetView();
        break;
      default:
        break;
    }
  }

  const canUndo = commandsRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;
  void historyVersion;

  return (
    <div className="lightbox mask-editor-shell">
      <button className="lightbox-backdrop" type="button" onClick={onCancel} aria-label={t("mask.cancel")} />
      <div className="mask-editor-card" role="dialog" aria-modal="true" aria-label={t("mask.title")} tabIndex={-1} ref={dialogRef} onKeyDown={handleKeyDown}>
        <header className="mask-editor-head">
          <div>
            <strong>{t("mask.title")}</strong>
            <span>{file.name}{dimensions.width ? ` · ${dimensions.width} × ${dimensions.height}` : ""}</span>
          </div>
          <button type="button" onClick={onCancel} aria-label={t("mask.cancel")} title={t("mask.cancel")}><X size={18} /></button>
        </header>

        <div className="mask-editor-guidance" role="note">
          <AlertCircle size={17} />
          <span>{t("mask.paintHint")}</span>
          <span className="mask-editor-shortcut-help" tabIndex={0} title={t("mask.shortcuts")} aria-label={t("mask.shortcuts")}>
            <Keyboard size={14} />
            <span>{t("mask.shortcutHelp")}</span>
          </span>
        </div>

        <div className="mask-editor-toolbar" aria-label={t("mask.tools")}>
          <div className="mask-editor-tool-group">
            <button type="button" className={tool === "brush" ? "active" : ""} onClick={() => setTool("brush")} aria-pressed={tool === "brush"} aria-keyshortcuts="B" title={`${t("mask.brush")} (B)`}><Brush size={17} /><span>{t("mask.brush")}</span></button>
            <button type="button" className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"} aria-keyshortcuts="E" title={`${t("mask.eraser")} (E)`}><Eraser size={17} /><span>{t("mask.eraser")}</span></button>
            <button type="button" className={tool === "move" ? "active" : ""} onClick={() => setTool("move")} aria-pressed={tool === "move"} aria-keyshortcuts="H" title={`${t("mask.move")} (H)`}><Hand size={17} /><span>{t("mask.move")}</span></button>
          </div>
          <label className="mask-editor-size">
            <span>{t("mask.brushSize")}</span>
            <input type="range" min={8} max={512} step={4} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} disabled={!ready} aria-keyshortcuts="[ ]" title="[ / ]" />
            <output>{brushSize}px</output>
          </label>
          <div className="mask-editor-tool-group compact">
            <button type="button" onClick={undo} disabled={!canUndo} title={t("mask.undo")} aria-label={t("mask.undo")}><Undo2 size={17} /></button>
            <button type="button" onClick={redo} disabled={!canRedo} title={t("mask.redo")} aria-label={t("mask.redo")}><Redo2 size={17} /></button>
            <button type="button" onClick={clearMask} disabled={!ready} title={t("mask.clear")} aria-label={t("mask.clear")}><Trash2 size={17} /></button>
            <button type="button" onClick={fillMask} disabled={!ready} title={t("mask.fill")} aria-label={t("mask.fill")}><Maximize2 size={17} /></button>
          </div>
        </div>

        <div className={`mask-editor-stage tool-${tool}${ready ? " is-ready" : ""}`} onWheel={onWheel}>
          {!ready && !error && <div className="mask-editor-loading"><Loader2 className="spin" size={22} /> {t("mask.loading")}</div>}
          {error && <div className="mask-editor-error" role="alert"><AlertCircle size={18} /> {error}</div>}
          <div
            className="mask-editor-canvas-stack"
            style={{
              "--mask-zoom": zoom,
              "--mask-pan-x": `${pan.x}px`,
              "--mask-pan-y": `${pan.y}px`,
            } as CSSProperties}
          >
            <canvas ref={baseCanvasRef} aria-hidden="true" />
            <canvas
              ref={overlayCanvasRef}
              className="mask-editor-overlay"
              aria-label={t("mask.canvas")}
              onPointerEnter={syncBrushCursor}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={(event) => {
                finishPointer(event);
                hideBrushCursor();
              }}
              onPointerLeave={hideBrushCursor}
            />
            <canvas ref={cursorCanvasRef} className="mask-editor-brush-cursor" aria-hidden="true" />
          </div>
          <div className="mask-editor-zoom-tools" aria-label={t("mask.zoomTools")}>
            <button type="button" onClick={() => setZoom((value) => clamp(value - 0.25, 0.5, 4))} title={`${t("mask.zoomOut")} (-)`} aria-label={t("mask.zoomOut")} aria-keyshortcuts="-"><ZoomOut size={17} /></button>
            <button type="button" onClick={() => setZoom((value) => clamp(value + 0.25, 0.5, 4))} title={`${t("mask.zoomIn")} (+)`} aria-label={t("mask.zoomIn")} aria-keyshortcuts="+ ="><ZoomIn size={17} /></button>
            <button type="button" onClick={resetView} title={`${t("mask.fit")} (0)`} aria-keyshortcuts="0"><RotateCcw size={16} /> {t("mask.fit")}</button>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        <footer className="mask-editor-footer">
          <span>{t("mask.onlyFirst")}</span>
          <div>
            {initialMaskFile && onRemove && <button type="button" className="danger-action" onClick={onRemove}>{t("mask.remove")}</button>}
            <button type="button" onClick={onCancel}>{t("mask.cancel")}</button>
            <button type="button" className="primary-action" onClick={() => void applyMask()} disabled={!ready || saving}>
              {saving ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
              {saving ? t("mask.applying") : t("mask.apply")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
