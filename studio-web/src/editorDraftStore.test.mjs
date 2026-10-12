import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { editorDraftFile, editorDraftReturnTarget, validEditorDraft, retainedEditorDrafts, loadEditorDrafts, saveEditorDrafts } from "./editorDraftStore.ts";
import { editorNoteBounds, imageEditorDraftKey, recoverableImageEditAction, REMOVE_BACKGROUND_PROMPT } from "./imageEditorModel.ts";
import { referenceFileFingerprint } from "./maskEditorModel.ts";

const record = (sourceKey = "original", updatedAt = 1) => ({
  version: 1, sourceKey, file: new Blob(["原图"], { type: "image/png" }), name: "小图.png", lastModified: 100,
  action: "comment", active: true, updatedAt,
  drafts: { comment: { objects: [{ id: "1", kind: "comment", points: [{ x: 3, y: 5 }], text: "变成金色✨", color: "red", width: 2 }], prompt: "" } },
  mask: { commands: [{ kind: "stroke", tool: "brush", size: 8, points: [{ x: 3, y: 5 }] }, { kind: "clear" }], instructions: "添加小加号", intent: "local", encoding: "compat" },
  initialMaskFile: new Blob(["baseline"], { type: "image/png" }),
});

// Model IDB's structured clone and atomic commit/abort without a paid API or browser bypass.
const disk = new Map();
let abortNext = false;
let failOpen = false;
globalThis.indexedDB = { open() {
  const req = {};
  setTimeout(() => {
    if (failOpen) { failOpen = false; req.error = new Error("blocked"); req.onerror(); return; }
    req.result = { createObjectStore() {}, close() {}, transaction(_store, mode) {
      const pending = new Map(disk), tx = {};
      tx.objectStore = () => ({
        getAll() { return { result: structuredClone([...disk.values()]) }; },
        getAllKeys() { const req = { result: [...disk.keys()] }; queueMicrotask(() => req.onsuccess()); return req; },
        delete(key) { pending.delete(key); },
        clear() { pending.clear(); },
        put(r) { pending.set(r.sourceKey, structuredClone(r)); },
      });
      setTimeout(() => {
        if (abortNext) { abortNext = false; tx.error = new Error("QuotaExceededError"); tx.onabort(); }
        else { if (mode === "readwrite") { disk.clear(); pending.forEach((v, k) => disk.set(k, v)); } tx.oncomplete(); }
      }, 0);
      return tx;
    } };
    req.onupgradeneeded(); req.onsuccess();
  }, 0);
  return req;
} };

test("IDB drafts survive reopening with image bytes, Chinese notes and baseline/compat selection; aborted writes retain old data", async () => {
  failOpen = true;
  await assert.rejects(loadEditorDrafts(), /blocked/);
  const original = { ...record(), returnTo: "conversation" };
  await saveEditorDrafts([original]);
  original.drafts.comment.objects[0].text = "subsequent edit";
  const [restored] = await loadEditorDrafts();
  assert.equal(editorDraftReturnTarget(restored), "conversation");
  assert.equal(restored.drafts.comment.objects[0].text, "变成金色✨");
  assert.deepEqual(restored.mask, record().mask);
  const file = editorDraftFile(restored);
  assert.equal(file.name, "小图.png");
  assert.equal(file.lastModified, 100);
  assert.equal(file.type, "image/png");
  assert.equal(await file.text(), "原图");
  assert.equal(await restored.initialMaskFile.text(), "baseline");
  abortNext = true;
  await assert.rejects(saveEditorDrafts([record("new")]), /Quota/);
  assert.equal((await loadEditorDrafts())[0].sourceKey, "original");
  const changed = { ...record(), name: "must not rewrite unchanged record" };
  await saveEditorDrafts([changed, record("new", 2)], new Set(["new"]));
  assert.equal((await loadEditorDrafts()).find((r) => r.sourceKey === "original").name, "小图.png");
  await saveEditorDrafts([record("new", 3)], new Set(["new"]));
  assert.deepEqual((await loadEditorDrafts()).map((r) => r.sourceKey), ["new"]);
});

