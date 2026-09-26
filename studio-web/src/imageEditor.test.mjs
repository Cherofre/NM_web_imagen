import test from "node:test";
import assert from "node:assert/strict";
import { buildImageEditPrompt, editPoint, moveEditObject, imageEditActionFrom, drawEditObjects } from "./imageEditorModel.ts";

test("coordinates stay in original image space at zoom and clamp at edges", () => {
  assert.deepEqual(editPoint(150, 100, { left: 100, top: 50, width: 200, height: 100 }, 1000, 500), { x: 250, y: 250 });
  assert.deepEqual(editPoint(-10, 1000, { left: 100, top: 50, width: 200, height: 100 }, 1000, 500), { x: 0, y: 500 });
});
test("moving an annotation translates every point without mutating undo state", () => {
  const object = { points: [{ x: 10, y: 20 }, { x: 30, y: 50 }] };
  assert.deepEqual(moveEditObject(object, 2, -4).points, [{ x: 12, y: 16 }, { x: 32, y: 46 }]);
  assert.equal(object.points[0].x, 10);
});
test("comment prompt and guide numbering skip empty drafts consistently", () => {
  const objects = [
    { kind: "comment", text: " ", points: [{ x: 0, y: 0 }], width: 3 },
    { kind: "comment", text: "改为金色", points: [{ x: 250, y: 400 }], width: 3 },
  ];
  const prompt = buildImageEditPrompt("comment", objects, "unrelated", 1000, 800);
  assert.match(prompt, /1\. 位置（从左到右 25%，从上到下 50%）：改为金色/);
  assert.doesNotMatch(prompt, /2\.|unrelated/);
  const numbers = [];
  const ctx = new Proxy({}, { get: (_target, key) => key === "fillText" ? (value) => numbers.push(value) : () => {} });
  drawEditObjects(ctx, objects);
  assert.deepEqual(numbers, ["1"]);
  assert.throws(() => buildImageEditPrompt("comment", [], "", 100, 100));
});
test("background and erasure keep their dedicated intent", () => {
  assert.match(buildImageEditPrompt("background", [], "", 100, 100), /透明/);
  assert.match(buildImageEditPrompt("erase", [], "", 100, 100), /不要添加替代物体/);
  assert.equal(imageEditActionFrom("background"), "background");
  assert.equal(imageEditActionFrom("unsupported"), undefined);
});
