export type SessionLike = {
  id: string;
  updatedAt?: unknown;
};

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

export function mergeSessionsByUpdatedAt<Session extends SessionLike>(
  localSessions: readonly Session[],
  serverSessions: readonly Session[],
) {
  const localById = dedupeSessions(localSessions);
  const serverById = dedupeSessions(serverSessions);
  const ids = new Set([...localById.keys(), ...serverById.keys()]);
  const merged: Session[] = [];

  for (const id of ids) {
    const local = localById.get(id);
    const server = serverById.get(id);
    const selected = local && server
      ? preferLocalSession(local, server) ? local : server
      : local || server;
    if (selected) merged.push({ ...selected });
  }

  return merged.sort(compareSessionOrder);
}

export function nextSessionSaveAttempt(retryCount: number, status: number) {
  const normalizedRetryCount = Number.isInteger(retryCount) && retryCount > 0 ? retryCount : 0;
  if (status === 409 && normalizedRetryCount < 1) {
    return { retry: true, nextRetryCount: 1 };
  }
  return { retry: false, nextRetryCount: normalizedRetryCount };
}
