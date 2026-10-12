import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { bindEditorWheelZoom, editorWheelFactor } from "./editorViewport.ts";
import { maskCanvasFitScale } from "./maskEditorModel.ts";
import { editPoint } from "./imageEditorModel.ts";

test("wheel input handles trackpad, line/page units, zero and invalid deltas without abrupt unbounded jumps", () => {
  assert.ok(editorWheelFactor(-100) > 1);
  assert.ok(editorWheelFactor(100) < 1);
  assert.equal(editorWheelFactor(0), 1);
  assert.equal(editorWheelFactor(NaN), 1);
  assert.equal(editorWheelFactor(1, 1), editorWheelFactor(16));
  assert.equal(editorWheelFactor(1, 2), editorWheelFactor(120));
  assert.ok(Math.abs(editorWheelFactor(-100) * editorWheelFactor(100) - 1) < 1e-9);
  assert.ok(editorWheelFactor(1) > editorWheelFactor(100));
  assert.equal(editorWheelFactor(-99999), editorWheelFactor(-120));
});

function stage() {
  return { addEventListener(name, callback, options) { this.name = name; this.callback = callback; this.options = options; },
    removeEventListener(name, callback) { assert.equal(name, this.name); assert.equal(callback, this.callback); this.removed = true; } };
}
function event(deltaY, control = false) {
  return { deltaY, deltaMode: 0, target: { closest: () => control ? {} : null }, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}

test("canvas wheel listener is non-passive, leaves note scrolling intact, and cleans up without duplicate handlers", () => {
  const surface = stage(), changes = [];
  let enabled = true;
  const cleanup = bindEditorWheelZoom(surface, (factor) => changes.push(factor), () => enabled);
  assert.equal(surface.name, "wheel"); assert.equal(surface.options.passive, false);
  const canvasEvent = event(-100); surface.callback(canvasEvent);
  assert.equal(changes.length, 1); assert.equal(canvasEvent.prevented, true); assert.equal(canvasEvent.stopped, true);
  const noteEvent = event(100, true); surface.callback(noteEvent);
  assert.equal(changes.length, 1); assert.equal(noteEvent.prevented, false);
  enabled = false;
  const busyEvent = event(100); surface.callback(busyEvent);
  assert.equal(changes.length, 1); assert.equal(busyEvent.prevented, true);
  surface.callback(event(0)); surface.callback(event(NaN)); assert.equal(changes.length, 1);
  cleanup(); assert.equal(surface.removed, true);
});

test("web default fit uses available space for landscapes, portraits and tiny textures; legacy fit remains unchanged", () => {
  for (const [width, height] of [[476, 382], [64, 64], [1, 1], [2000, 300], [200, 2000]]) {
    const scale = maskCanvasFitScale(1500, 850, width, height, 20, true);
    assert.ok(width * scale <= 1460 + 1e-8 && height * scale <= 810 + 1e-8);
    assert.ok(Math.abs(width * scale - 1460) < 1e-8 || Math.abs(height * scale - 810) < 1e-8);
  }
  assert.equal(maskCanvasFitScale(800, 600, 100, 100, 12), 4.8);
  assert.equal(maskCanvasFitScale(800, 600, 100, 100, 12, true), 5.76);
  assert.equal(maskCanvasFitScale(0, 0, 64, 64, 12, true), 1);
});

for (const file of ["ImageEditor.tsx", "MaskEditor.tsx"]) {
  test(`${file} actual wheel wiring scales the canvas within bounds and refuses zoom during a stroke`, () => {
    const ast = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let effect;
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("bindEditorWheelZoom")) effect = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast); assert.ok(effect);
    const surface = stage();
    const ctx = { bindEditorWheelZoom, stage: { current: surface }, stageRef: { current: surface }, url: "ready", busy: false, ready: true, saving: false,
      gesture: { current: null }, panGesture: { current: null }, pointerRef: { current: null }, activeStrokeRef: { current: null },
      clamp: (v, min, max) => Math.min(max, Math.max(min, v)), setZoom(fn) { ctx.zoom = fn(ctx.zoom); }, zoom: 1 };
    vm.createContext(ctx);
    const run = vm.runInContext(ts.transpileModule(`(${effect})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
    const cleanup = run();
    surface.callback(event(-100)); assert.ok(ctx.zoom > 1);
    for (let i = 0; i < 100; i++) surface.callback(event(-100)); assert.equal(ctx.zoom, 4);
    for (let i = 0; i < 100; i++) surface.callback(event(100)); assert.equal(ctx.zoom, 0.5);
    ctx.gesture.current = {}; ctx.pointerRef.current = {};
    surface.callback(event(-100)); assert.equal(ctx.zoom, 0.5);
    cleanup(); assert.equal(surface.removed, true);
  });
}

test("annotation brush cursor recomputes its original-image coordinates after zoom without needing another pointer move", () => {
  const source = fs.readFileSync(new URL("ImageEditor.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("ImageEditor.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("const client = brushClient.current")) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(effect);
  let rect = { left: 20, top: 10, right: 220, bottom: 110, width: 200, height: 100 };
  const ctx = { editPoint, showBrush: true, brushClient: { current: { x: 80, y: 40 } }, canvas: { current: { getBoundingClientRect: () => rect } },
    dimensions: { width: 100, height: 50 }, requestAnimationFrame(fn) { fn(); return 1; }, cancelAnimationFrame() {}, setBrushPoint(value) { ctx.point = value; } };
  vm.createContext(ctx);
  const run = vm.runInContext(ts.transpileModule(`(${effect})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  run()(); assert.deepEqual(ctx.point, { x: 30, y: 15 });
  rect = { ...rect, width: 400, height: 200, right: 420, bottom: 210 };
  run()(); assert.deepEqual(ctx.point, { x: 15, y: 7.5 });
  ctx.brushClient.current.x = 500;
  run()(); assert.equal(ctx.point, null);
});

test("whole-window Ctrl+wheel handler leaves annotation, local edit and preview canvas zoom to each stage", () => {
  const ast = ts.createSourceFile("App.tsx", fs.readFileSync(new URL("App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "onZoomWheel") handler = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(handler);
  const ctx = { uiZoom: 1, stepUiZoom: () => 1.1, formatUiZoom: String, t: (key) => key,
    setUiZoom(value) { ctx.globalZoom = value; }, setNotice() {} };
  vm.createContext(ctx);
  vm.runInContext(ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  for (const name of [".image-editor-stage", ".mask-editor-stage", ".lightbox-stage"]) {
    const e = { ctrlKey: true, deltaY: -100, target: { closest: (selector) => selector.split(", ").includes(name) }, preventDefault() { this.prevented = true; } };
    ctx.onZoomWheel(e);
    assert.equal(ctx.globalZoom, undefined); assert.equal(e.prevented, undefined);
  }
  const e = { ctrlKey: true, deltaY: -100, target: { closest: () => null }, preventDefault() { this.prevented = true; } };
  ctx.onZoomWheel(e); assert.equal(ctx.globalZoom, 1.1); assert.equal(e.prevented, true);
});

for (const file of ["ImageEditor.tsx", "MaskEditor.tsx"]) {
  test(`${file} actual fit observer fills available canvas space and skips hidden modes`, () => {
    const ast = ts.createSourceFile(file, fs.readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let effect;
    function visit(node) {
      if (ts.isCallExpression(node) && ["useEffect", "useLayoutEffect"].includes(node.expression.getText(ast)) && node.arguments[0]?.getText(ast).includes("maskCanvasFitScale(")) effect = node.arguments[0].getText(ast);
      ts.forEachChild(node, visit);
    }
    visit(ast); assert.ok(effect);
    const surface = { clientWidth: 1500, clientHeight: 850, scrollLeft: 0, scrollTop: 0 };
    let resize;
    const ctx = { maskCanvasFitScale, ready: true, unified: true, stage: { current: surface }, stageRef: { current: surface }, dimensions: { width: 476, height: 382 },
      MASK_STAGE_EDGE_PADDING: 12, ResizeObserver: class { constructor(fn) { resize = fn; } observe() {} disconnect() {} },
      window: { addEventListener() {}, removeEventListener() {} },
      setViewport(value) { ctx.viewport = value; }, setFit(value) { ctx.scale = value; }, setFitScale(value) { ctx.scale = typeof value === "function" ? value(ctx.scale || 1) : value; } };
    vm.createContext(ctx);
    const run = vm.runInContext(ts.transpileModule(`(${effect})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
    const cleanup = run();
    assert.ok(476 * ctx.scale > 480);
    const first = ctx.scale;
    surface.clientWidth = 0; surface.clientHeight = 0; resize(); assert.equal(ctx.scale, first);
    surface.clientWidth = 300; surface.clientHeight = 240; resize();
    assert.ok(476 * ctx.scale <= 300 && 382 * ctx.scale <= 240);
    cleanup();
  });
}
