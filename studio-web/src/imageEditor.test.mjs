import test from "node:test";
import assert from "node:assert/strict";
import { annotationTextLayout, buildImageEditPrompt, editPoint, eraseEditObjects, moveEditObject, imageEditActionFrom, drawEditObjects } from "./imageEditorModel.ts";

test("erased sections move with their annotation without changing undo snapshots or later marks", () => {
  const original = { kind: "pen", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }], text: "", width: 2 };
  const erased = eraseEditObjects([original], { points: [{ x: 20, y: 20 }], width: 5 });
  const moved = moveEditObject(erased[0], 100, 100, { width: 64, height: 64 });
  assert.deepEqual(moved.points[1], { x: 64, y: 64 });
  assert.deepEqual(moved.cuts[0].points[0], { x: 54, y: 54 });
  assert.deepEqual(erased[0].cuts[0].points[0], { x: 20, y: 20 });
  assert.equal(original.cuts, undefined);
  const later = { ...original, id: "new" };
  assert.equal([...erased, later][1].cuts, undefined);
});

test("text layout also stays inside one-pixel and very narrow textures", () => {
  for (const width of [1, 2, 8]) {
    const ctx = { canvas: { width, height: 1 }, font: "", measureText(value) { return { width: value.length * parseFloat(this.font) }; } };
    const label = annotationTextLayout(ctx, { kind: "text", text: "边缘", width: 5, points: [{ x: width, y: 1 }] });
    assert.ok(label.x + label.width <= width && label.y + label.height <= 1);
  }
});

test("edge labels wrap and remain inside the original export dimensions", () => {
  const ctx = { canvas: { width: 64, height: 64 }, font: "", measureText(value) { return { width: [...value].length * parseFloat(this.font) }; } };
  for (const value of ["这里挖空", "这是一个需要换行的很长的标注文字".repeat(8)]) {
    const layout = annotationTextLayout(ctx, { kind: "text", text: value, width: 5, points: [{ x: 63, y: 63 }] });
    assert.ok(layout.x >= 0 && layout.y >= 0);
    assert.ok(layout.x + layout.width <= 64 && layout.y + layout.height <= 64);
    assert.equal(layout.lines.join(""), value);
  }
});

test("eraser strokes remove overlay pixels in order and restore drawing for later marks", () => {
  const strokes = [], states = [];
  const ctx = new Proxy({
    globalCompositeOperation: "source-over",
    save() { states.push(this.globalCompositeOperation); },
    restore() { this.globalCompositeOperation = states.pop(); },
    stroke() { strokes.push(this.globalCompositeOperation); },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  drawEditObjects(ctx, ["pen", "eraser", "pen"].map((kind) => ({ kind, text: "", width: 4, color: "red", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] })));
  assert.deepEqual(strokes, ["source-over", "destination-out", "source-over"]);
});

test("shape notes are submitted without requiring a separate global prompt", () => {
  assert.match(buildImageEditPrompt("annotate", [{ kind: "rect", text: "这里挖空", points: [{ x: 20, y: 30 }] }], "", 100, 100), /这里挖空/);
});

test("coordinates stay in original image space at zoom and clamp at edges", () => {
  assert.deepEqual(editPoint(150, 100, { left: 100, top: 50, width: 200, height: 100 }, 1000, 500), { x: 250, y: 250 });
  assert.deepEqual(editPoint(-10, 1000, { left: 100, top: 50, width: 200, height: 100 }, 1000, 500), { x: 0, y: 500 });
});
test("moving an annotation translates every point without mutating undo state", () => {
  const object = { points: [{ x: 10, y: 20 }, { x: 30, y: 50 }] };
  assert.deepEqual(moveEditObject(object, 2, -4).points, [{ x: 12, y: 16 }, { x: 32, y: 46 }]);
  assert.equal(object.points[0].x, 10);
});
test("comment prompt and guide preserve visible pin numbers across empty drafts", () => {
  const objects = [
    { kind: "comment", text: " ", points: [{ x: 0, y: 0 }], width: 3 },
    { kind: "comment", text: "改为金色", points: [{ x: 250, y: 400 }], width: 3 },
  ];
  const prompt = buildImageEditPrompt("comment", objects, "unrelated", 1000, 800);
  assert.match(prompt, /2\. 位置（从左到右 25%，从上到下 50%）：改为金色/);
  assert.doesNotMatch(prompt, /1\.|unrelated/);
  const numbers = [];
  const ctx = new Proxy({}, { get: (_target, key) => key === "fillText" ? (value) => numbers.push(value) : () => {} });
  drawEditObjects(ctx, objects);
  assert.deepEqual(numbers, ["2"]);
  assert.throws(() => buildImageEditPrompt("comment", [], "", 100, 100));
});
test("background and erasure keep their dedicated intent", () => {
  assert.match(buildImageEditPrompt("background", [], "", 100, 100), /透明/);
  assert.match(buildImageEditPrompt("erase", [], "", 100, 100), /不要添加替代物体/);
  assert.equal(imageEditActionFrom("background"), "background");
  assert.equal(imageEditActionFrom("local"), "local");
  assert.equal(buildImageEditPrompt("local", [], " 改为蓝色 ", 100, 100), "改为蓝色");
  assert.throws(() => buildImageEditPrompt("local", [], "  ", 100, 100));
  assert.equal(imageEditActionFrom("unsupported"), undefined);
});

test("multiple completed comments are combined into one numbered edit prompt", () => {
  const objects = [
    { kind: "comment", text: "帽子改蓝色", points: [{ x: 200, y: 100 }] },
    { kind: "comment", text: "", points: [{ x: 300, y: 200 }] },
    { kind: "comment", text: "移除冰淇淋", points: [{ x: 600, y: 500 }] },
  ];
  const prompt = buildImageEditPrompt("comment", objects, "", 1000, 1000);
  assert.match(prompt, /1\. 位置（从左到右 20%，从上到下 10%）：帽子改蓝色/);
  assert.match(prompt, /3\. 位置（从左到右 60%，从上到下 50%）：移除冰淇淋/);
  assert.doesNotMatch(prompt, /2\. 位置/);
});

test("reopening a downloaded result uses its source identity to restore each mode draft", async () => {
  const { imageEditorDraftKey } = await import("./imageEditorModel.ts");
  const drafts = new Map();
  const source = "/outputs/session/result.png";
  const comment = { objects: [{ id: "note", kind: "comment", text: "改为金色" }], prompt: "" };
  drafts.set(imageEditorDraftKey(source, "comment"), comment);
  assert.equal(drafts.get(imageEditorDraftKey(source, "comment")), comment);
  assert.equal(drafts.get(imageEditorDraftKey(source, "annotate")), undefined);
  assert.equal(drafts.get(imageEditorDraftKey("/outputs/other/result.png", "comment")), undefined);
});
