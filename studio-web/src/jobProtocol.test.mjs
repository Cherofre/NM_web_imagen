import test from "node:test";
import assert from "node:assert/strict";

import {
  appendJobId,
  cancellationNotice,
  cancelJobUrl,
  withJobId,
} from "./jobProtocol.ts";

test("generation form data and chat JSON carry the same job id", () => {
  const jobId = "job-123";
  const form = appendJobId(new FormData(), jobId);
  const chat = withJobId({ prompt: "hello" }, jobId);

  assert.equal(form.get("job_id"), jobId);
  assert.equal(chat.job_id, jobId);
  assert.equal(chat.prompt, "hello");
});

test("cancel URL safely encodes the entire job id", () => {
  assert.equal(
    cancelJobUrl("job/a b:中文"),
    "/api/jobs/job%2Fa%20b%3A%E4%B8%AD%E6%96%87/cancel",
  );
});

test("cancellation notices explain that upstream work or billing may continue", () => {
  assert.match(cancellationNotice("zh-CN"), /仍可能.*(?:运行|计费)/);
  assert.match(cancellationNotice("zh-CN"), /计费/);
  assert.match(cancellationNotice("en"), /may still run/i);
  assert.match(cancellationNotice("en"), /bill/i);
});
