import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const sourcePath = path.join(root, "src", "sizeRules.ts");
const presetSourcePath = path.join(root, "src", "sizePresets.ts");
const tempDir = await mkdtemp(path.join(os.tmpdir(), "web-imagen-size-rules-"));
const outfile = path.join(tempDir, "sizeRules.mjs");
const presetOutfile = path.join(tempDir, "sizePresets.mjs");

try {
  const program = ts.createProgram([sourcePath, presetSourcePath], {
    module: ts.ModuleKind.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2020,
    strict: true,
    skipLibCheck: true,
    outDir: tempDir,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }));
  }
  const emitResult = program.emit(undefined, (fileName, data) => {
    if (fileName.endsWith(".js")) {
      if (fileName.endsWith("sizeRules.js")) ts.sys.writeFile(outfile, data);
      if (fileName.endsWith("sizePresets.js")) {
        ts.sys.writeFile(presetOutfile, data.replace('from "./sizeRules";', 'from "./sizeRules.mjs";'));
      }
    }
  });
  if (emitResult.emitSkipped) {
    throw new Error("TypeScript emit skipped");
  }

  const {
    GPT_CUSTOM_SIZE_MAX,
    GPT_CUSTOM_SIZE_MAX_PIXELS,
    GPT_CUSTOM_SIZE_MAX_RATIO,
    normalizeCustomImageSize,
  } = await import(pathToFileURL(outfile).href);
  const {
    gptComposerAspectOptions,
    gptComposerSizeTiers,
    resolveGptComposerPresetSize,
  } = await import(pathToFileURL(presetOutfile).href);

  assert.equal(GPT_CUSTOM_SIZE_MAX, 3840);
  assert.equal(GPT_CUSTOM_SIZE_MAX_RATIO, 3);
  assert.equal(GPT_CUSTOM_SIZE_MAX_PIXELS, 2880 * 2880);

  assert.deepEqual(normalizeCustomImageSize("2048x1024"), {
    value: "2048x1024",
    label: "2048 x 1024",
    adjusted: false,
    roundedToMultiple: false,
    clampedToMax: false,
    adjustedRatio: false,
    adjustedPixelRange: null,
    notice: "",
  });

  assert.deepEqual(normalizeCustomImageSize("1123x865"), {
    value: "1120x864",
    label: "1120 x 864",
    adjusted: true,
    roundedToMultiple: true,
    clampedToMax: false,
    adjustedRatio: false,
    adjustedPixelRange: null,
    notice: "尺寸已自动调整为 1120 x 864（按 16 倍数）",
  });

  assert.deepEqual(normalizeCustomImageSize("999999x17"), {
    value: "3840x1280",
    label: "3840 x 1280",
    adjusted: true,
    roundedToMultiple: true,
    clampedToMax: true,
    adjustedRatio: true,
    adjustedPixelRange: null,
    notice: "尺寸已自动调整为 3840 x 1280（单边不超过 3840，按 16 倍数，比例不超过 3:1）",
  });

  assert.deepEqual(normalizeCustomImageSize("3840x3840"), {
    value: "2880x2880",
    label: "2880 x 2880",
    adjusted: true,
    roundedToMultiple: false,
    clampedToMax: false,
    adjustedRatio: false,
    adjustedPixelRange: "max",
    notice: "尺寸已自动调整为 2880 x 2880（总像素不超过 2880 x 2880）",
  });

  assert.deepEqual(normalizeCustomImageSize("3840x960"), {
    value: "3840x1280",
    label: "3840 x 1280",
    adjusted: true,
    roundedToMultiple: false,
    clampedToMax: false,
    adjustedRatio: true,
    adjustedPixelRange: null,
    notice: "尺寸已自动调整为 3840 x 1280（比例不超过 3:1）",
  });

  assert.deepEqual(gptComposerSizeTiers, ["auto", "1K", "2K", "4K"]);
  assert.ok(gptComposerAspectOptions.includes("21:9"));
  assert.ok(gptComposerAspectOptions.includes("9:21"));
  assert.equal(resolveGptComposerPresetSize("auto", "16:9"), "auto");
  assert.equal(resolveGptComposerPresetSize("1K", "16:9"), "1536x864");
  assert.equal(resolveGptComposerPresetSize("2K", "1:1"), "2048x2048");
  assert.equal(resolveGptComposerPresetSize("4K", "1:1"), "2880x2880");
  assert.equal(resolveGptComposerPresetSize("4K", "16:9"), "3840x2160");
  assert.equal(resolveGptComposerPresetSize("4K", "21:9"), "3840x1648");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
