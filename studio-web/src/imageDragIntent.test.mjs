import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERNAL_IMAGE_DRAG_DELAY_MS,
  shouldAllowInternalImageDrag,
} from "./imageDragIntent.ts";

const intent = {
  startedAt: 1_000,
};

test("quick image movement stays a click instead of becoming a drag", () => {
  assert.equal(
    shouldAllowInternalImageDrag(intent, 1_000 + INTERNAL_IMAGE_DRAG_DELAY_MS - 1),
    false
  );
});

test("a drag without a matching image press is rejected", () => {
  assert.equal(shouldAllowInternalImageDrag(null, 1_000 + INTERNAL_IMAGE_DRAG_DELAY_MS + 20), false);
});

test("a deliberate hold allows the browser movement threshold to start the drag", () => {
  assert.equal(
    shouldAllowInternalImageDrag(intent, 1_000 + INTERNAL_IMAGE_DRAG_DELAY_MS),
    true
  );
});