test("retention bounds newest drafts by count and bytes and rejects broken/cyclic records", () => {
  const all = Array.from({ length: 25 }, (_, i) => record(`${i}`, i));
  assert.deepEqual(retainedEditorDrafts(all).map((r) => r.sourceKey), Array.from({ length: 20 }, (_, i) => `${24 - i}`));
  const big = new Blob([new Uint8Array(25 * 1024 * 1024)]);
  assert.equal(retainedEditorDrafts(all.map((r) => ({ ...r, file: big }))).length, 5);
  const cycle = record(); cycle.drafts.comment.objects.push(cycle);
  for (const bad of [null, {}, { ...record(), version: 2 }, { ...record(), file: "blob:expired" }, cycle,
    { ...record(), mask: { ...record().mask, commands: [{ kind: "stroke", points: [null] }] } },
    { ...record(), drafts: { comment: { prompt: "", objects: [null] } } }]) assert.equal(validEditorDraft(bad), false);
});

test("inline notes remain within scrolled narrow/short viewports even at far image edges", () => {
  for (const width of [80, 240, 500]) for (const height of [60, 100, 500]) {
    const viewport = { width, height, left: 1200, top: 700 };
    for (const anchor of [{ x: 0, y: 0 }, { x: 4000, y: 4000 }]) {
      const bounds = editorNoteBounds(viewport, anchor);
      assert.ok(bounds.left >= viewport.left && bounds.left + bounds.width <= viewport.left + width);
      assert.ok(bounds.top >= viewport.top && bounds.top + bounds.maxHeight <= viewport.top + height);
    }
  }
});

