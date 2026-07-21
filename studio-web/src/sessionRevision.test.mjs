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

test("persisted baseline markers keep only compact server identity data", () => {
  assert.equal(typeof sessionRevision.buildPersistedBaselineMarkers, "function");
  assert.equal(typeof sessionRevision.normalizePersistedBaselineMarkers, "function");
  const serverSessions = [
    {
      id: "server-one",
      updatedAt: "2026-07-15T10:00:00Z",
      turns: [{ referenceSnapshots: [{ src: "data:image/png;base64,secret-image" }] }],
      api_key: "secret-key",
    },
    {
      id: "server-two",
      updatedAt: "2026-07-15T11:00:00Z",
      turns: [],
    },
  ];

  const markers = sessionRevision.buildPersistedBaselineMarkers({
    revision: 7,
    activeSessionId: "server-two",
    sessions: serverSessions,
  });

  assert.deepEqual(markers, {
    version: 1,
    revision: 7,
    activeSessionId: "server-two",
    sessions: [
      { id: "server-one", updatedAt: "2026-07-15T10:00:00Z" },
      { id: "server-two", updatedAt: "2026-07-15T11:00:00Z" },
    ],
  });
  assert.deepEqual(sessionRevision.normalizePersistedBaselineMarkers(markers), markers);
  const serialized = JSON.stringify(markers);
  assert.doesNotMatch(serialized, /secret-key|secret-image|referenceSnapshots|api_key/);
  assert.equal(sessionRevision.normalizePersistedBaselineMarkers({ ...markers, revision: "7" }), null);
  assert.equal(sessionRevision.normalizePersistedBaselineMarkers({ ...markers, sessions: "broken" }), null);
});

test("initial reconciliation keeps newer edits and sessions unique to either side", () => {
  assert.equal(typeof sessionRevision.reconcileInitialSessionState, "function");
  const localSessions = [
    { id: "local-newer", updatedAt: "2026-07-15T12:00:00Z", value: "local-newer" },
    { id: "server-newer", updatedAt: "2026-07-15T09:00:00Z", value: "local-older" },
    { id: "local-only", updatedAt: "2026-07-15T10:00:00Z", value: "local-only" },
  ];
  const serverSessions = [
    { id: "local-newer", updatedAt: "2026-07-15T08:00:00Z", value: "server-older" },
    { id: "server-newer", updatedAt: "2026-07-15T13:00:00Z", value: "server-newer" },
    { id: "server-only", updatedAt: "2026-07-15T11:00:00Z", value: "server-only" },
  ];

  const reconciled = sessionRevision.reconcileInitialSessionState({
    baselineMarkers: null,
    localSessions,
    localActiveSessionId: "local-only",
    serverSessions,
    serverActiveSessionId: "server-only",
    serverRevision: 1,
  });
  const byId = Object.fromEntries(reconciled.sessions.map((session) => [session.id, session]));

  assert.equal(reconciled.usedBaseline, false);
  assert.deepEqual(reconciled.sessions.map((session) => session.id), [
    "server-newer",
    "local-newer",
    "server-only",
    "local-only",
  ]);
  assert.equal(byId["local-newer"].value, "local-newer");
  assert.equal(byId["server-newer"].value, "server-newer");
  assert.equal(reconciled.activeSessionId, "local-only");
});

test("initial reconciliation applies baseline-aware deletions in both directions", () => {
  const baselineSessions = [
    { id: "deleted-locally", updatedAt: "2026-07-15T10:00:00Z" },
    { id: "deleted-on-server", updatedAt: "2026-07-15T10:01:00Z" },
    { id: "kept", updatedAt: "2026-07-15T10:02:00Z" },
  ];
  const markers = sessionRevision.buildPersistedBaselineMarkers({
    revision: 4,
    activeSessionId: "deleted-locally",
    sessions: baselineSessions,
  });
  const localSessions = [
    { ...baselineSessions[1] },
    { ...baselineSessions[2] },
  ];
  const serverSessions = [
    { ...baselineSessions[0] },
    { ...baselineSessions[2] },
  ];

  const reconciled = sessionRevision.reconcileInitialSessionState({
    baselineMarkers: markers,
    localSessions,
    localActiveSessionId: "deleted-on-server",
    serverSessions,
    serverActiveSessionId: "deleted-locally",
    serverRevision: 5,
  });

  assert.equal(reconciled.usedBaseline, true);
  assert.deepEqual(reconciled.sessions.map((session) => session.id), ["kept"]);
  assert.equal(reconciled.activeSessionId, "kept");
});

