import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("slow startup dismisses its warning after rendering eventually succeeds", () => {
  const source = readFileSync(new URL("../public/boot-guard.js", import.meta.url), "utf8");
  let now = 0;
  let notice = null;
  const timers = [];
  const root = { childElementCount: 0 };
  const body = {
    appendChild(element) { notice = element; element.parentNode = body; },
    removeChild() { notice = null; },
  };
  vm.runInNewContext(source, {
    Date: { now: () => now },
    window: { addEventListener() {}, setTimeout(fn) { timers.push(fn); } },
    document: {
      readyState: "complete", body,
      getElementById: (id) => id === "root" ? root : notice,
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    },
  });
  now = 7000;
  timers.shift()();
  assert.ok(notice, "late startup should show a useful warning");
  root.childElementCount = 1;
  assert.equal(timers.length, 1, "keep watching even after the warning appears");
  timers.shift()();
  assert.equal(notice, null, "successful startup removes the warning");
});