const ast = ts.createSourceFile("App.tsx", fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = {};
let previewEffect;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers[node.name.text] = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("previewReference(imageEditor.file")) previewEffect = ts.transpileModule(`(${node.arguments[0].getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  ts.forEachChild(node, visit);
}
visit(ast);
function appContext() {
  const ctx = {
    crypto, structuredClone, Date, editorDraftFile, imageEditorDraftKey, referenceFileFingerprint, recoverableImageEditAction,
    language: "zh", configIssues: () => [], gptForm: {}, bananaForm: {}, t: (s) => s,
    previewMaskRequestRef: { current: 0 },
    editorReturnFocus: { current: null }, document: { activeElement: null },
    editorDrafts: { records: { current: new Map([["original", record()]]) }, async load() {}, async flush() {}, put(r) { this.records.current.set(r.sourceKey, structuredClone(r)); } },
    imageEditor: { sourceKey: "original", returnTo: "preview" }, submissions: [],
    window: { requestAnimationFrame(fn) { fn(); } }, promptRef: { current: null }, previewDialogRef: { current: null },
    closePreviewImage() { ctx.preview = null; },
    setImageEditor(value) { ctx.imageEditor = value; }, setNotice(value) { ctx.notice = value; },
    previewReference(file, key) { ctx.preview = { file, key }; },
    async submit(_event, payload) { ctx.submissions.push(payload); return true; },
  };
  vm.createContext(ctx);
  for (const name of ["sendImageEdit", "continueImageEdit", "finishImageEditor"]) vm.runInContext(handlers[name], ctx);
  return ctx;
}

test("actual send and continue handlers keep a frozen guide, reopen failures without resubmitting, and deactivate on exit", async () => {
  const ctx = appContext();
  const file = editorDraftFile(record());
  assert.equal(await ctx.sendImageEdit({ action: "comment", references: [file], prompt: "edit" }), true);
  const key = ctx.submissions[0].editorDraftKey;
  ctx.document.activeElement = { isConnected: true, focus(options) { ctx.focusOptions = options; } };
  ctx.editorDrafts.records.current.get("original").drafts.comment.objects[0].text = "changed later";
  await ctx.continueImageEdit({ meta: { image_edit_action: "comment", editor_draft_key: key } });
  assert.equal(ctx.imageEditor.sourceKey, key);
  assert.equal(ctx.imageEditor.returnTo, "conversation");
  assert.equal(ctx.preview, null);
  assert.equal(ctx.editorDrafts.records.current.get(key).returnTo, "conversation");
  ctx.previewImage = null;
  vm.runInContext(previewEffect, ctx)();
  assert.equal(ctx.preview, null);
  assert.equal(ctx.editorDrafts.records.current.get(key).drafts.comment.objects[0].text, "变成金色✨");
  assert.equal(ctx.submissions.length, 1);
  ctx.finishImageEditor();
  assert.equal(ctx.imageEditor, null);
  assert.equal(ctx.preview, null);
  assert.equal(ctx.editorDrafts.records.current.get(key).active, false);
  assert.equal(ctx.focusOptions.preventScroll, true);
});

test("preview-origin edits return to their existing preview while legacy failure drafts restore to the conversation", () => {
  const ctx = appContext();
  ctx.previewImage = { src: "existing-preview", zoom: 2 };
  ctx.preview = ctx.previewImage;
  ctx.finishImageEditor();
  assert.equal(ctx.preview, ctx.previewImage);
  assert.equal(editorDraftReturnTarget(record("/outputs/source.png")), "preview");
  assert.equal(editorDraftReturnTarget(record("restored:old")), "conversation");
  assert.equal(editorDraftReturnTarget(record("submitted:old")), "conversation");
  assert.equal(editorDraftReturnTarget({ ...record("restored:old"), returnTo: "preview" }), "preview");
});

test("missing draft/original reports recovery failure without charging or submitting", async () => {
  const ctx = appContext();
  ctx.referenceSnapshotToFile = async () => null;
  ctx.loadReusableMaskPayloadFromTurn = async () => null;
  await ctx.continueImageEdit({ meta: { image_edit_action: "local", editor_draft_key: "evicted" }, referenceSnapshots: [{ src: "gone" }] });
  assert.match(ctx.notice, /原图/);
  assert.equal(ctx.submissions.length, 0);
});

test("older local tasks recover the saved original, selection and instruction before opening", async () => {
  const ctx = appContext();
  const file = editorDraftFile(record());
  ctx.referenceSnapshotToFile = async () => file;
  ctx.loadReusableMaskPayloadFromTurn = async () => ({ maskFile: new File(["selection"], "mask.png"), encoding: "compat" });
  await ctx.continueImageEdit({ id: "old", prompt: "添加加号", meta: { mask_used: true }, referenceSnapshots: [{ src: "original" }] });
  assert.equal(ctx.imageEditor.sourceKey, "restored:old");
  assert.equal(ctx.imageEditor.returnTo, "conversation");
  assert.equal(ctx.preview, null);
  const restored = ctx.editorDrafts.records.current.get("restored:old");
  assert.equal(restored.mask.instructions, "添加加号");
  assert.equal(restored.initialEncoding, "compat");
  assert.equal(await restored.initialMaskFile.text(), "selection");
  assert.equal(ctx.submissions.length, 0);
});

test("a delayed original fetch cannot overwrite a newer preview/editor request", async () => {
  const ctx = appContext();
  let resolve;
  ctx.referenceSnapshotToFile = () => new Promise((done) => { resolve = done; });
  const pending = ctx.continueImageEdit({ id: "late", meta: { image_edit_action: "comment" }, referenceSnapshots: [{ src: "original" }] });
  await new Promise(setImmediate);
  ctx.previewMaskRequestRef.current++;
  resolve(editorDraftFile(record()));
  await pending;
  assert.equal(ctx.imageEditor.sourceKey, "original");
  assert.equal(ctx.preview, undefined);
});

test("background instructions explicitly preserve original canvas, position and scale", () => {
  for (const constraint of ["原始画布尺寸", "位置、大小、比例", "重新居中", "不要重绘", "光晕"]) assert.ok(REMOVE_BACKGROUND_PROMPT.includes(constraint));
});

test("actual mask preparation replays restored brush/eraser history on top of the baseline and retains export encoding", async () => {
  const source = ts.createSourceFile("MaskEditor.tsx", fs.readFileSync(new URL("./MaskEditor.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let prepare, rebuild;
  const functions = {};
  function scan(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions[node.name.text] = node.getText(source);
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect" && node.arguments[0]?.getText(source).includes("async function prepare")) prepare = node.arguments[0].getText(source);
    ts.forEachChild(node, scan);
  }
  scan(source); rebuild = functions.rebuildOverlay;
  const operations = [];
  const context = new Proxy({ createImageData: () => ({ data: new Uint8ClampedArray(4) }), getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 0]) }) }, {
    get(target, key) { return target[key] ?? ((...args) => operations.push([key, ...args])); },
  });
  const canvas = () => ({ width: 64, height: 64, getContext: () => context });
  const draft = { ...record().mask, encoding: "compat", commands: [
    { kind: "stroke", tool: "brush", size: 8, points: [{ x: 3, y: 5 }] },
    { kind: "stroke", tool: "eraser", size: 4, points: [{ x: 8, y: 9 }] },
  ] };
  const ctx = { structuredClone, initialDraft: draft, initialEncoding: "standard", normalizeMaskEncoding: (s) => s,
    initialMaskFile: new Blob(["mask"]), file: new Blob(["image"]), MAX_MASK_PIXELS: 8294400,
    commandsRef: { current: [] }, redoRef: { current: [] }, cursorClientRef: { current: null }, baselineCanvasRef: { current: null },
    baseCanvasRef: { current: canvas() }, overlayCanvasRef: { current: canvas() }, cursorCanvasRef: { current: canvas() },
    dialogRef: { current: null }, clearBrushCursor() {}, maskAlphaSelectsPixel: (alpha, enc) => enc === "standard" ? alpha < 128 : alpha >= 128,
    MASK_COLOR: "red", clamp: (v, min, max) => Math.min(max, Math.max(min, v)), document: { createElement: canvas },
    async loadImage() { return { naturalWidth: 64, naturalHeight: 64 }; }, t: (s) => s,
    setReady: (value) => { ctx.ready = value; }, setEncoding: (value) => { ctx.encoding = value; },
    setError: (value) => { ctx.error = value; }, setTimeout,
  };
  for (const name of ["setDimensions", "setFitScale", "setZoom", "setPan", "setHistoryVersion", "setBrushSize"]) ctx[name] = () => {};
  vm.createContext(ctx);
  for (const name of ["drawStroke", "drawCommand"]) vm.runInContext(ts.transpileModule(functions[name], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  vm.runInContext(ts.transpileModule(rebuild, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  const run = vm.runInContext(ts.transpileModule(`(${prepare})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  const cleanup = run();
  await new Promise(setImmediate);
  assert.equal(ctx.error, ""); assert.equal(ctx.ready, true); assert.equal(ctx.encoding, "compat");
  assert.deepEqual(ctx.commandsRef.current, draft.commands);
  assert.deepEqual(operations.filter(([name]) => name === "arc").map((item) => item.slice(1, 4)), [[3, 5, 4], [8, 9, 2]]);
  assert.ok(operations.some(([name]) => name === "putImageData"));
  cleanup();
});

