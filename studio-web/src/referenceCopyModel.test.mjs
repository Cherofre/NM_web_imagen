import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";
import { ReferenceImageIdentity, mergeCopiedReference } from "./referenceCopyModel.ts";
import { referenceUiState } from "./chatCapabilities.ts";

const file = (bytes, name = "same.png", lastModified = 1) => new File([bytes], name, { type: "image/png", lastModified });

test("editor content keys reject metadata collisions, reuse renamed content and prefer inherited output sources", async () => {
  const identity = new ReferenceImageIdentity(), original = file("A"), different = file("B");
  assert.notEqual(await identity.key(original), await identity.key(different));
  assert.equal(await identity.key(original), await identity.key(file("A", "renamed.png", 999)));
  identity.setSource(original, "/outputs/known.png?cache=1");
  const exported = file("re-encoded"); identity.inheritSource(exported, original);
  assert.equal(await identity.key(exported), "/outputs/known.png");
});

test("HTTP fallback produces the same SHA-256 content key for empty, multi-block and image-sized data", async () => {
  const ctx = { exports: {}, URL, Uint8Array, Uint32Array, DataView, crypto: undefined };
  vm.createContext(ctx);
  vm.runInContext(ts.transpileModule(fs.readFileSync(new URL("referenceCopyModel.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, ctx);
  const identity = new ctx.exports.ReferenceImageIdentity();
  for (const bytes of ["", "abc", "中文".repeat(50), new Uint8Array(1024 * 1024).map((_, i) => i % 251)]) {
    const blob = new Blob([bytes]);
    assert.equal(await identity.key(blob), `sha256:${createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex")}`);
  }
});

test("content identity recognizes different names/timestamps and rejects identical filenames with different bytes", async () => {
  const identity = new ReferenceImageIdentity();
  const source = file("image", "original.png", 1), duplicate = file("image", "renamed.png", 2), different = file("other", "original.png", 1);
  const matches = await identity.matches(source, [duplicate, different], "/outputs/image.png");
  assert.equal(matches.has(duplicate), true); assert.equal(matches.has(different), false);
});

test("known sources and exported bases reuse image identity even when PNG encoding changes", async () => {
  const identity = new ReferenceImageIdentity(), original = file("original"), exported = file("re-encoded"), downloaded = file("different encoding again");
  identity.setSource(original, "http://127.0.0.1:7861/outputs/image.png?cache=1");
  identity.inheritSource(exported, original);
  const matches = await identity.matches(downloaded, [exported], "/outputs/image.png?cache=2");
  assert.equal(matches.has(exported), true);
});

test("content matching also works without WebCrypto in an insecure shared-browser context", async () => {
  const source = fs.readFileSync(new URL("referenceCopyModel.ts", import.meta.url), "utf8");
  const ctx = { exports: {}, URL, Uint8Array, crypto: undefined };
  vm.createContext(ctx);
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, ctx);
  const identity = new ctx.exports.ReferenceImageIdentity();
  const same = file("same"), different = file("diff");
  const matches = await identity.matches(file("same"), [same, different], "/outputs/image.png");
  assert.equal(matches.has(same), true); assert.equal(matches.has(different), false);
});

test("selected duplicates merge around the earliest original without moving other references or invalidating its mask identity", () => {
  const original = file("image"), duplicate = file("image", "other.png"), other = file("other");
  const result = mergeCopiedReference([original, other, duplicate], file("image"), new Set([original, duplicate]), 3);
  assert.deepEqual(result.files, [original, other]); assert.equal(result.selected, original);
  assert.equal(result.reused, true); assert.equal(result.removed, 1);
  assert.equal(mergeCopiedReference([other], original, new Set(), 1).blocked, true);
  assert.equal(mergeCopiedReference([original], duplicate, new Set([original]), 1).blocked, false);
});

const ast = ts.createSourceFile("App.tsx", fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "continueFromTurn") handler = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
function context(references = []) {
  const ctx = {
    referenceUiState, mergeCopiedReference,
    references, referenceFilesRef: { current: references }, referenceImageIdentity: { current: new ReferenceImageIdentity() },
    copyInputLock: { current: false }, submitModeRef: { current: "generate" }, activeSessionIdRef: { current: "session" }, referenceEngineRef: { current: "gpt-image-2" },
    t: (key, params) => key + (params ? JSON.stringify(params) : ""), imageSrc: (image) => image?.src, imageName: (image) => image?.name,
    prompt: "unfinished prompt", copied: null, notices: [], downloads: 0,
    async outputReferenceFile() { ctx.downloads++; return file("image", "download.png", ctx.downloads); },
    setReferences(value) { ctx.references = value; ctx.referenceFilesRef.current = value; },
    applyPrompt(value) { ctx.prompt = value; }, setCopiedReference(value) { ctx.copied = value; },
    setCopyInputSource(value) { ctx.loading = value; }, setNotice(value) { ctx.notices.push(value); },
  };
  vm.createContext(ctx);
  vm.runInContext(ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  return ctx;
}
const image = { src: "/outputs/image.png", name: "image.png" }, turn = { prompt: "copied prompt" };

test("actual copy handler reuses same image and removes existing duplicates, retaining references and clear feedback", async () => {
  const original = file("image"), other = file("other"), duplicate = file("image", "duplicate.png");
  const ctx = context([original, other, duplicate]);
  await ctx.continueFromTurn(turn, image);
  assert.deepEqual(ctx.references, [original, other]); assert.equal(ctx.prompt, turn.prompt);
  assert.equal(ctx.copied.file, original); assert.equal(ctx.copied.source, image.src);
  assert.match(ctx.notices.at(-1), /copyReused.*copyMerged/);
  await ctx.continueFromTurn(turn, image);
  assert.equal(ctx.references.length, 2); assert.equal(ctx.references[0], original);
  assert.equal(ctx.loading, null);
});

test("actual copy handler appends a new image and copies the prompt after a successful load", async () => {
  const other = file("other");
  const ctx = context([other]);
  await ctx.continueFromTurn(turn, image);
  assert.equal(ctx.references.length, 2); assert.equal(ctx.references[0], other);
  assert.equal(ctx.copied.file, ctx.references[1]); assert.equal(ctx.prompt, turn.prompt);
  assert.equal(ctx.notices.at(-1), "reference.copyAdded");
});

test("failed downloads and full reference sets preserve the user's prompt; full sets can still reuse an existing image", async () => {
  const failing = context(); failing.outputReferenceFile = async () => { throw new Error("read failed"); };
  await failing.continueFromTurn(turn, image);
  assert.equal(failing.prompt, "unfinished prompt"); assert.equal(failing.references.length, 0); assert.equal(failing.loading, null);
  const ctx = context(Array.from({ length: 16 }, (_, i) => file(`different${i}`)));
  await ctx.continueFromTurn(turn, image); assert.equal(ctx.prompt, "unfinished prompt"); assert.equal(ctx.references.length, 16);
  ctx.references[4] = file("image");
  await ctx.continueFromTurn(turn, image); assert.equal(ctx.prompt, turn.prompt); assert.equal(ctx.references.length, 16);
});

test("rapid repeat clicks submit only one copy operation, and a switched session/engine/mode cannot receive the old prompt", async () => {
  for (const change of [(ctx) => { ctx.activeSessionIdRef.current = "other"; }, (ctx) => { ctx.referenceEngineRef.current = "banana"; }, (ctx) => { ctx.submitModeRef.current = "chat"; }]) {
    const ctx = context(); let release;
    ctx.outputReferenceFile = () => { ctx.downloads++; return new Promise((resolve) => { release = resolve; }); };
    const pending = ctx.continueFromTurn(turn, image);
    await ctx.continueFromTurn(turn, image); assert.equal(ctx.downloads, 1);
    change(ctx); release(file("image")); await pending;
    assert.equal(ctx.references.length, 0); assert.equal(ctx.prompt, "unfinished prompt"); assert.equal(ctx.loading, null);
    assert.equal(ctx.notices.at(-1), "reference.copyTargetChanged");
  }
});

test("references changed during content lookup are rechecked before merging", async () => {
  const ctx = context([file("old")]);
  const identity = ctx.referenceImageIdentity.current, matches = identity.matches.bind(identity);
  let first = true;
  identity.matches = async (...args) => {
    const result = await matches(...args);
    if (first) { first = false; ctx.setReferences([file("user-added")]); }
    return result;
  };
  await ctx.continueFromTurn(turn, image);
  assert.equal(await ctx.references[0].text(), "user-added"); assert.equal(ctx.references.length, 2);
});

test("copy feedback scrolls only the reference strip and respects reduced-motion settings", () => {
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("referenceChipNodes.current.get")) effect = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(effect);
  const selected = file("image"), nodes = new WeakMap();
  nodes.set(selected, { getBoundingClientRect: () => ({ left: 500 }) });
  const strip = { scrollLeft: 40, getBoundingClientRect: () => ({ left: 100 }), scrollTo(options) { this.scrolled = options; } };
  const ctx = { copiedReference: { file: selected }, referenceChipNodes: { current: nodes }, referenceStripRef: { current: strip },
    window: { matchMedia: () => ({ matches: true }), setTimeout(fn, delay) { ctx.finishHighlight = fn; ctx.delay = delay; return 1; }, clearTimeout() {} },
    setCopiedReference(value) { ctx.copiedReference = value; } };
  vm.createContext(ctx);
  const run = vm.runInContext(ts.transpileModule(`(${effect})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  const cleanup = run();
  assert.equal(strip.scrolled.left, 432); assert.equal(strip.scrolled.behavior, "auto"); assert.equal(ctx.delay, 2600);
  ctx.finishHighlight(); assert.equal(ctx.copiedReference, null); cleanup();
});
