import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const moduleUrl = pathToFileURL(path.resolve("src/submissionPayload.ts")).href;
const payloadModule = await import(moduleUrl);

test("buildSubmissionFields includes prompt and gpt text drafts", () => {
  const fields = payloadModule.buildSubmissionFields(
    "gpt-image-2",
    "蓝色闪电斩击",
    {
      api_key: "sk",
      size: "auto",
      quality: "auto",
    },
    {},
    {
      negative_prompt: "blurry",
      poster_text: "雷光",
    },
  );

  assert.ok(fields.some(([key, value]) => key === "prompt" && value === "蓝色闪电斩击"));
  assert.ok(fields.some(([key, value]) => key === "negative_prompt" && value === "blurry"));
  assert.ok(fields.some(([key, value]) => key === "poster_text" && value === "雷光"));
});

test("buildSubmissionFields includes banana prompt as explicit field", () => {
  const fields = payloadModule.buildSubmissionFields(
    "banana",
    "橙色爆炸波",
    {},
    {
      api_key: "sk",
      batch_size: 1,
    },
  );

  assert.ok(fields.some(([key, value]) => key === "prompt" && value === "橙色爆炸波"));
});
