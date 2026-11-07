import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { imageExtraBodyError, IMAGE_OUTPUT_FORMATS } from "./imageOutputSettings.ts";
import { buildSubmissionFields } from "./submissionPayload.ts";
import { profileFormSnapshot } from "./configProfiles.ts";
import { CONFIG_TRANSFER_FORM_KEYS } from "./configTransfer.ts";

test("extra image parameters accept new fields and reject invalid or conflicting objects", () => {
  for (const text of ["", "{}", '{"complexity":"low","future":{"enabled":true}}']) assert.equal(imageExtraBodyError(text), "");
  for (const text of ["[]", "null", "3", "broken"]) assert.equal(imageExtraBodyError(text), "settings.extraBodyInvalid");
  for (const text of ['{"model":"override"}', '{"output_format":"svg"}', '{"stream":true}', '{"__proto__":{}}']) assert.equal(imageExtraBodyError(text), "settings.extraBodyReserved");
  assert.equal(imageExtraBodyError(JSON.stringify({ a: "x".repeat(17000) })), "settings.extraBodyTooLarge");
});

test("GIF settings and extension draft survive submission snapshots without losing JSON types", () => {
  assert.ok(IMAGE_OUTPUT_FORMATS.includes("gif"));
  const extra = '{"future":{"enabled":true}}';
  const fields = Object.fromEntries(buildSubmissionFields("gpt-image-2", "wave", { output_format: "gif", frame_count: 9, frame_duration_ms: 200, extra_body: extra }, {}));
  assert.equal(fields.output_format, "gif");
  assert.equal(fields.frame_count, "9");
  assert.equal(fields.extra_body, extra);
});

test("extra parameters are exportable and do not leak between connection profiles", () => {
  assert.ok(CONFIG_TRANSFER_FORM_KEYS["gpt-image-2"].includes("extra_body"));
  assert.equal(profileFormSnapshot({ extra_body: '{"complexity":"low"}' }, { model: "other" }).extra_body, "");
  assert.equal(profileFormSnapshot({ extra_body: "" }, { extra_body: '{"complexity":"high"}' }).extra_body, '{"complexity":"high"}');
});

test("actual composer exposes GIF format and frame controls on both desktop and web", () => {
  const source = ts.createSourceFile("App.tsx", fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let attribute;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === "className" && node.initializer?.text === "choice-grid output-formats") attribute = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(attribute);
  let node = attribute.parent;
  while (node && !ts.isJsxExpression(node)) node = node.parent;
  const js = ts.transpileModule(`(${node.expression.getText(source)})`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const React = { Fragment: "fragment", createElement(type, props, ...children) { return { type, props, children: children.flat(Infinity).filter(Boolean) }; } };
  for (const desktopMode of [true, false]) {
    const ctx = { desktopMode, activeEngine: "gpt-image-2", React, Field: "Field", IMAGE_OUTPUT_FORMATS, imageOutputLabel: (v) => v, t: key => key,
      gptForm: { output_format: "auto", frame_count: 9, frame_duration_ms: 200 }, setGptForm(value) { ctx.gptForm = value; } };
    let tree = vm.runInNewContext(js, ctx);
    const walk = (element) => element && typeof element === "object" ? [element, ...(element.children || []).flatMap(walk)] : [];
    let nodes = walk(tree);
    nodes.find(element => element.type === "button" && element.props.key === "gif").props.onClick();
    assert.equal(ctx.gptForm.output_format, "gif");
    nodes = walk(vm.runInNewContext(js, ctx));
    const frames = nodes.filter(element => element.type === "input");
    assert.equal(frames.length, 2);
    frames[0].props.onChange({ target: { value: "12" } });
    assert.equal(ctx.gptForm.frame_count, 12);
  }
});
