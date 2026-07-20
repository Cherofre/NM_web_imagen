import test from "node:test";
import assert from "node:assert/strict";
import {
  historySurfaceAfterEscape,
  latestHistoryEntryWithImages,
  positionHistoryQuickPopover,
} from "./historySurface.ts";

test("latest history preview uses the newest entry that actually has images", () => {
  const entries = [
    { id: "empty", images: [] },
    { id: "latest-images", images: [{ id: "a" }, { id: "b" }] },
    { id: "older-images", images: [{ id: "c" }] },
  ];

  assert.equal(latestHistoryEntryWithImages(entries)?.id, "latest-images");
  assert.equal(latestHistoryEntryWithImages([{ id: "empty", images: [] }]), null);
});

test("Escape closes quick history, backs out of detail, then closes the browser", () => {
  assert.deepEqual(historySurfaceAfterEscape({ mode: "quick" }), { mode: "closed" });
  assert.deepEqual(historySurfaceAfterEscape({ mode: "browser", detailId: "entry-1" }), { mode: "browser" });
  assert.deepEqual(historySurfaceAfterEscape({ mode: "browser" }), { mode: "closed" });
  assert.deepEqual(historySurfaceAfterEscape({ mode: "closed" }), { mode: "closed" });
});

test("quick history popover stays inside the viewport and flips above when needed", () => {
  assert.deepEqual(
    positionHistoryQuickPopover(
      { left: 250, right: 330, top: 120, bottom: 154 },
      { width: 360, height: 720 },
      { width: 320, height: 260 },
    ),
    { left: 10, top: 162, width: 320, placement: "below" },
  );

  assert.deepEqual(
    positionHistoryQuickPopover(
      { left: 260, right: 340, top: 520, bottom: 554 },
      { width: 360, height: 640 },
      { width: 320, height: 260 },
    ),
    { left: 20, top: 252, width: 320, placement: "above" },
  );

  assert.deepEqual(
    positionHistoryQuickPopover(
      { left: 8, right: 48, top: 72, bottom: 106 },
      { width: 320, height: 568 },
      { width: 320, height: 260 },
    ),
    { left: 8, top: 114, width: 304, placement: "below" },
  );
});
