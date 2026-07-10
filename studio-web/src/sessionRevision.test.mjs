import test from "node:test";
import assert from "node:assert/strict";

import * as sessionRevision from "./sessionRevision.ts";

const {
  buildSessionSavePayload,
  mergeSessionsByUpdatedAt,
  nextSessionSaveAttempt,
  normalizeSessionRevision,
} = sessionRevision;

test("session save payload carries the expected backend revision exactly", () => {
  const sessions = [{ id: "s1", updatedAt: "2026-07-10T10:00:00Z" }];

  assert.deepEqual(buildSessionSavePayload(7, "s1", sessions), {
    expected_revision: 7,
    active_session_id: "s1",
    sessions,
  });
  assert.equal(normalizeSessionRevision(undefined), 1);
  assert.equal(normalizeSessionRevision(0), 1);
  assert.equal(normalizeSessionRevision("7"), 1);
  assert.equal(normalizeSessionRevision(7), 7);
});

test("session merge keeps every id and resolves timestamps deterministically without mutation", () => {
  const local = [
    { id: "shared", updatedAt: "2026-07-10T10:03:00Z", value: "local-newer" },
    { id: "server-newer", updatedAt: "2026-07-10T10:00:00Z", value: "local-older" },
    { id: "tie", updatedAt: "2026-07-10T10:04:00Z", value: "local-tie" },
    { id: "local-only", updatedAt: "2026-07-10T10:02:00Z", value: "local-only" },
    { id: "server-valid-local-invalid", updatedAt: "not-a-date", value: "local-invalid" },
    { id: "both-invalid", value: "local-invalid-tie" },
  ];
  const server = [
    { id: "shared", updatedAt: "2026-07-10T10:01:00Z", value: "server-older" },
    { id: "server-newer", updatedAt: "2026-07-10T10:06:00Z", value: "server-newer" },
    { id: "tie", updatedAt: "2026-07-10T10:04:00Z", value: "server-tie" },
    { id: "server-only", updatedAt: "2026-07-10T10:05:00Z", value: "server-only" },
    { id: "server-valid-local-invalid", updatedAt: "2026-07-10T10:01:30Z", value: "server-valid" },
    { id: "both-invalid", updatedAt: "still-not-a-date", value: "server-invalid-tie" },
    { id: "z-invalid-server", value: "server-invalid-only" },
  ];
  const localBefore = structuredClone(local);
  const serverBefore = structuredClone(server);

  const merged = mergeSessionsByUpdatedAt(local, server);

  assert.deepEqual(local, localBefore);
  assert.deepEqual(server, serverBefore);
  assert.deepEqual(merged.map((session) => session.id), [
    "server-newer",
    "server-only",
    "tie",
    "shared",
    "local-only",
    "server-valid-local-invalid",
    "both-invalid",
    "z-invalid-server",
  ]);
  const byId = Object.fromEntries(merged.map((session) => [session.id, session]));
  assert.equal(byId.shared.value, "local-newer");
  assert.equal(byId["server-newer"].value, "server-newer");
  assert.equal(byId.tie.value, "local-tie");
  assert.equal(byId["both-invalid"].value, "local-invalid-tie");
  assert.equal(byId["server-valid-local-invalid"].value, "server-valid");
});

test("session conflict retry decision permits only one retry", () => {
  const firstConflict = nextSessionSaveAttempt(0, 409);
  const secondConflict = nextSessionSaveAttempt(firstConflict.nextRetryCount, 409);

  assert.deepEqual(firstConflict, { retry: true, nextRetryCount: 1 });
  assert.deepEqual(secondConflict, { retry: false, nextRetryCount: 1 });
  assert.deepEqual(nextSessionSaveAttempt(0, 500), { retry: false, nextRetryCount: 0 });
});

test("session save retry helper succeeds on the first response", async () => {
  assert.equal(typeof sessionRevision.runSessionSaveWithRetry, "function");
  const initialState = { name: "initial" };
  const sends = [];
  let conflictCalls = 0;

  const result = await sessionRevision.runSessionSaveWithRetry({
    initialState,
    send: async (state, attempt) => {
      sends.push({ state, attempt });
      return { ok: true, status: 200, payload: { revision: 2 } };
    },
    resolveConflict: async () => {
      conflictCalls += 1;
      return null;
    },
  });

  assert.equal(result.kind, "success");
  assert.equal(result.attempts, 1);
  assert.equal(result.state, initialState);
  assert.deepEqual(sends, [{ state: initialState, attempt: 0 }]);
  assert.equal(conflictCalls, 0);
});

test("session save retry helper resolves one conflict then succeeds", async () => {
  assert.equal(typeof sessionRevision.runSessionSaveWithRetry, "function");
  const initialState = { name: "initial" };
  const mergedState = { name: "merged" };
  const sends = [];
  const conflicts = [];

  const result = await sessionRevision.runSessionSaveWithRetry({
    initialState,
    send: async (state, attempt) => {
      sends.push({ state, attempt });
      return attempt === 0
        ? { ok: false, status: 409, payload: { current: { revision: 2 } } }
        : { ok: true, status: 200, payload: { revision: 3 } };
    },
    resolveConflict: async (response, state) => {
      conflicts.push({ response, state });
      return mergedState;
    },
  });

  assert.equal(result.kind, "success");
  assert.equal(result.attempts, 2);
  assert.equal(result.state, mergedState);
  assert.deepEqual(sends, [
    { state: initialState, attempt: 0 },
    { state: mergedState, attempt: 1 },
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].state, initialState);
});

test("session save retry helper exhausts after a second conflict", async () => {
  assert.equal(typeof sessionRevision.runSessionSaveWithRetry, "function");
  const initialState = { name: "initial" };
  const mergedState = { name: "merged" };
  const sends = [];
  let conflictCalls = 0;

  const result = await sessionRevision.runSessionSaveWithRetry({
    initialState,
    send: async (state, attempt) => {
      sends.push({ state, attempt });
      return { ok: false, status: 409, payload: { current: { revision: attempt + 2 } } };
    },
    resolveConflict: async () => {
      conflictCalls += 1;
      return mergedState;
    },
  });

  assert.equal(result.kind, "exhausted");
  assert.equal(result.attempts, 2);
  assert.equal(result.state, mergedState);
  assert.deepEqual(sends, [
    { state: initialState, attempt: 0 },
    { state: mergedState, attempt: 1 },
  ]);
  assert.equal(conflictCalls, 1);
});

test("session save skip token matches only the exact merged state", () => {
  assert.equal(typeof sessionRevision.shouldSkipSessionSave, "function");
  const mergedSessions = [{ id: "s1" }];
  const token = { sessions: mergedSessions, activeSessionId: "s1" };

  assert.equal(sessionRevision.shouldSkipSessionSave(token, mergedSessions, "s1"), true);
  assert.equal(sessionRevision.shouldSkipSessionSave(token, [...mergedSessions], "s1"), false);
  assert.equal(sessionRevision.shouldSkipSessionSave(token, mergedSessions, "s2"), false);
  assert.equal(sessionRevision.shouldSkipSessionSave(null, mergedSessions, "s1"), false);
});
