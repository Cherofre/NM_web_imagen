type QueueStatus = "queued" | "running" | "success" | "error" | "canceled";

type QueueJobLike = {
  id: string;
  sessionId: string;
  turnId: string;
  status: QueueStatus;
  error?: string;
  finishedAt?: string;
  clientId?: string;
};

type TurnLike = {
  id: string;
  status: "queued" | "running" | "success" | "error";
  error?: string;
  finishedAt?: string;
  meta?: Record<string, unknown>;
};

type SessionLike<Turn extends TurnLike = TurnLike> = {
  id: string;
  turns: Turn[];
  updatedAt?: string;
};

const activeQueueStatuses = new Set<QueueStatus>(["queued", "running"]);
const refreshInterruptedMessage = "__refresh_interrupted__";
const legacyRefreshInterruptedMessage = "页面刷新，任务已中断";

function isRefreshInterruptedError(error?: string) {
  return error === refreshInterruptedMessage || error === legacyRefreshInterruptedMessage;
}

export function hasActiveQueueJobForSession(jobs: QueueJobLike[], sessionId: string) {
  return jobs.some((job) => job.sessionId === sessionId && activeQueueStatuses.has(job.status));
}

export function hasActiveQueueJobForTurn(jobs: QueueJobLike[], sessionId: string, turnId: string) {
  return jobs.some((job) => (
    job.sessionId === sessionId
    && job.turnId === turnId
    && activeQueueStatuses.has(job.status)
  ));
}

export function queueJobTargetExists(sessions: SessionLike[], job: Pick<QueueJobLike, "sessionId" | "turnId">) {
  return sessions.some((session) => (
    session.id === job.sessionId && session.turns.some((turn) => turn.id === job.turnId)
  ));
}

export function reconcileInterruptedQueueTurns<Session extends SessionLike>(sessions: Session[], jobs: QueueJobLike[], clientId?: string, liveTurns?: ReadonlySet<string>) {
  const interruptedByTurn = new Map<string, QueueJobLike>();
  jobs.forEach((job) => {
    if (job.status === "canceled" && isRefreshInterruptedError(job.error) && (!clientId || job.clientId === clientId)) {
      interruptedByTurn.set(`${job.sessionId}:${job.turnId}`, job);
    }
  });
  if (!interruptedByTurn.size && !clientId) return sessions;

  return sessions.map((session) => {
    let changed = false;
    let interruptionTime: string | undefined;
    const turns = session.turns.map((turn) => {
      if (turn.status !== "running" && turn.status !== "queued") return turn;
      const key = `${session.id}:${turn.id}`;
      if (liveTurns?.has(key)) return turn;
      if (clientId && turn.meta?.client_id && turn.meta.client_id !== clientId) return turn;
      const job = interruptedByTurn.get(key);
      if (!job && (!clientId || turn.meta?.client_id !== clientId)) return turn;
      changed = true;
      if (job?.finishedAt && (!interruptionTime || job.finishedAt > interruptionTime)) interruptionTime = job.finishedAt;
      return {
        ...turn,
        status: "error" as const,
        error: refreshInterruptedMessage,
        finishedAt: job?.finishedAt || session.updatedAt || new Date().toISOString(),
      };
    });
    if (!changed) return session;
    return {
      ...session,
      updatedAt: interruptionTime || session.updatedAt,
      turns,
    };
  });
}
