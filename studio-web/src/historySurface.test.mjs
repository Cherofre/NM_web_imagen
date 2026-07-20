import test from "node:test";
import assert from "node:assert/strict";
import {
  historySurfaceAfterEscape,
  positionHistoryQuickPopover,
  recentHistoryEntriesWithImages,
} from "./historySurface.ts";

test("quick history preview shows multiple recent image-bearing records", () => {
  const entries = [
    { id: "empty", images: [] },
    ...Array.from({ length: 14 }, (_, index) => ({ id: `entry-${index}`, images: [{ id: index }] })),
  ];

  assert.deepEqual(
    recentHistoryEntriesWithImages(entries, 12).map((entry) => entry.id),
    Array.from({ length: 12 }, (_, index) => `entry-${index}`),
  );
  assert.deepEqual(recentHistoryEntriesWithImages([{ id: "empty", images: [] }], 12), []);
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
      { width: 340, height: 340 },
    ),
    { left: 8, top: 162, width: 340, placement: "below" },
  );

  assert.deepEqual(
    positionHistoryQuickPopover(
      { left: 260, right: 340, top: 520, bottom: 554 },
      { width: 360, height: 640 },
      { width: 340, height: 340 },
    ),
    { left: 8, top: 172, width: 340, placement: "above" },
  );

  assert.deepEqual(
    positionHistoryQuickPopover(
      { left: 8, right: 48, top: 72, bottom: 106 },
      { width: 320, height: 568 },
      { width: 340, height: 340 },
    ),
    { left: 8, top: 114, width: 304, placement: "below" },
  );
});
