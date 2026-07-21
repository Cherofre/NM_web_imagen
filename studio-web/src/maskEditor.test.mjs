import test from "node:test";
import assert from "node:assert/strict";

const masks = await import("./maskEditorModel.ts");

function fileLike(name, size, lastModified, type = "image/png") {
  return { name, size, lastModified, type };
}

test("reference fingerprint is stable and changes with the base image identity", () => {
  const first = fileLike("base.png", 120, 10);
  assert.equal(masks.referenceFileFingerprint(first), masks.referenceFileFingerprint({ ...first }));
  assert.notEqual(masks.referenceFileFingerprint(first), masks.referenceFileFingerprint({ ...first, size: 121 }));
  assert.notEqual(masks.referenceFileFingerprint(first), masks.referenceFileFingerprint({ ...first, lastModified: 11 }));
});

test("preview mask editing promotes the selected image to the first reference", () => {
  const first = fileLike("first.png", 120, 10);
  const second = fileLike("second.png", 121, 11);
  const selected = fileLike("selected.png", 122, 12);

  assert.deepEqual(masks.referencesWithMaskBase([first, second], second, 16), [second, first]);
  assert.deepEqual(masks.referencesWithMaskBase([first, second], selected, 2), [selected, first]);
});

test("mask editor is available only for GPT generation with a reference image", () => {
  assert.deepEqual(masks.maskEditorCapability("gpt-image-2", "generate", 1), {
    available: true,
    reasonKey: null,
  });
  assert.equal(masks.maskEditorCapability("banana", "generate", 1).available, false);
  assert.equal(masks.maskEditorCapability("gpt-image-2", "chat", 1).available, false);
  assert.equal(masks.maskEditorCapability("gpt-image-2", "generate", 0).available, false);
});

test("mask attachment becomes inactive when the first reference changes", () => {
  const base = fileLike("base.png", 120, 10);
  const mask = fileLike("mask.png", 48, 20);
  const attachment = {
    baseFingerprint: masks.referenceFileFingerprint(base),
    baseFile: base,
    maskFile: mask,
  };

  assert.strictEqual(masks.activeMaskAttachment(attachment, [base]), attachment);
  assert.equal(masks.activeMaskAttachment(attachment, [fileLike("other.png", 120, 10)]), null);
  assert.equal(masks.activeMaskAttachment(attachment, [{ ...base }]), null);
  assert.equal(masks.activeMaskAttachment(attachment, []), null);
});

test("reusable mask payload drops the old base and rebinds to a regenerated base", () => {
  const originalBase = fileLike("base.png", 120, 10);
  const regeneratedBase = fileLike("base.png", 120, 20);
  const mask = fileLike("mask.png", 48, 30);
  const preview = fileLike("mask-preview.webp", 24, 30, "image/webp");
  const payload = masks.reusableMaskPayload({
    baseFingerprint: masks.referenceFileFingerprint(originalBase),
    baseFile: originalBase,
    maskFile: mask,
    previewFile: preview,
    coverage: 0.42,
    encoding: "compat",
  });

  assert.equal("baseFile" in payload, false);
  assert.strictEqual(payload.maskFile, mask);
  assert.strictEqual(payload.previewFile, preview);

  const restored = masks.restoreReusableMaskAttachment(payload, regeneratedBase);
  assert.strictEqual(restored.baseFile, regeneratedBase);
  assert.strictEqual(restored.maskFile, mask);
  assert.equal(restored.coverage, 0.42);
  assert.equal(restored.encoding, "compat");
  assert.strictEqual(masks.activeMaskAttachment(restored, [regeneratedBase]), restored);
  assert.equal(masks.activeMaskAttachment(restored, [originalBase]), null);
});

test("mask submission accepts auto or edits and rejects other endpoints", () => {
  assert.equal(masks.resolveMaskEndpoint("auto", true), "/v1/images/edits");
  assert.equal(masks.resolveMaskEndpoint("/v1/images/edits", true), "/v1/images/edits");
  assert.equal(masks.resolveMaskEndpoint("/v1/responses", false), "/v1/responses");
  assert.throws(() => masks.resolveMaskEndpoint("/v1/images/generations", true), /编辑接口/);
  assert.throws(() => masks.resolveMaskEndpoint("/v1/responses", true), /编辑接口/);
});

test("mask encoding supports official and reverse-alpha gateway semantics", () => {
  assert.equal(masks.maskAlphaSelectsPixel(0, "standard"), true);
  assert.equal(masks.maskAlphaSelectsPixel(255, "standard"), false);
  assert.equal(masks.maskAlphaSelectsPixel(0, "compat"), false);
  assert.equal(masks.maskAlphaSelectsPixel(255, "compat"), true);
  assert.equal(masks.normalizeMaskEncoding("compat"), "compat");
  assert.equal(masks.normalizeMaskEncoding("unexpected"), "standard");
});

test("masked edits require a concrete target instead of a generic style change", () => {
  assert.equal(masks.maskPromptHasSpecificTarget("只修改红色遮罩覆盖的部分，让那个区域换一种风格。"), false);
  assert.equal(masks.maskPromptHasSpecificTarget("遮罩部分换一下。"), false);
  assert.equal(masks.maskPromptHasSpecificTarget("把遮罩区域换成另一种风格。"), false);
  assert.equal(masks.maskPromptHasSpecificTarget("Change the mask to a different style."), false);
  assert.equal(masks.maskPromptHasSpecificTarget("把涂红的外部背景改成夜晚城市，人物保持不变。"), true);
  assert.equal(masks.maskPromptHasSpecificTarget("Remove the people inside the mask."), true);
});

test("generation file helper appends reference files before the mask snapshot", () => {
  const base = new File(["base"], "base.png", { type: "image/png", lastModified: 1 });
  const second = new File(["second"], "second.png", { type: "image/png", lastModified: 2 });
  const mask = new File(["mask"], "mask.png", { type: "image/png", lastModified: 3 });
  const form = new FormData();

  masks.appendGenerationFiles(form, [base, second], mask);

  assert.deepEqual([...form.keys()], ["reference_files", "reference_files", "mask_file"]);
  assert.strictEqual(form.getAll("reference_files")[0], base);
  assert.strictEqual(form.get("mask_file"), mask);
});

test("mask preview dimensions preserve aspect ratio inside a compact edge", () => {
  assert.deepEqual(masks.maskPreviewDimensions(1600, 900, 384), { width: 384, height: 216 });
  assert.deepEqual(masks.maskPreviewDimensions(900, 1600, 384), { width: 216, height: 384 });
  assert.deepEqual(masks.maskPreviewDimensions(240, 180, 384), { width: 240, height: 180 });
});

test("mask canvas fit scale keeps the complete image inside the real stage", () => {
  const portraitScale = masks.maskCanvasFitScale(800, 600, 1000, 2000, 12);
  assert.ok(Math.abs(portraitScale - 0.288) < 0.000001);
  assert.ok(1000 * portraitScale <= 800 - 24);
  assert.ok(2000 * portraitScale <= 600 - 24);

  const landscapeScale = masks.maskCanvasFitScale(800, 600, 2000, 1000, 12);
  assert.ok(Math.abs(landscapeScale - 0.388) < 0.000001);
  assert.ok(2000 * landscapeScale <= 800 - 24);
  assert.ok(1000 * landscapeScale <= 600 - 24);

  assert.equal(masks.maskCanvasFitScale(800, 600, 100, 100, 12), 1);
  assert.equal(masks.maskCanvasFitScale(0, 600, 1000, 1000, 12), 1);
});
