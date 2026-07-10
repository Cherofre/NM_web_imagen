import test from "node:test";
import assert from "node:assert/strict";

import * as sessionRevision from "./sessionRevision.ts";

const {
  buildSessionSavePayload,
  mergeSessionsByUpdatedAt,
  nextSessionSaveAttempt,
  normalizeSessionRevision,
  reconcileSessionConflictState,
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

test("older save response cannot roll back the atomic server baseline", () => {
  assert.equal(typeof sessionRevision.advanceSessionServerBaseline, "function");
  const revisionThreeSessions = [
    { id: "s3", updatedAt: "2026-07-10T10:03:00Z", value: "revision-three" },
  ];
  const revisionTwoSessions = [
    { id: "s2", updatedAt: "2026-07-10T10:02:00Z", value: "revision-two" },
  ];

  const revisionThree = sessionRevision.advanceSessionServerBaseline({
    baseline: { revision: 1, sessions: [] },
    serverRevision: 3,
    serverSessions: revisionThreeSessions,
  });
  const staleRevisionTwo = sessionRevision.advanceSessionServerBaseline({
    baseline: revisionThree.baseline,
    serverRevision: 2,
    serverSessions: revisionTwoSessions,
  });

  assert.equal(revisionThree.accepted, true);
  assert.equal(staleRevisionTwo.accepted, false);
  assert.deepEqual(staleRevisionTwo.baseline, {
    revision: 3,
    sessions: revisionThreeSessions,
  });
});

test("session merge keeps every id and resolves timestamps deterministically without mutation", () => {
  const baseline = [
    { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "shared-base" },
    { id: "server-newer", updatedAt: "2026-07-10T10:00:00Z", value: "server-newer-base" },
    { id: "tie", updatedAt: "2026-07-10T10:00:00Z", value: "tie-base" },
    { id: "server-valid-local-invalid", value: "invalid-base" },
    { id: "both-invalid", value: "invalid-base" },
  ];
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
  const baselineBefore = structuredClone(baseline);
  const localBefore = structuredClone(local);
  const serverBefore = structuredClone(server);

  const merged = mergeSessionsByUpdatedAt(baseline, local, server);

  assert.deepEqual(baseline, baselineBefore);
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

test("local deletion wins when the server copy is unchanged from baseline", () => {
  const baseline = [{ id: "deleted-local", updatedAt: "2026-07-10T10:00:00Z", value: "base" }];
  const server = [{ ...baseline[0] }];

  assert.deepEqual(mergeSessionsByUpdatedAt(baseline, [], server), []);
});

test("server deletion wins when local is unchanged and does not resurrect pruned references", () => {
  const baseline = [{
    id: "deleted-server",
    updatedAt: "2026-07-10T10:00:00Z",
    references: [{ src: "/outputs/session_refs/pruned.png" }],
  }];
  const local = structuredClone(baseline);

  assert.deepEqual(mergeSessionsByUpdatedAt(baseline, local, []), []);
});

test("a real edit wins when the other side deleted the baseline session", () => {
  const baseline = [{ id: "edited", updatedAt: "2026-07-10T10:00:00Z", value: "base" }];
  const localEdit = [{ id: "edited", updatedAt: "2026-07-10T10:02:00Z", value: "local-edit" }];
  const serverEdit = [{ id: "edited", updatedAt: "2026-07-10T10:03:00Z", value: "server-edit" }];

  assert.equal(mergeSessionsByUpdatedAt(baseline, localEdit, [])[0].value, "local-edit");
  assert.equal(mergeSessionsByUpdatedAt(baseline, [], serverEdit)[0].value, "server-edit");
});

test("sessions created independently on both sides are merged as a union", () => {
  const local = [{ id: "local-new", updatedAt: "2026-07-10T10:01:00Z" }];
  const server = [{ id: "server-new", updatedAt: "2026-07-10T10:02:00Z" }];

  assert.deepEqual(
    mergeSessionsByUpdatedAt([], local, server).map((session) => session.id),
    ["server-new", "local-new"],
  );
});

test("stale first conflict keeps latest local state and retries with the newer baseline revision", async () => {
  assert.equal(typeof sessionRevision.advanceSessionServerBaseline, "function");
  const revisionTwoSessions = [
    { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "revision-two" },
  ];
  const revisionThreeSessions = [
    { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "revision-two" },
    { id: "remote-three", updatedAt: "2026-07-10T10:03:00Z", value: "remote-three" },
  ];
  const requestLocalSessions = [
    { id: "shared", updatedAt: "2026-07-10T10:01:00Z", value: "request-local" },
  ];
  const latestLocalSessions = [
    { id: "shared", updatedAt: "2026-07-10T10:04:00Z", value: "latest-local" },
  ];
  let baseline = { revision: 2, sessions: revisionTwoSessions };
  let renderedSessions = latestLocalSessions;
  const sends = [];

  const result = await sessionRevision.runSessionSaveWithRetry({
    initialState: { sessions: requestLocalSessions, activeSessionId: "shared" },
    send: async (state, attempt) => {
      sends.push({
        revision: baseline.revision,
        sessions: state.sessions,
        attempt,
      });
      if (attempt === 0) {
        baseline = sessionRevision.advanceSessionServerBaseline({
          baseline,
          serverRevision: 3,
          serverSessions: revisionThreeSessions,
        }).baseline;
        return {
          ok: false,
          status: 409,
          payload: { current: { revision: 2, sessions: revisionTwoSessions } },
        };
      }
      return { ok: true, status: 200, payload: { revision: 4, sessions: state.sessions } };
    },
    resolveConflict: (response) => {
      const reconciled = reconcileSessionConflictState({
        baseline,
        localSessions: renderedSessions,
        serverSessions: response.payload.current.sessions,
        serverRevision: response.payload.current.revision,
      });
      baseline = reconciled.baseline;
      if (reconciled.accepted) renderedSessions = reconciled.sessions;
      return { sessions: reconciled.sessions, activeSessionId: "shared" };
    },
  });

  assert.equal(result.kind, "success");
  assert.deepEqual(sends.map((send) => send.revision), [2, 3]);
  assert.deepEqual(sends[1].sessions, latestLocalSessions);
  assert.deepEqual(renderedSessions, latestLocalSessions);
  assert.deepEqual(baseline, { revision: 3, sessions: revisionThreeSessions });
});

test("stale exhausted conflict is not applied and never triggers a third request", async () => {
  assert.equal(typeof sessionRevision.advanceSessionServerBaseline, "function");
  const revisionTwoSessions = [
    { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "revision-two" },
  ];
  const revisionThreeSessions = [
    { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "revision-two" },
    { id: "remote-three", updatedAt: "2026-07-10T10:03:00Z", value: "remote-three" },
  ];
  const revisionFourSessions = [
    ...revisionThreeSessions,
    { id: "remote-four", updatedAt: "2026-07-10T10:04:00Z", value: "remote-four" },
  ];
  const latestLocalSessions = [
    { id: "shared", updatedAt: "2026-07-10T10:05:00Z", value: "latest-local" },
    revisionThreeSessions[1],
  ];
  let baseline = { revision: 2, sessions: revisionTwoSessions };
  let renderedSessions = latestLocalSessions;
  let sendCount = 0;

  const result = await sessionRevision.runSessionSaveWithRetry({
    initialState: { sessions: latestLocalSessions, activeSessionId: "shared" },
    send: async () => {
      sendCount += 1;
      if (sendCount === 1) {
        return {
          ok: false,
          status: 409,
          payload: { current: { revision: 3, sessions: revisionThreeSessions } },
        };
      }
      baseline = sessionRevision.advanceSessionServerBaseline({
        baseline,
        serverRevision: 4,
        serverSessions: revisionFourSessions,
      }).baseline;
      return {
        ok: false,
        status: 409,
        payload: { current: { revision: 3, sessions: revisionThreeSessions } },
      };
    },
    resolveConflict: (response) => {
      const reconciled = reconcileSessionConflictState({
        baseline,
        localSessions: renderedSessions,
        serverSessions: response.payload.current.sessions,
        serverRevision: response.payload.current.revision,
      });
      baseline = reconciled.baseline;
      if (reconciled.accepted) renderedSessions = reconciled.sessions;
      return { sessions: reconciled.sessions, activeSessionId: "shared" };
    },
  });

  assert.equal(result.kind, "exhausted");
  assert.equal(sendCount, 2);
  const exhausted = reconcileSessionConflictState({
    baseline,
    localSessions: renderedSessions,
    serverSessions: result.response.payload.current.sessions,
    serverRevision: result.response.payload.current.revision,
  });
  if (exhausted.accepted) renderedSessions = exhausted.sessions;

  assert.equal(exhausted.accepted, false);
  assert.deepEqual(exhausted.baseline, { revision: 4, sessions: revisionFourSessions });
  assert.deepEqual(renderedSessions, latestLocalSessions);
});

test("second conflict is merged into state before advancing revision without a third request", async () => {
  assert.equal(typeof reconcileSessionConflictState, "function");
  const initialBaseline = [
    { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "base" },
  ];
  const initialLocal = [
    { id: "shared", updatedAt: "2026-07-10T10:02:00Z", value: "local-edit" },
  ];
  const firstCurrent = {
    revision: 2,
    sessions: [
      { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "base" },
      { id: "remote-first", updatedAt: "2026-07-10T10:01:00Z", value: "remote-first" },
    ],
  };
  const secondCurrent = {
    revision: 3,
    sessions: [
      { id: "shared", updatedAt: "2026-07-10T10:00:00Z", value: "base" },
      { id: "remote-first", updatedAt: "2026-07-10T10:03:00Z", value: "remote-second-edit" },
      { id: "remote-second", updatedAt: "2026-07-10T10:04:00Z", value: "remote-second" },
    ],
  };
  const sends = [];

  const result = await sessionRevision.runSessionSaveWithRetry({
    initialState: {
      baseline: { revision: 1, sessions: initialBaseline },
      sessions: initialLocal,
    },
    send: async (state, attempt) => {
      sends.push({ state, attempt });
      const current = attempt === 0 ? firstCurrent : secondCurrent;
      return { ok: false, status: 409, payload: { current } };
    },
    resolveConflict: (response, state) => reconcileSessionConflictState({
      baseline: state.baseline,
      localSessions: state.sessions,
      serverSessions: response.payload.current.sessions,
      serverRevision: response.payload.current.revision,
    }),
  });

  assert.equal(result.kind, "exhausted");
  assert.equal(sends.length, 2);
  const reconciled = reconcileSessionConflictState({
    baseline: result.state.baseline,
    localSessions: result.state.sessions,
    serverSessions: result.response.payload.current.sessions,
    serverRevision: result.response.payload.current.revision,
  });
  const byId = Object.fromEntries(reconciled.sessions.map((session) => [session.id, session]));

  assert.equal(reconciled.accepted, true);
  assert.equal(reconciled.baseline.revision, 3);
  assert.equal(byId.shared.value, "local-edit");
  assert.equal(byId["remote-first"].value, "remote-second-edit");
  assert.equal(byId["remote-second"].value, "remote-second");
  assert.deepEqual(reconciled.baseline.sessions, secondCurrent.sessions);
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
