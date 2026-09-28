import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpRight, Brush, Circle, Download, Eraser, Loader2, MousePointer2, Redo2, Send, Square, Trash2, Type, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { buildImageEditPrompt, drawEditObjects, editPoint, moveEditObject, REMOVE_BACKGROUND_PROMPT, type EditObject, type EditPoint, type ImageEditAction, type ImageEditorDraft } from "./imageEditorModel";
import "./imageEditor.css";

export type ImageEditorSubmission = { action: ImageEditAction; prompt: string; references: File[]; maskFile?: File; previewFile?: File };
type Props = {
  file: File;
  action: ImageEditAction;
  language: string;
  draft?: ImageEditorDraft;
  onDraft: (draft: ImageEditorDraft) => void;
  onClose: () => void;
  onSend: (submission: ImageEditorSubmission) => Promise<boolean>;
};
type Tool = "select" | "pen" | "text" | "rect" | "ellipse" | "arrow" | "delete";
const labels = { annotate: ["标注", "Annotate"], comment: ["添加评论", "Add comments"], background: ["移除背景", "Remove background"], erase: ["擦除", "Erase"] };

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败 / Image export failed")), "image/png"));
}

export function ImageEditor({ file, action, language, draft, onDraft, onClose, onSend }: Props) {
  const en = language === "en";
  const text = (zh: string, english: string) => en ? english : zh;
  const dialog = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [url, setUrl] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [objects, setObjects] = useState<EditObject[]>(draft?.objects || []);
  const [prompt, setPrompt] = useState(draft?.prompt || "");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [size, setSize] = useState(action === "erase" ? 60 : 6);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const past = useRef<EditObject[][]>([]);
  const future = useRef<EditObject[][]>([]);
  const gesture = useRef<{ start: EditPoint; before: EditObject[]; object: EditObject; move: boolean; pointer: number } | null>(null);
  const [, refresh] = useState(0);
  const selectedObject = objects.find((item) => item.id === selected);
  const scale = fit * zoom;
  const commentCount = objects.filter((item) => item.kind === "comment" && item.text.trim()).length;
  const commentWidth = Math.min(260, dimensions.width * scale);

  useEffect(() => {
    const source = URL.createObjectURL(file);
    const img = new Image();
    let canceled = false;
    img.onload = () => {
      if (canceled) return;
      if (img.naturalWidth * img.naturalHeight > 8_294_400) { setError(text("图片超过 829 万像素，请先缩小后编辑", "Image exceeds 8.29 MP. Resize it before editing.")); return; }
      image.current = img;
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setUrl(source);
    };
    img.onerror = () => !canceled && setError(text("无法读取图片", "Could not load image"));
    img.src = source;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { canceled = true; URL.revokeObjectURL(source); previousFocus?.focus(); };
  }, [file]);

  useEffect(() => {
    const el = stage.current;
    if (!el || !dimensions.width) return;
    const resize = () => setFit(Math.min(1, (el.clientWidth - 40) / dimensions.width, (el.clientHeight - 40) / dimensions.height));
    resize();
    const observer = new ResizeObserver(resize); observer.observe(el);
    return () => observer.disconnect();
  }, [dimensions]);

  useEffect(() => { onDraft({ objects, prompt }); }, [objects, prompt]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    drawEditObjects(ctx, objects);
  }, [objects, dimensions]);

  function remember(before: EditObject[]) { past.current = [...past.current.slice(-49), before]; future.current = []; refresh((v) => v + 1); }
  function commit(next: EditObject[]) { remember(objects); setObjects(next); }
  function undo() { const previous = past.current.pop(); if (previous) { future.current.push(objects); setObjects(previous); setSelected(null); } }
  function redo() { const next = future.current.pop(); if (next) { past.current.push(objects); setObjects(next); setSelected(null); } }
  function point(event: ReactPointerEvent<SVGSVGElement>) { return editPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), dimensions.width, dimensions.height); }
  function start(event: ReactPointerEvent<SVGSVGElement>) {
    if (busy || event.button !== 0 || action === "background" || gesture.current) return;
    const p = point(event);
    const hit = (event.target as Element).closest("[data-object]")?.getAttribute("data-object");
    const existing = objects.find((item) => item.id === hit);
    if (tool === "delete") { if (existing) commit(objects.filter((item) => item !== existing)); return; }
    if (existing && (tool === "select" || action === "comment")) {
      setSelected(existing.id);
      gesture.current = { start: p, before: objects, object: existing, move: true, pointer: event.pointerId };
    } else if (tool === "select") { setSelected(null); return; }
    else {
      const kind = action === "comment" ? "comment" : action === "erase" ? "pen" : tool;
      const object: EditObject = { id: crypto.randomUUID(), kind, points: [p], color: action === "erase" ? "#60a5fa" : color, width: size / fit, text: "" };
      if (kind === "comment") object.width = 5 / fit;
      if (kind === "text") object.width = 5 / fit;
      setSelected(object.id);
      if (kind === "text" || kind === "comment") { commit([...objects, object]); return; }
      gesture.current = { start: p, before: objects, object, move: false, pointer: event.pointerId };
      setObjects([...objects, object]);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    const p = point(event);
    if (g.move) setObjects(g.before.map((item) => item.id === g.object.id ? moveEditObject(item, p.x - g.start.x, p.y - g.start.y) : item));
    else {
      g.object = { ...g.object, points: g.object.kind === "pen" ? [...g.object.points, p] : [g.start, p] };
      setObjects([...g.before, g.object]);
    }
  }
  function finish(event: ReactPointerEvent<SVGSVGElement>, cancel = false) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    if (cancel) setObjects(g.before); else remember(g.before);
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function exportFile(mode: "base" | "marked" | "mask") {
    const output = document.createElement("canvas");
    output.width = dimensions.width; output.height = dimensions.height;
    const ctx = output.getContext("2d");
    if (!ctx || !image.current) throw new Error(text("图片尚未就绪", "Image is not ready"));
    if (mode === "mask") {
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, output.width, output.height);
      ctx.globalCompositeOperation = "destination-out";
      drawEditObjects(ctx, objects, true);
    } else {
      ctx.drawImage(image.current, 0, 0);
      if (mode === "marked") drawEditObjects(ctx, objects);
    }
    const blob = await blobOf(output);
    if (blob.size > 25 * 1024 * 1024) throw new Error(text("导出图片超过 25 MB", "Export exceeds 25 MB"));
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-${mode}.png`, { type: "image/png" });
  }
  async function download() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const output = await exportFile("marked");
      const src = URL.createObjectURL(output), anchor = document.createElement("a");
      anchor.href = src; anchor.download = output.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(src), 30_000);
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
    finally { sending.current = false; setBusy(false); }
  }
  async function send() {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const base = await exportFile("base");
      const editPrompt = buildImageEditPrompt(action, objects, prompt, dimensions.width, dimensions.height);
      const submission: ImageEditorSubmission = { action, prompt: editPrompt, references: [base] };
      if (action === "erase") { submission.maskFile = await exportFile("mask"); submission.previewFile = await exportFile("marked"); }
      if (action === "comment" || action === "annotate") submission.references.push(await exportFile("marked"));
      if (await onSend(submission)) onClose();
      else setError(text("尚未发送，请检查 GPT 图片连接配置后重试。编辑内容已保留。", "Not sent. Check the GPT image connection and retry. Your edits are retained."));
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
    finally { sending.current = false; setBusy(false); }
  }
  const canSend = Boolean(url) && !busy && (action === "background" || (action === "erase" && objects.length > 0) || (action === "annotate" && objects.length > 0 && prompt.trim()) || (action === "comment" && objects.some((o) => o.text.trim())));
  const tools: [Tool, typeof Brush, string][] = [["select", MousePointer2, text("选择 / 移动", "Select / move")], ["pen", Brush, text("画笔", "Brush")], ["text", Type, text("文字", "Text")], ["rect", Square, text("矩形", "Rectangle")], ["ellipse", Circle, text("椭圆", "Ellipse")], ["arrow", ArrowUpRight, text("箭头", "Arrow")], ["delete", Eraser, text("删除标注", "Remove annotation")]];
  return <div className="image-editor-backdrop">
    <div className="image-editor" role="dialog" aria-modal="true" aria-label={labels[action][en ? 1 : 0]} tabIndex={-1} ref={dialog} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape" && !busy) { event.preventDefault(); if (action === "comment" && selected) setSelected(null); else onClose(); }
      if (event.key === "Tab") {
        const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || [])];
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }
      if ((event.target as HTMLElement).matches("input,textarea") || busy) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) { event.preventDefault(); commit(objects.filter((o) => o.id !== selected)); setSelected(null); }
    }}>
      <header><div><strong>{labels[action][en ? 1 : 0]}</strong><span>{file.name}</span></div><button type="button" onClick={onClose} disabled={busy} aria-label={text("关闭编辑", "Close editor")}><X size={20} /></button></header>
      <div className="image-editor-body">
        <div className="image-editor-stage" ref={stage}>
          {!url && !error && <span role="status">{text("正在载入图片…", "Loading image…")}</span>}
          {url && <div className="image-editor-sheet" style={{ width: dimensions.width * scale, height: dimensions.height * scale }}>
            <img src={url} alt={file.name} draggable={false} />
            <canvas ref={canvas} width={dimensions.width} height={dimensions.height} style={{ opacity: action === "erase" ? 0.5 : 1 }} />
            <svg viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} aria-label={text("图片编辑画布", "Image editing canvas")} style={{ cursor: tool === "select" ? "default" : "crosshair" }} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event, true)}>
              {objects.map((o, index) => {
                const p = o.points[0], q = o.points[o.points.length - 1];
                return <g key={o.id} data-object={o.id}>
                  {o.kind === "comment" ? <g><circle cx={p.x} cy={p.y} r={o.width * 3} fill="#2563eb" stroke="white" strokeWidth={2 / scale} /><text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={o.width * 3}>{index + 1}</text></g>
                    : o.kind === "text" ? <rect x={p.x} y={p.y} width={Math.max(60 / scale, ...o.text.split("\n").map((line) => line.length * o.width * 5))} height={Math.max(1, o.text.split("\n").length) * o.width * 6} fill="transparent" stroke={selected === o.id ? "#60a5fa" : "none"} strokeWidth={1 / scale} />
                    : <polyline points={o.points.map((v) => `${v.x},${v.y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={Math.max(o.width, 18 / scale)} pointerEvents="stroke" />}
                  {(o.kind === "rect" || o.kind === "ellipse") && <rect x={Math.min(p.x, q.x)} y={Math.min(p.y, q.y)} width={Math.max(1, Math.abs(q.x - p.x))} height={Math.max(1, Math.abs(q.y - p.y))} fill="transparent" stroke={selected === o.id ? "#60a5fa" : "transparent"} strokeWidth={2 / scale} />}
                </g>;
              })}
            </svg>
            {action === "comment" && selectedObject?.kind === "comment" && <div
              key={selectedObject.id}
              className="image-comment-popover"
              style={{
                width: commentWidth,
                left: Math.max(0, Math.min(dimensions.width * scale - commentWidth, selectedObject.points[0].x * scale + 18)),
                top: Math.max(0, Math.min(dimensions.height * scale - 150, selectedObject.points[0].y * scale + 18)),
              }}
            >
              <label>{text("评论", "Comment")} {objects.indexOf(selectedObject) + 1}
                <textarea autoFocus aria-label={text("评论内容", "Comment")} maxLength={2000} disabled={busy}
                  value={selectedObject.text} placeholder={text("输入此处的修改要求…", "Describe the change here…")}
                  onFocus={() => remember(objects)}
                  onChange={(event) => setObjects(objects.map((o) => o.id === selected ? { ...o, text: event.target.value } : o))}
                  onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setSelected(null); } }}
                />
              </label>
              <div><button type="button" disabled={busy} aria-label={text("删除此条评论", "Delete this comment")} onClick={() => { commit(objects.filter((o) => o.id !== selected)); setSelected(null); }}><Trash2 size={15} /></button>
                <button type="button" disabled={busy} onClick={() => setSelected(null)}>{text("完成此条", "Done")}</button></div>
            </div>}
          </div>}
        </div>
        {(action === "comment" || action === "background" || action === "annotate") && <aside className="image-editor-details">
          {action === "background" ? <><strong>{text("移除背景并保留主体", "Remove background, keep the subject")}</strong><p>{text(REMOVE_BACKGROUND_PROMPT, "Remove the background, preserve all foreground subjects and their details, and return a transparent image with clean edges.")}</p><p className="image-editor-hint">{text("点击发送后使用当前 GPT 图片配置生成一张结果，原图保留。", "Send generates one result using your GPT image settings. The original is preserved.")}</p></> : <>
            <p>{action === "comment" ? text("点击图片，在标点旁输入。按 Enter 完成此条，再点其他位置继续添加；最后统一发送。拖动编号可调整位置。", "Click the image and type beside the pin. Press Enter to finish, then click elsewhere to add another. Send all comments when ready. Drag pins to reposition them.") : text("在图片上标注，下载标注图，或填写要求继续改图。", "Annotate the image, download it, or describe an edit and send.")}</p>
            {action === "comment" && <button type="button" disabled={busy || !url} onClick={() => { const o: EditObject = { id: crypto.randomUUID(), kind: "comment", points: [{ x: dimensions.width / 2, y: dimensions.height / 2 }], color, width: 5 / fit, text: "" }; commit([...objects, o]); setSelected(o.id); }}>{text("添加评论", "Add comment")}</button>}
            {action === "comment" && objects.map((o, i) => <button type="button" className={selected === o.id ? "selected" : ""} key={o.id} onClick={() => setSelected(o.id)}>{i + 1}. {o.text || text("待填写评论", "Empty comment")}</button>)}
            {selectedObject && selectedObject.kind === "text" && <label key={selectedObject.id}>{text("标注文字", "Annotation text")}
              <textarea aria-label={selectedObject.kind === "text" ? text("标注文字", "Annotation text") : text("评论内容", "Comment")} autoFocus maxLength={2000} disabled={busy} value={selectedObject.text} placeholder={text("输入内容…", "Write here…")} onFocus={() => remember(objects)} onChange={(event) => setObjects(objects.map((o) => o.id === selected ? { ...o, text: event.target.value } : o))} />
              <button type="button" disabled={busy} onClick={() => { commit(objects.filter((o) => o.id !== selected)); setSelected(null); }}><Trash2 size={15} />{text("删除", "Delete")}</button>
            </label>}
            {action === "annotate" && <label>{text("修改要求", "Edit instructions")}<textarea value={prompt} disabled={busy} maxLength={8000} onChange={(event) => setPrompt(event.target.value)} placeholder={text("例如：将箭头指向的蝴蝶改为金色", "For example: make the butterfly at the arrow gold")} /></label>}
          </>}
        </aside>}
      </div>
      {error && <p className="image-editor-error" role="alert">{error}</p>}
      <footer>
        <div className="image-editor-toolbar" aria-label={text("编辑工具", "Editing tools")}>
          {action === "annotate" && tools.map(([id, Icon, label]) => <button type="button" key={id} disabled={busy} aria-label={label} title={label} aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={18} /></button>)}
          {action === "annotate" && <input aria-label={text("标注颜色", "Annotation color")} type="color" value={color} disabled={busy} onChange={(event) => { setColor(event.target.value); if (tool === "select" && selected) commit(objects.map((o) => o.id === selected ? { ...o, color: event.target.value } : o)); }} />}
          {(action === "erase" || action === "annotate") && <label className="image-editor-size">{text("笔刷", "Brush")}<input aria-label={text("笔刷大小", "Brush size")} type="range" min={2} max={action === "erase" ? 160 : 20} value={size} disabled={busy} onChange={(event) => setSize(Number(event.target.value))} /></label>}
          {action === "erase" && <span>{text("涂蓝要删除的内容，再发送补全背景", "Paint what to remove, then send to fill the background")}</span>}
          {action !== "background" && <><button type="button" aria-label={text("撤销", "Undo")} title={text("撤销", "Undo")} disabled={!past.current.length || busy} onClick={undo}><Undo2 size={18} /></button><button type="button" aria-label={text("重做", "Redo")} title={text("重做", "Redo")} disabled={!future.current.length || busy} onClick={redo}><Redo2 size={18} /></button><button type="button" aria-label={text("清空", "Clear")} title={text("清空", "Clear")} disabled={!objects.length || busy} onClick={() => commit([])}><Trash2 size={18} /></button></>}
          <button type="button" aria-label={text("缩小视图", "Zoom out")} disabled={zoom <= 1} onClick={() => setZoom((v) => Math.max(1, v - 0.5))}><ZoomOut size={18} /></button><button type="button" aria-label={text("放大视图", "Zoom in")} disabled={zoom >= 4} onClick={() => setZoom((v) => Math.min(4, v + 0.5))}><ZoomIn size={18} /></button>
          <button type="button" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        </div>
        <div className="image-editor-send">
          {action === "annotate" && <button type="button" disabled={busy || !url || !objects.length} onClick={() => void download()}><Download size={17} />{text("下载标注图", "Download")}</button>}
          <button className="primary-action" type="button" disabled={!canSend} onClick={() => void send()}>{busy ? <Loader2 className="spin" size={17} /> : <Send size={17} />}{action === "comment" ? text(`发送全部 ${commentCount} 条评论`, `Send all ${commentCount} comments`) : text("发送", "Send")}</button>
        </div>
      </footer>
    </div>
  </div>;
}
