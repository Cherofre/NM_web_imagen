export type SessionLike = {
  id: string;
  updatedAt?: unknown;
};

export type PersistedSessionBaselineMarkers = {
  version: 1;
  revision: number;
  activeSessionId: string;
  sessions: Array<{ id: string; updatedAt: string }>;
};

type ReferenceLike = {
  id: string;
  src?: unknown;
  mime_type?: unknown;
  size?: unknown;
  dimensions?: unknown;
};

type TurnWithReferences = {
  id: string;
  referenceSnapshots?: readonly ReferenceLike[];
  maskSnapshot?: ReferenceLike;
  maskFileSnapshot?: ReferenceLike;
};

export type SessionWithReferences = SessionLike & {
  turns?: readonly TurnWithReferences[];
};

const persistedBaselineVersion = 1;
const persistedBaselineMaxSessions = 80;
const persistedBaselineMaxIdChars = 512;
const persistedBaselineMaxTimestampChars = 128;

type Timestamp = {
  valid: boolean;
  value: number;
};

function sessionTimestamp(session: SessionLike): Timestamp {
  if (typeof session.updatedAt !== "string" || !session.updatedAt.trim()) {
    return { valid: false, value: 0 };
  }
  const value = Date.parse(session.updatedAt);
  return Number.isFinite(value) ? { valid: true, value } : { valid: false, value: 0 };
}

function dedupeSessions<Session extends SessionLike>(sessions: readonly Session[]) {
  const byId = new Map<string, Session>();
  for (const session of sessions) {
    const existing = byId.get(session.id);
    if (!existing) {
      byId.set(session.id, session);
      continue;
    }
    const currentTime = sessionTimestamp(existing);
    const candidateTime = sessionTimestamp(session);
    if (
      (candidateTime.valid && !currentTime.valid)
      || (candidateTime.valid && currentTime.valid && candidateTime.value > currentTime.value)
    ) {
      byId.set(session.id, session);
    }
  }
  return byId;
}

function preferLocalSession(local: SessionLike, server: SessionLike) {
  const localTime = sessionTimestamp(local);
  const serverTime = sessionTimestamp(server);
  if (localTime.valid && !serverTime.valid) return true;
  if (!localTime.valid && serverTime.valid) return false;
  if (localTime.valid && serverTime.valid) return localTime.value >= serverTime.value;
  return true;
}

function sessionChangedSinceBaseline(session: SessionLike, baseline: SessionLike) {
  const sessionTime = sessionTimestamp(session);
  const baselineTime = sessionTimestamp(baseline);
  if (sessionTime.valid && baselineTime.valid) return sessionTime.value > baselineTime.value;
  if (sessionTime.valid !== baselineTime.valid) return sessionTime.valid;
  return false;
}

