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

test("cancel then remove waits for one shared cancellation before removing", async () => {
  assert.equal(typeof jobProtocol.cancelJobThenRemove, "function");
  const pending = new Map();
  const calls = { cancel: 0, abort: 0, deleteTracking: 0, remove: 0 };
  let resolveCancel = () => {};
  const deferredCancel = new Promise((resolve) => {
    resolveCancel = resolve;
  });
  const options = {
    jobId: "job-pending-remove",
    pending,
    cancel: async () => {
      calls.cancel += 1;
      await deferredCancel;
      calls.abort += 1;
      calls.deleteTracking += 1;
    },
    remove: () => {
      calls.remove += 1;
    },
  };

  const first = jobProtocol.cancelJobThenRemove(options);
  const second = jobProtocol.cancelJobThenRemove(options);
  await Promise.resolve();

  assert.equal(first, second);
  assert.equal(calls.cancel, 1);
  assert.deepEqual(calls, { cancel: 1, abort: 0, deleteTracking: 0, remove: 0 });
  assert.equal(pending.get(options.jobId), first);

  resolveCancel();
  await Promise.all([first, second]);

  assert.deepEqual(calls, { cancel: 1, abort: 1, deleteTracking: 1, remove: 1 });
  assert.equal(pending.has(options.jobId), false);
});

test("cancel then remove still removes after cancellation fails", async () => {
  assert.equal(typeof jobProtocol.cancelJobThenRemove, "function");
  const pending = new Map();
  let removeCalls = 0;

  await jobProtocol.cancelJobThenRemove({
    jobId: "job-failed-remove",
    pending,
    cancel: async () => {
      throw new Error("cancel failed");
    },
    remove: () => {
      removeCalls += 1;
    },
  });

  assert.equal(removeCalls, 1);
  assert.equal(pending.size, 0);
});
