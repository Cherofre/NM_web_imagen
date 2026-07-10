import test from "node:test";
import assert from "node:assert/strict";

import * as jobProtocol from "./jobProtocol.ts";

const {
  appendJobId,
  cancellationNotice,
  cancelJobUrl,
  withJobId,
} = jobProtocol;

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

test("cancellation marks synchronously and waits for server settlement before abort cleanup", async () => {
  assert.equal(typeof jobProtocol.cancelJobBeforeAbort, "function");
  const events = [];
  let payloadPresent = true;
  let canceling = false;
  let runnerCalls = 0;
  let resolveRequest = () => {};
  const deferredRequest = new Promise((resolve) => {
    resolveRequest = resolve;
  });

  const cancellation = jobProtocol.cancelJobBeforeAbort({
    markCanceling: () => {
      events.push("mark");
      canceling = true;
      payloadPresent = false;
    },
    requestCancel: () => {
      events.push("request");
      return deferredRequest;
    },
    abort: () => events.push("abort"),
    cleanup: () => events.push("cleanup"),
  });

  if (!canceling && payloadPresent) runnerCalls += 1;
  assert.equal(runnerCalls, 0);
  assert.deepEqual(events, ["mark", "request"]);

  resolveRequest("server-canceled");
  assert.equal(await cancellation, "server-canceled");
  assert.deepEqual(events, ["mark", "request", "abort", "cleanup"]);
});

test("cancellation always aborts and cleans up when server cancellation fails", async () => {
  assert.equal(typeof jobProtocol.cancelJobBeforeAbort, "function");
  for (const requestCancel of [
    () => {
      throw new Error("HTTP 500");
    },
    () => Promise.reject(new Error("network rejected")),
  ]) {
    let markCalls = 0;
    let abortCalls = 0;
    let cleanupCalls = 0;

    await assert.rejects(
      jobProtocol.cancelJobBeforeAbort({
        markCanceling: () => {
          markCalls += 1;
        },
        requestCancel,
        abort: () => {
          abortCalls += 1;
        },
        cleanup: () => {
          cleanupCalls += 1;
        },
      }),
    );

    assert.equal(markCalls, 1);
    assert.equal(abortCalls, 1);
    assert.equal(cleanupCalls, 1);
  }
});