test("missing or damaged startup baseline falls back to a loss-avoiding union", () => {
  const localSessions = [{ id: "local-only", updatedAt: "2026-07-15T10:00:00Z" }];
  const serverSessions = [{ id: "server-only", updatedAt: "2026-07-15T11:00:00Z" }];
  const damaged = {
    version: 1,
    revision: 3,
    activeSessionId: "server-only",
    sessions: [{ id: "broken", updatedAt: 123 }],
  };

  const reconciled = sessionRevision.reconcileInitialSessionState({
    baselineMarkers: damaged,
    localSessions,
    localActiveSessionId: "missing-local-active",
    serverSessions,
    serverActiveSessionId: "server-only",
    serverRevision: 3,
  });

  assert.equal(reconciled.usedBaseline, false);
  assert.deepEqual(reconciled.sessions.map((session) => session.id), ["server-only", "local-only"]);
  assert.equal(reconciled.activeSessionId, "server-only");
});

test("older or reset server state ignores stale deletion markers and preserves local sessions", () => {
  const localSessions = [
    { id: "keep-local", updatedAt: "2026-07-15T10:00:00Z", value: "browser-copy" },
  ];
  const markers = sessionRevision.buildPersistedBaselineMarkers({
    revision: 8,
    activeSessionId: "keep-local",
    sessions: localSessions,
  });

  for (const serverRevision of [1, 8]) {
    const reconciled = sessionRevision.reconcileInitialSessionState({
      baselineMarkers: markers,
      localSessions,
      localActiveSessionId: "keep-local",
      serverSessions: [],
      serverActiveSessionId: "",
      serverRevision,
    });

    assert.equal(reconciled.usedBaseline, false, `server revision ${serverRevision}`);
    assert.deepEqual(reconciled.sessions, localSessions, `server revision ${serverRevision}`);
    assert.equal(reconciled.activeSessionId, "keep-local", `server revision ${serverRevision}`);
  }
});

test("same server revision still applies a local deletion when the server snapshot matches baseline", () => {
  const baselineSessions = [
    { id: "deleted-locally", updatedAt: "2026-07-15T10:00:00Z" },
  ];
  const markers = sessionRevision.buildPersistedBaselineMarkers({
    revision: 8,
    activeSessionId: "deleted-locally",
    sessions: baselineSessions,
  });

  const reconciled = sessionRevision.reconcileInitialSessionState({
    baselineMarkers: markers,
    localSessions: [],
    localActiveSessionId: "",
    serverSessions: baselineSessions,
    serverActiveSessionId: "deleted-locally",
    serverRevision: 8,
  });

  assert.equal(reconciled.usedBaseline, true);
  assert.deepEqual(reconciled.sessions, []);
  assert.equal(reconciled.activeSessionId, "");
});

