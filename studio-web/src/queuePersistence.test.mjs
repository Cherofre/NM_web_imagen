import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStoredQueueJobs, serializeQueueJobs } from "./queuePersistence.ts";

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
  assert.equal(jobs[0].error, "页面刷新，任务已中断");
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
