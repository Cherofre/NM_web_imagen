import assert from "node:assert/strict";
import test from "node:test";

import {
  hasActiveQueueJobForSession,
  queueJobTargetExists,
  reconcileInterruptedQueueTurns,
} from "./queueSessionBoundaries.ts";

const baseSession = {
  id: "session-1",
  title: "Session",
  createdAt: "2026-05-26T10:00:00.000Z",
  updatedAt: "2026-05-26T10:00:00.000Z",
  drafts: {
    shared: { fixed_prompt: "" },
    gpt: { prompt: "", negative_prompt: "", poster_text: "" },
    banana: { prompt: "" },
  },
  turns: [
    {
      id: "turn-1",
      engine: "gpt-image-2",
      prompt: "make a crystal tree",
      createdAt: "2026-05-26T10:00:00.000Z",
      status: "running",
      images: [],
    },
  ],
};

test("active queue jobs block deleting or clearing their session", () => {
  assert.equal(
    hasActiveQueueJobForSession(
      [
        { id: "job-1", sessionId: "session-1", turnId: "turn-1", status: "running" },
        { id: "job-2", sessionId: "session-2", turnId: "turn-2", status: "success" },
      ],
      "session-1",
    ),
    true,
  );

  assert.equal(
    hasActiveQueueJobForSession([{ id: "job-1", sessionId: "session-1", turnId: "turn-1", status: "canceled" }], "session-1"),
    false,
  );
});

test("queue job target existence checks both session and turn", () => {
  assert.equal(
    queueJobTargetExists([baseSession], { id: "job-1", sessionId: "session-1", turnId: "turn-1" }),
    true,
  );
  assert.equal(
    queueJobTargetExists([baseSession], { id: "job-1", sessionId: "missing", turnId: "turn-1" }),
    false,
  );
  assert.equal(
    queueJobTargetExists([baseSession], { id: "job-1", sessionId: "session-1", turnId: "missing" }),
    false,
  );
});

test("interrupted queue jobs reconcile matching running turns after refresh", () => {
  const sessions = reconcileInterruptedQueueTurns(
    [baseSession],
    [
      {
        id: "job-1",
        sessionId: "session-1",
        turnId: "turn-1",
        status: "canceled",
        error: "__refresh_interrupted__",
        finishedAt: "2026-05-26T10:05:00.000Z",
      },
    ],
  );

  assert.equal(sessions[0].turns[0].status, "error");
  assert.equal(sessions[0].turns[0].error, "__refresh_interrupted__");
  assert.equal(sessions[0].turns[0].finishedAt, "2026-05-26T10:05:00.000Z");
});

test("interrupted queue reconciliation keeps legacy stored Chinese markers compatible", () => {
  const sessions = reconcileInterruptedQueueTurns(
    [baseSession],
    [
      {
        id: "job-1",
        sessionId: "session-1",
        turnId: "turn-1",
        status: "canceled",
        error: "页面刷新，任务已中断",
        finishedAt: "2026-05-26T10:05:00.000Z",
      },
    ],
  );

  assert.equal(sessions[0].turns[0].status, "error");
  assert.equal(sessions[0].turns[0].error, "__refresh_interrupted__");
});