test("actual persistence hook restores only the active draft and serializes newer saves behind older writes", async () => {
  const source = fs.readFileSync(new URL("./useEditorDrafts.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, "").replace("export function", "function"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const effects = [], listeners = {}, saved = [];
  let releaseFirst, failed = 0, recovered;
  const ctx = {
    structuredClone, Date, setTimeout, clearTimeout,
    useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect),
    window: { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} },
    document: { visibilityState: "visible", addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} },
    async loadEditorDrafts() { return [{ ...record("closed"), active: false }, record("open")]; },
    async saveEditorDrafts(items) {
      saved.push(items);
      if (saved.length === 1) await new Promise((resolve) => { releaseFirst = resolve; });
    },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const hook = ctx.useEditorDrafts((r) => { recovered = r; }, () => { failed++; }, true);
  const cleanup = effects[0]();
  await new Promise(setImmediate);
  assert.equal(recovered.sourceKey, "open");
  hook.put(record("new"));
  assert.equal(hook.records.current.get("open").active, false);
  const first = hook.flush();
  await new Promise(setImmediate);
  hook.put({ ...record("new"), active: false, action: "local" });
  const second = hook.flush();
  assert.equal(saved.length, 1);
  releaseFirst(); await first; await second;
  assert.equal(saved[0].find((r) => r.sourceKey === "new").active, true);
  assert.equal(saved[1].find((r) => r.sourceKey === "new").active, false);
  assert.equal(saved[1].find((r) => r.sourceKey === "new").action, "local");
  assert.equal(failed, 0);
  assert.equal(typeof listeners.pagehide, "function");
  ctx.saveEditorDrafts = async () => { throw new Error("full"); };
  hook.put({ ...record("new"), active: false });
  await hook.flush();
  assert.equal(failed, 1);
  assert.ok(hook.records.current.has("new"));
  cleanup();
});