function compareSessionOrder(left: SessionLike, right: SessionLike) {
  const leftTime = sessionTimestamp(left);
  const rightTime = sessionTimestamp(right);
  if (leftTime.valid && rightTime.valid && leftTime.value !== rightTime.value) {
    return rightTime.value - leftTime.value;
  }
  if (leftTime.valid !== rightTime.valid) return leftTime.valid ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function normalizeSessionRevision(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

export function buildSessionSavePayload<Session>(
  revision: number,
  activeSessionId: string,
  sessions: readonly Session[],
) {
  return {
    expected_revision: normalizeSessionRevision(revision),
    active_session_id: activeSessionId,
    sessions,
  };
}

function markerText(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= maxChars ? trimmed : "";
}

function markerSession(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as { id?: unknown; updatedAt?: unknown };
  const id = markerText(source.id, persistedBaselineMaxIdChars);
  const updatedAt = markerText(source.updatedAt, persistedBaselineMaxTimestampChars);
  if (!id || !updatedAt || !Number.isFinite(Date.parse(updatedAt))) return null;
  return { id, updatedAt };
}

export function buildPersistedBaselineMarkers<Session extends SessionLike>({
  revision,
  activeSessionId,
  sessions,
}: {
  revision: unknown;
  activeSessionId: unknown;
  sessions: readonly Session[];
}): PersistedSessionBaselineMarkers {
  const markers: PersistedSessionBaselineMarkers["sessions"] = [];
  const seen = new Set<string>();
  for (const session of sessions) {
    const marker = markerSession(session);
    if (!marker || seen.has(marker.id)) continue;
    markers.push(marker);
    seen.add(marker.id);
    if (markers.length >= persistedBaselineMaxSessions) break;
  }
  const requestedActiveSessionId = markerText(activeSessionId, persistedBaselineMaxIdChars);
  const normalizedActiveSessionId = seen.has(requestedActiveSessionId)
    ? requestedActiveSessionId
    : markers[0]?.id || "";
  return {
    version: persistedBaselineVersion,
    revision: normalizeSessionRevision(revision),
    activeSessionId: normalizedActiveSessionId,
    sessions: markers,
  };
}

export function normalizePersistedBaselineMarkers(
  value: unknown,
): PersistedSessionBaselineMarkers | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as {
    version?: unknown;
    revision?: unknown;
    activeSessionId?: unknown;
    sessions?: unknown;
  };
  if (
    source.version !== persistedBaselineVersion
    || typeof source.revision !== "number"
    || !Number.isInteger(source.revision)
    || source.revision < 1
    || typeof source.activeSessionId !== "string"
    || !Array.isArray(source.sessions)
    || source.sessions.length > persistedBaselineMaxSessions
  ) {
    return null;
  }

  const sessions: PersistedSessionBaselineMarkers["sessions"] = [];
  const seen = new Set<string>();
  for (const item of source.sessions) {
    const marker = markerSession(item);
    if (!marker || seen.has(marker.id)) return null;
    sessions.push(marker);
    seen.add(marker.id);
  }
  const activeSessionId = markerText(source.activeSessionId, persistedBaselineMaxIdChars);
  if (source.activeSessionId && (!activeSessionId || !seen.has(activeSessionId))) return null;
  return {
    version: persistedBaselineVersion,
    revision: source.revision,
    activeSessionId,
    sessions,
  };
}

export function advanceSessionServerBaseline<Session extends SessionLike>({
  baseline,
  serverRevision,
  serverSessions,
}: {
  baseline: { revision: number; sessions: readonly Session[] };
  serverRevision: unknown;
  serverSessions: readonly Session[];
}) {
  const baselineRevision = normalizeSessionRevision(baseline.revision);
  const candidateRevision = normalizeSessionRevision(serverRevision);
  if (candidateRevision < baselineRevision) {
    return {
      accepted: false,
      baseline: {
        revision: baselineRevision,
        sessions: baseline.sessions.map((session) => ({ ...session })),
      },
    };
  }

  return {
    accepted: true,
    baseline: {
      revision: Math.max(baselineRevision, candidateRevision),
      sessions: serverSessions.map((session) => ({ ...session })),
    },
  };
}

export function mergeSessionsByUpdatedAt<Session extends SessionLike>(
  baselineSessions: readonly SessionLike[],
  localSessions: readonly Session[],
  serverSessions: readonly Session[],
) {
  const baselineById = dedupeSessions(baselineSessions);
  const localById = dedupeSessions(localSessions);
  const serverById = dedupeSessions(serverSessions);
  const ids = new Set([...baselineById.keys(), ...localById.keys(), ...serverById.keys()]);
  const merged: Session[] = [];

  for (const id of ids) {
    const baseline = baselineById.get(id);
    const local = localById.get(id);
    const server = serverById.get(id);
    let selected: Session | undefined;

    if (!baseline) {
      selected = local && server
        ? preferLocalSession(local, server) ? local : server
        : local || server;
    } else if (local && server) {
      selected = preferLocalSession(local, server) ? local : server;
    } else if (local) {
      selected = sessionChangedSinceBaseline(local, baseline) ? local : undefined;
    } else if (server) {
      selected = sessionChangedSinceBaseline(server, baseline) ? server : undefined;
    }

    if (selected) merged.push({ ...selected });
  }

  return merged.sort(compareSessionOrder);
}

export function reconcileInitialSessionState<Session extends SessionLike>({
  baselineMarkers,
  localSessions,
  localActiveSessionId,
  serverSessions,
  serverActiveSessionId,
  serverRevision,
}: {
  baselineMarkers: unknown;
  localSessions: readonly Session[];
  localActiveSessionId: string;
  serverSessions: readonly Session[];
  serverActiveSessionId: string;
  serverRevision: unknown;
}) {
  const parsedBaseline = normalizePersistedBaselineMarkers(baselineMarkers);
  const normalizedServerRevision = normalizeSessionRevision(serverRevision);
  const sameRevisionServerMarkers = parsedBaseline && normalizedServerRevision === parsedBaseline.revision
    ? buildPersistedBaselineMarkers({
        revision: normalizedServerRevision,
        activeSessionId: serverActiveSessionId,
        sessions: serverSessions,
      })
    : null;
  const baseline = parsedBaseline && (
    normalizedServerRevision > parsedBaseline.revision
    || (
      sameRevisionServerMarkers != null
      && JSON.stringify(sameRevisionServerMarkers) === JSON.stringify(parsedBaseline)
    )
  )
    ? parsedBaseline
    : null;
  const sessions = mergeSessionsByUpdatedAt(
    baseline?.sessions || [],
    localSessions,
    serverSessions,
  );
  const ids = new Set(sessions.map((session) => session.id));
  const activeSessionId = [
    localActiveSessionId,
    serverActiveSessionId,
    baseline?.activeSessionId || "",
    sessions[0]?.id || "",
  ].find((candidate) => ids.has(candidate)) || "";
  return {
    sessions,
    activeSessionId,
    usedBaseline: baseline != null,
  };
}

function turnById(session: SessionWithReferences | undefined): Map<string, TurnWithReferences> {
  return new Map<string, TurnWithReferences>(
    (Array.isArray(session?.turns) ? session.turns : [])
      .filter((turn) => turn && typeof turn.id === "string")
      .map((turn) => [turn.id, turn] as const),
  );
}

function referenceById(turn: TurnWithReferences | undefined): Map<string, ReferenceLike> {
  return new Map<string, ReferenceLike>(
    (Array.isArray(turn?.referenceSnapshots) ? turn.referenceSnapshots : [])
      .filter((reference) => reference && typeof reference.id === "string")
      .map((reference) => [reference.id, reference] as const),
  );
}

function canonicalReferenceFields(reference: ReferenceLike) {
  const src = typeof reference.src === "string" ? reference.src : "";
  if (!src.startsWith("/outputs/")) return null;
  const fields: Partial<ReferenceLike> = { src };
  if (typeof reference.mime_type === "string" && reference.mime_type) {
    fields.mime_type = reference.mime_type;
  }
  if (typeof reference.size === "number" && Number.isFinite(reference.size) && reference.size >= 0) {
    fields.size = reference.size;
  }
  if (reference.dimensions && typeof reference.dimensions === "object" && !Array.isArray(reference.dimensions)) {
    fields.dimensions = { ...(reference.dimensions as Record<string, unknown>) };
  }
  return fields;
}

function referenceFieldsMatch(reference: ReferenceLike, fields: Partial<ReferenceLike>) {
  const record = reference as Record<string, unknown>;
  return Object.entries(fields).every(([key, value]) => (
    key === "dimensions"
      ? JSON.stringify(reference.dimensions) === JSON.stringify(value)
      : record[key] === value
  ));
}

function canonicalReferenceUpdate(
  currentReference: ReferenceLike,
  sentReference: ReferenceLike | undefined,
  serverReference: ReferenceLike | undefined,
) {
  if (
    !sentReference
    || !serverReference
    || currentReference.id !== sentReference.id
    || sentReference.id !== serverReference.id
  ) {
    return currentReference;
  }
  const sentSrc = typeof sentReference.src === "string" ? sentReference.src : "";
  if (!sentSrc || currentReference.src !== sentSrc) return currentReference;
  const fields = canonicalReferenceFields(serverReference);
  if (!fields || referenceFieldsMatch(currentReference, fields)) return currentReference;
  return { ...currentReference, ...fields };
}

export function applyCanonicalReferenceUpdates<Session extends SessionWithReferences>({
  currentSessions,
  sentSessions,
  serverSessions,
}: {
  currentSessions: readonly Session[];
  sentSessions: readonly Session[];
  serverSessions: readonly Session[];
}) {
  const sentById = new Map(sentSessions.map((session) => [session.id, session]));
  const serverById = new Map(serverSessions.map((session) => [session.id, session]));
  let changed = false;

  const sessions = currentSessions.map((currentSession) => {
    const sentSession = sentById.get(currentSession.id);
    const serverSession = serverById.get(currentSession.id);
    if (!sentSession || !serverSession || !Array.isArray(currentSession.turns)) {
      return currentSession;
    }
    const sentTurns = turnById(sentSession);
    const serverTurns = turnById(serverSession);
    let sessionChanged = false;
    const turns = currentSession.turns.map((currentTurn: TurnWithReferences) => {
      const sentTurn = sentTurns.get(currentTurn.id);
      const serverTurn = serverTurns.get(currentTurn.id);
      if (!sentTurn || !serverTurn) {
        return currentTurn;
      }
      const sentReferences = referenceById(sentTurn);
      const serverReferences = referenceById(serverTurn);
      let turnChanged = false;
      const referenceSnapshots = Array.isArray(currentTurn.referenceSnapshots)
        ? currentTurn.referenceSnapshots.map((currentReference: ReferenceLike) => {
          const sentReference = sentReferences.get(currentReference.id);
          const serverReference = serverReferences.get(currentReference.id);
          const updatedReference = canonicalReferenceUpdate(currentReference, sentReference, serverReference);
          if (updatedReference !== currentReference) turnChanged = true;
          return updatedReference;
        })
        : currentTurn.referenceSnapshots;
      const maskSnapshot = currentTurn.maskSnapshot
        ? canonicalReferenceUpdate(currentTurn.maskSnapshot, sentTurn.maskSnapshot, serverTurn.maskSnapshot)
        : currentTurn.maskSnapshot;
      if (maskSnapshot !== currentTurn.maskSnapshot) turnChanged = true;
      const maskFileSnapshot = currentTurn.maskFileSnapshot
        ? canonicalReferenceUpdate(currentTurn.maskFileSnapshot, sentTurn.maskFileSnapshot, serverTurn.maskFileSnapshot)
        : currentTurn.maskFileSnapshot;
      if (maskFileSnapshot !== currentTurn.maskFileSnapshot) turnChanged = true;
      if (!turnChanged) return currentTurn;
      changed = true;
      sessionChanged = true;
      return { ...currentTurn, referenceSnapshots, maskSnapshot, maskFileSnapshot };
    });
    return sessionChanged ? { ...currentSession, turns } as Session : currentSession;
  });

  return { sessions, changed };
}

export function sessionStateMatchesSnapshot<Session>({
  currentSessions,
  currentActiveSessionId,
  snapshotSessions,
  snapshotActiveSessionId,
}: {
  currentSessions: readonly Session[];
  currentActiveSessionId: string;
  snapshotSessions: readonly Session[];
  snapshotActiveSessionId: string;
}) {
  if (currentActiveSessionId !== snapshotActiveSessionId) return false;
  try {
    return JSON.stringify(currentSessions) === JSON.stringify(snapshotSessions);
  } catch {
    return false;
  }
}

export function reconcileSessionConflictState<Session extends SessionLike>({
  baseline,
  localSessions,
  serverSessions,
  serverRevision,
}: {
  baseline: { revision: number; sessions: readonly Session[] };
  localSessions: readonly Session[];
  serverSessions: readonly Session[];
  serverRevision: unknown;
}) {
  const advanced = advanceSessionServerBaseline({
    baseline,
    serverRevision,
    serverSessions,
  });
  if (!advanced.accepted) {
    return {
      accepted: false,
      baseline: advanced.baseline,
      sessions: localSessions.map((session) => ({ ...session })),
    };
  }

  return {
    accepted: true,
    baseline: advanced.baseline,
    sessions: mergeSessionsByUpdatedAt(baseline.sessions, localSessions, serverSessions),
  };
}

export function nextSessionSaveAttempt(retryCount: number, status: number) {
  const normalizedRetryCount = Number.isInteger(retryCount) && retryCount > 0 ? retryCount : 0;
  if (status === 409 && normalizedRetryCount < 1) {
    return { retry: true, nextRetryCount: 1 };
  }
  return { retry: false, nextRetryCount: normalizedRetryCount };
}

export type SessionSaveTransportResponse<Payload> = {
  ok: boolean;
  status: number;
  payload: Payload;
};

export async function runSessionSaveWithRetry<State, Payload>({
  initialState,
  send,
  resolveConflict,
}: {
  initialState: State;
  send: (state: State, attempt: number) => Promise<SessionSaveTransportResponse<Payload>>;
  resolveConflict: (
    response: SessionSaveTransportResponse<Payload>,
    state: State,
  ) => State | null | Promise<State | null>;
}) {
  let state = initialState;
  let retryCount = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await send(state, attempt);
    if (response.ok) {
      return { kind: "success" as const, state, response, attempts: attempt + 1 };
    }

    const decision = nextSessionSaveAttempt(retryCount, response.status);
    if (response.status !== 409) {
      return { kind: "failure" as const, state, response, attempts: attempt + 1 };
    }
    if (!decision.retry) {
      return { kind: "exhausted" as const, state, response, attempts: attempt + 1 };
    }

    const resolvedState = await resolveConflict(response, state);
    if (resolvedState == null) {
      return { kind: "unresolved" as const, state, response, attempts: attempt + 1 };
    }
    state = resolvedState;
    retryCount = decision.nextRetryCount;
  }

  throw new Error("unreachable session save retry state");
}

export function shouldSkipSessionSave<Session>(
  token: { sessions: readonly Session[]; activeSessionId: string } | null,
  currentSessions: readonly Session[],
  activeSessionId: string,
) {
  return Boolean(
    token
      && token.sessions === currentSessions
      && token.activeSessionId === activeSessionId,
  );
}