test("canonical reference updates apply only to unchanged sent sources without mutation", () => {
  assert.equal(typeof sessionRevision.applyCanonicalReferenceUpdates, "function");
  const sentSessions = [{
    id: "session-one",
    updatedAt: "2026-07-15T10:00:00Z",
    turns: [{
      id: "turn-one",
      referenceSnapshots: [
        { id: "ref-apply", name: "keep-name.png", src: "data:image/png;base64,apply" },
        { id: "ref-edited", src: "data:image/png;base64,old" },
      ],
      maskSnapshot: { id: "mask-apply", name: "mask-preview.webp", src: "data:image/webp;base64,mask" },
      maskFileSnapshot: { id: "mask-alpha", name: "mask-alpha.png", src: "data:image/png;base64,alpha" },
    }],
  }];
  const currentSessions = structuredClone(sentSessions);
  currentSessions[0].turns[0].referenceSnapshots[1].src = "data:image/png;base64,user-edited";
  const serverSessions = [{
    id: "session-one",
    updatedAt: "2026-07-15T10:00:00Z",
    turns: [{
      id: "turn-one",
      referenceSnapshots: [
        {
          id: "ref-apply",
          name: "server-name.png",
          src: "/outputs/session_refs/ref-applied.png",
          mime_type: "image/png",
          size: 123,
          dimensions: { width: 1, height: 1 },
        },
        {
          id: "ref-edited",
          src: "/outputs/session_refs/ref-must-not-overwrite.png",
          mime_type: "image/png",
          size: 456,
        },
      ],
      maskSnapshot: {
        id: "mask-apply",
        name: "mask-preview.webp",
        src: "/outputs/session_refs/mask-applied.webp",
        mime_type: "image/webp",
        size: 321,
        dimensions: { width: 216, height: 384 },
      },
      maskFileSnapshot: {
        id: "mask-alpha",
        name: "mask-alpha.png",
        src: "/outputs/session_refs/mask-alpha.png",
        mime_type: "image/png",
        size: 654,
        dimensions: { width: 937, height: 1678 },
      },
    }],
  }];
  const currentBefore = structuredClone(currentSessions);
  const sentBefore = structuredClone(sentSessions);
  const serverBefore = structuredClone(serverSessions);

  const result = sessionRevision.applyCanonicalReferenceUpdates({
    currentSessions,
    sentSessions,
    serverSessions,
  });

  assert.equal(result.changed, true);
  assert.notEqual(result.sessions, currentSessions);
  const references = result.sessions[0].turns[0].referenceSnapshots;
  assert.deepEqual(references[0], {
    id: "ref-apply",
    name: "keep-name.png",
    src: "/outputs/session_refs/ref-applied.png",
    mime_type: "image/png",
    size: 123,
    dimensions: { width: 1, height: 1 },
  });
  assert.equal(references[1].src, "data:image/png;base64,user-edited");
  assert.equal(references[1].mime_type, undefined);
  assert.deepEqual(result.sessions[0].turns[0].maskSnapshot, {
    id: "mask-apply",
    name: "mask-preview.webp",
    src: "/outputs/session_refs/mask-applied.webp",
    mime_type: "image/webp",
    size: 321,
    dimensions: { width: 216, height: 384 },
  });
  assert.deepEqual(result.sessions[0].turns[0].maskFileSnapshot, {
    id: "mask-alpha",
    name: "mask-alpha.png",
    src: "/outputs/session_refs/mask-alpha.png",
    mime_type: "image/png",
    size: 654,
    dimensions: { width: 937, height: 1678 },
  });
  assert.deepEqual(currentSessions, currentBefore);
  assert.deepEqual(sentSessions, sentBefore);
  assert.deepEqual(serverSessions, serverBefore);
});

test("canonical reference updates ignore mismatched identities and report no change", () => {
  const currentSessions = [{
    id: "session-current",
    updatedAt: "2026-07-15T10:00:00Z",
    turns: [{ id: "turn-current", referenceSnapshots: [{ id: "ref-current", src: "data:image/png;base64,x" }] }],
  }];
  const sentSessions = structuredClone(currentSessions);
  const serverSessions = [{
    id: "session-other",
    updatedAt: "2026-07-15T10:00:00Z",
    turns: [{ id: "turn-current", referenceSnapshots: [{ id: "ref-current", src: "/outputs/session_refs/other.png" }] }],
  }];

  const result = sessionRevision.applyCanonicalReferenceUpdates({
    currentSessions,
    sentSessions,
    serverSessions,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.sessions, currentSessions);
});

test("session snapshot comparison detects real local edits", () => {
  assert.equal(typeof sessionRevision.sessionStateMatchesSnapshot, "function");
  const sessions = [{ id: "session-one", updatedAt: "2026-07-15T10:00:00Z", value: "same" }];

  assert.equal(sessionRevision.sessionStateMatchesSnapshot({
    currentSessions: sessions,
    currentActiveSessionId: "session-one",
    snapshotSessions: structuredClone(sessions),
    snapshotActiveSessionId: "session-one",
  }), true);
  assert.equal(sessionRevision.sessionStateMatchesSnapshot({
    currentSessions: [{ ...sessions[0], value: "edited" }],
    currentActiveSessionId: "session-one",
    snapshotSessions: sessions,
    snapshotActiveSessionId: "session-one",
  }), false);
  assert.equal(sessionRevision.sessionStateMatchesSnapshot({
    currentSessions: sessions,
    currentActiveSessionId: "missing",
    snapshotSessions: sessions,
    snapshotActiveSessionId: "session-one",
  }), false);
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
