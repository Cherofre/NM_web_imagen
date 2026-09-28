export type ImageEditAction = "annotate" | "comment" | "background" | "erase";
export function imageEditActionFrom(value: unknown): ImageEditAction | undefined {
  return value === "annotate" || value === "comment" || value === "background" || value === "erase" ? value : undefined;
}
export type EditPoint = { x: number; y: number };
export type EditObject = {
  id: string;
  kind: "pen" | "text" | "rect" | "ellipse" | "arrow" | "comment" | "eraser";
  points: EditPoint[];
  color: string;
  width: number;
  textWidth?: number;
  text: string;
};
export type ImageEditorDraft = { objects: EditObject[]; prompt: string };

export const REMOVE_BACKGROUND_PROMPT = "移除此图像的背景。保持所有前景主体不变且完整，边缘干净平滑。将背景设为透明。不要重绘或改变主体，不要添加棋盘格、白底或其他背景。";
export const ERASE_PROMPT = "删除遮罩选区内的物体或内容，根据周围画面自然补全被遮挡的背景、纹理和光影。不要添加替代物体，不要留下涂抹标记，尽量保持其他区域不变。";

export function buildImageEditPrompt(action: ImageEditAction, objects: EditObject[], prompt: string, width: number, height: number) {
  if (action === "background") return REMOVE_BACKGROUND_PROMPT;
  if (action === "erase") return ERASE_PROMPT;
  if (action === "annotate") return `第一张是原图，第二张是用户的标注引导图。标注只用于说明修改位置，不是成品内容。按以下要求修改原图，最终结果不要保留引导线、箭头或标注文字：\n${prompt.trim()}\n${objects.filter((o) => o.kind !== "eraser" && o.text.trim()).map((o) => `位置（${Math.round(o.points[0].x / width * 100)}%，${Math.round(o.points[0].y / height * 100)}%）：${o.text.trim()}`).join("\n")}`;
  const comments = objects.filter((item) => item.kind === "comment" && item.text.trim());
  if (!comments.length) throw new Error("请至少填写一条评论");
  return "第一张是原图，第二张是编号位置引导图。请逐条完成以下修改，编号只是位置提示，最终图片不要保留编号。未提及的内容尽量保持不变：\n" + comments.map((item, i) =>
    `${i + 1}. 位置（从左到右 ${Math.round(item.points[0].x / width * 100)}%，从上到下 ${Math.round(item.points[0].y / height * 100)}%）：${item.text.trim()}`,
  ).join("\n");
}

export function moveEditObject(object: EditObject, dx: number, dy: number): EditObject {
  return { ...object, points: object.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
}

export function editPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, width: number, height: number): EditPoint {
  return {
    x: Math.max(0, Math.min(width, (clientX - rect.left) / rect.width * width)),
    y: Math.max(0, Math.min(height, (clientY - rect.top) / rect.height * height)),
  };
}

export function annotationTextLayout(ctx: CanvasRenderingContext2D, item: EditObject) {
  const maxWidth = Math.max(1, ctx.canvas.width - 2), maxHeight = Math.max(1, ctx.canvas.height - 2);
  let fontSize = Math.min((item.textWidth ?? item.width) * 5, maxHeight / 1.2, maxWidth);
  let lines: string[] = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    ctx.font = `${fontSize}px "Microsoft YaHei", sans-serif`;
    lines = [];
    for (const paragraph of item.text.split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > maxWidth) { lines.push(line); line = ""; }
        line += char;
      }
      lines.push(line);
    }
    if (lines.length * fontSize * 1.2 <= maxHeight) break;
    fontSize *= Math.min(0.9, maxHeight / (lines.length * fontSize * 1.2));
  }
  const width = Math.min(maxWidth, Math.max(1, ...lines.map((line) => ctx.measureText(line).width)));
  const height = lines.length * fontSize * 1.2;
  const anchor = item.kind === "text" ? item.points[0] : item.points[item.points.length - 1];
  return { lines, fontSize, width, height, x: Math.max(1, Math.min(ctx.canvas.width - width - 1, anchor.x)), y: Math.max(1, Math.min(ctx.canvas.height - height - 1, anchor.y)) };
}

export function drawEditObjects(ctx: CanvasRenderingContext2D, objects: EditObject[], mask = false) {
  let commentIndex = 0;
  for (const item of objects) {
    const p = item.points[0];
    const q = item.points[item.points.length - 1];
    ctx.save();
    ctx.strokeStyle = mask ? "black" : item.color;
    ctx.fillStyle = mask ? "black" : item.color;
    ctx.lineWidth = item.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (item.kind === "eraser") ctx.globalCompositeOperation = "destination-out";
    if (item.kind === "pen" || item.kind === "eraser") {
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      for (const point of item.points) ctx.lineTo(point.x, point.y);
      if (item.points.length === 1) ctx.lineTo(p.x + 0.01, p.y);
      ctx.stroke();
    } else if (item.kind === "rect") {
      ctx.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
    } else if (item.kind === "ellipse") {
      ctx.beginPath(); ctx.ellipse((p.x + q.x) / 2, (p.y + q.y) / 2, Math.abs(q.x - p.x) / 2, Math.abs(q.y - p.y) / 2, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (item.kind === "arrow") {
      const angle = Math.atan2(q.y - p.y, q.x - p.x), length = item.width * 4;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
      ctx.moveTo(q.x - length * Math.cos(angle - Math.PI / 6), q.y - length * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(q.x, q.y); ctx.lineTo(q.x - length * Math.cos(angle + Math.PI / 6), q.y - length * Math.sin(angle + Math.PI / 6)); ctx.stroke();
    } else if (item.kind === "comment" && item.text.trim()) {
      commentIndex++;
      const radius = item.width * 3;
      ctx.fillStyle = "#2563eb"; ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "white"; ctx.lineWidth = radius * 2 / 15; ctx.stroke();
      ctx.fillStyle = "white"; ctx.font = `bold ${radius}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(commentIndex), p.x, p.y);
    }
    if (!mask && item.kind !== "comment" && item.kind !== "eraser" && item.text.trim()) {
      const layout = annotationTextLayout(ctx, item);
      ctx.font = `${layout.fontSize}px "Microsoft YaHei", sans-serif`;
      ctx.textBaseline = "top";
      layout.lines.forEach((line, i) => ctx.fillText(line, layout.x, layout.y + i * layout.fontSize * 1.2));
    }
    ctx.restore();
  }
}
