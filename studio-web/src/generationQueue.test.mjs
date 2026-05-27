import test from "node:test";
import assert from "node:assert/strict";
import {
  appendGenerationQueueJob,
  nextGenerationJobStatus,
  nextQueuedGenerationJob,
  hasRunningGenerationJob,
} from "./generationQueue.ts";

test("new generation jobs wait when another generation is running", () => {
  const jobs = [
    { id: "job-running", status: "running", createdAt: "2026-05-26T08:00:00.000Z" },
  ];

  assert.equal(nextGenerationJobStatus(jobs), "queued");
});

test("new generation jobs can start when no generation is running", () => {
  const jobs = [
    { id: "job-done", status: "success", createdAt: "2026-05-26T08:00:00.000Z" },
  ];

  assert.equal(nextGenerationJobStatus(jobs), "running");
});

test("scheduler starts the oldest queued job first", () => {
  const jobs = [
    { id: "job-newer", status: "queued", createdAt: "2026-05-26T08:02:00.000Z" },
    { id: "job-running", status: "success", createdAt: "2026-05-26T08:00:00.000Z" },
    { id: "job-older", status: "queued", createdAt: "2026-05-26T08:01:00.000Z" },
  ];

  assert.equal(nextQueuedGenerationJob(jobs)?.id, "job-older");
});

test("scheduler does not start queued jobs while one is running", () => {
  const jobs = [
    { id: "job-newer", status: "queued", createdAt: "2026-05-26T08:02:00.000Z" },
    { id: "job-running", status: "running", createdAt: "2026-05-26T08:00:00.000Z" },
    { id: "job-older", status: "queued", createdAt: "2026-05-26T08:01:00.000Z" },
  ];

  assert.equal(hasRunningGenerationJob(jobs), true);
  assert.equal(nextQueuedGenerationJob(jobs), undefined);
});

test("queue trimming preserves active jobs before trimming finished history", () => {
  const finished = Array.from({ length: 30 }, (_, index) => ({
    id: `job-finished-${index}`,
    status: "success",
    createdAt: `2026-05-26T08:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  const running = { id: "job-running", status: "running", createdAt: "2026-05-26T07:00:00.000Z" };
  const next = { id: "job-new", status: "queued", createdAt: "2026-05-26T09:00:00.000Z" };

  const jobs = appendGenerationQueueJob([running, ...finished], next, 30);

  assert.equal(jobs.length, 30);
  assert.ok(jobs.some((job) => job.id === "job-running"));
  assert.ok(jobs.some((job) => job.id === "job-new"));
});
