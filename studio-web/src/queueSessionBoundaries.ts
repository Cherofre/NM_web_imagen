type QueueStatus = "queued" | "running" | "success" | "error" | "canceled";

type QueueJobLike = {
  id: string;
  sessionId: string;
  turnId: string;
  status: QueueStatus;
  error?: string;
  finishedAt?: string;
};

type TurnLike = {
  id: string;
  status: "queued" | "running" | "success" | "error";
  error?: string;
  finishedAt?: string;
};

type SessionLike<Turn extends TurnLike = TurnLike> = {
  id: string;
  turns: Turn[];
  updatedAt?: string;
};

const activeQueueStatuses = new Set<QueueStatus>(["queued", "running"]);
const refreshInterruptedMessage = "页面刷新，任务已中断";

export function hasActiveQueueJobForSession(jobs: QueueJobLike[], sessionId: string) {
  return jobs.some((job) => job.sessionId === sessionId && activeQueueStatuses.has(job.status));
}

export function queueJobTargetExists(sessions: SessionLike[], job: Pick<QueueJobLike, "sessionId" | "turnId">) {
  return sessions.some((session) => (
    session.id === job.sessionId && session.turns.some((turn) => turn.id === job.turnId)
  ));
}

export function reconcileInterruptedQueueTurns<Session extends SessionLike>(sessions: Session[], jobs: QueueJobLike[]) {
  const interruptedByTurn = new Map<string, QueueJobLike>();
  jobs.forEach((job) => {
    if (job.status === "canceled" && job.error === refreshInterruptedMessage) {
      interruptedByTurn.set(`${job.sessionId}:${job.turnId}`, job);
    }
  });
  if (!interruptedByTurn.size) return sessions;

  return sessions.map((session) => {
    let changed = false;
    const turns = session.turns.map((turn) => {
      if (turn.status !== "running" && turn.status !== "queued") return turn;
      const job = interruptedByTurn.get(`${session.id}:${turn.id}`);
      if (!job) return turn;
      changed = true;
      return {
        ...turn,
        status: "error" as const,
        error: refreshInterruptedMessage,
        finishedAt: job.finishedAt,
      };
    });
    if (!changed) return session;
    const latestInterrupted = turns.find((turn) => turn.error === refreshInterruptedMessage);
    return {
      ...session,
      updatedAt: latestInterrupted?.finishedAt || session.updatedAt,
      turns,
    };
  });
}
