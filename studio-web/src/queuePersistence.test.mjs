import test from "node:test";
import assert from "node:assert/strict";
import { REFRESH_INTERRUPTED_QUEUE_ERROR, normalizeStoredQueueJobs, serializeQueueJobs } from "./queuePersistence.ts";
import { MAX_ACTIVE_QUEUE_JOBS } from "./queuePersistence.ts";
import { appendGenerationQueueJob } from "./generationQueue.ts";
import { reconcileInterruptedQueueTurns } from "./queueSessionBoundaries.ts";

test("refresh preserves all admitted active tasks beyond 30 and bounds old finished history", () => {
  let jobs = [];
  for (let index = 0; index < MAX_ACTIVE_QUEUE_JOBS; index++) jobs = appendGenerationQueueJob(jobs, {
    id: `job-${index}`, turnId: `turn-${index}`, sessionId: "session", prompt: "synthetic", engine: "gpt-image-2",
    configName: "test", model: "test", status: index === 0 ? "running" : "queued", createdAt: new Date(index).toISOString(),
  });
  const restored = normalizeStoredQueueJobs(JSON.parse(serializeQueueJobs(jobs)));
  assert.equal(restored.length, MAX_ACTIVE_QUEUE_JOBS);
  assert.ok(restored.some((job) => job.id === "job-0"));
  const [session] = reconcileInterruptedQueueTurns([{ id: "session", turns: jobs.map((job) => ({ id: job.turnId, status: job.status })) }], restored);
  assert.ok(session.turns.every((turn) => turn.status === "error"));
  assert.ok(restored.every((job) => job.status === "canceled"));
  assert.equal(normalizeStoredQueueJobs(Array.from({ length: 500 }, (_, i) => ({ ...restored[0], id: `bounded-${i}`, error: undefined, status: "success" }))).length, 30);
  const oldInterruptions = Array.from({ length: 70 }, (_, i) => ({ ...restored[0], id: `old-${i}` }));
  const currentJobs = jobs.slice(0, 40);
  const mixed = JSON.parse(serializeQueueJobs([...oldInterruptions, ...currentJobs]));
  assert.equal(mixed.length, MAX_ACTIVE_QUEUE_JOBS);
  assert.ok(currentJobs.every((job) => mixed.some((item) => item.id === job.id)), "old interrupted history must not evict newly active jobs");
  const foreign = { ...jobs[0], clientId: "other-window" };
  assert.equal(normalizeStoredQueueJobs([foreign], "this-window").length, 0);
  assert.equal(normalizeStoredQueueJobs([{ ...foreign, status: "success" }], "this-window").length, 1);
  assert.equal(normalizeStoredQueueJobs([{ ...jobs[0], clientId: "this-window" }], "this-window")[0].clientId, "this-window");
});

test("stored queue jobs preserve finished jobs and mark running jobs interrupted", () => {
  const jobs = normalizeStoredQueueJobs([
    {
      id: "job-running",
      turnId: "turn-1",
      sessionId: "session-1",
      prompt: "运行中的任务",
      engine: "gpt-image-2",
      configName: "主配置",
      model: "gpt-image-2",
      status: "running",
      createdAt: "2026-05-26T08:00:00.000Z",
    },
    {
      id: "job-success",
      turnId: "turn-2",
      sessionId: "session-1",
      prompt: "完成的任务",
      engine: "banana",
      configName: "备用",
      model: "gemini",
      status: "success",
      createdAt: "2026-05-26T08:01:00.000Z",
      images: [{ saved_url: "/outputs/a.png", saved_name: "a.png" }],
    },
  ]);

  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].status, "canceled");
  assert.equal(jobs[0].error, REFRESH_INTERRUPTED_QUEUE_ERROR);
  assert.ok(jobs[0].finishedAt);
  assert.equal(jobs[1].status, "success");
  assert.equal(jobs[1].images?.[0]?.saved_url, "/outputs/a.png");
});

test("queue serialization keeps only the newest compact jobs", () => {
  const jobs = Array.from({ length: 36 }, (_, index) => ({
    id: `job-${index}`,
    turnId: `turn-${index}`,
    sessionId: "session-1",
    prompt: `任务 ${index}`,
    engine: "gpt-image-2",
    configName: "主配置",
    model: "gpt-image-2",
    status: "success",
    createdAt: `2026-05-26T08:${String(index).padStart(2, "0")}:00.000Z`,
    images: [{ saved_url: `/outputs/${index}.png`, b64_json: "too-large" }],
  }));

  const serialized = serializeQueueJobs(jobs);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.length, 30);
  assert.equal(parsed[0].id, "job-0");
  assert.equal(parsed.at(-1).id, "job-29");
  assert.equal(parsed[0].images[0].saved_url, "/outputs/0.png");
  assert.equal(parsed[0].images[0].b64_json, undefined);
});
