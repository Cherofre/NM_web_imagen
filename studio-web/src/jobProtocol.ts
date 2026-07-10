export type JobProtocolLanguage = "zh-CN" | "en";

export function appendJobId(form: FormData, jobId: string) {
  form.set("job_id", jobId);
  return form;
}

export function withJobId<Payload extends Record<string, unknown>>(payload: Payload, jobId: string) {
  return {
    ...payload,
    job_id: jobId,
  };
}

export function cancelJobUrl(jobId: string) {
  return `/api/jobs/${encodeURIComponent(jobId)}/cancel`;
}

export function cancellationNotice(language: JobProtocolLanguage) {
  return language === "en"
    ? "Canceled locally. If the provider already accepted the request, it may still run or be billed."
    : "已在本地取消；如果上游已经接单，仍可能继续运行或计费。";
}

export async function cancelJobBeforeAbort<Result>({
  markCanceling,
  requestCancel,
  abort,
  cleanup,
}: {
  markCanceling: () => void;
  requestCancel: () => Result | Promise<Result>;
  abort: () => void;
  cleanup: () => void;
}) {
  markCanceling();
  try {
    return await requestCancel();
  } finally {
    try {
      abort();
    } finally {
      cleanup();
    }
  }
}

export function settleQueueCancellation<Result>({
  jobId,
  pending,
  requestCancellation,
  markCanceling,
  requestCancel,
  abort,
  cleanup,
}: {
  jobId: string;
  pending: Map<string, Promise<unknown>>;
  requestCancellation: boolean;
  markCanceling: () => void;
  requestCancel: () => Result | Promise<Result>;
  abort: () => void;
  cleanup: () => void;
}): Promise<Result | undefined> {
  const existing = pending.get(jobId);
  if (existing) return existing as Promise<Result | undefined>;

  if (requestCancellation) markCanceling();
  const operation = (
    requestCancellation
      ? Promise.resolve().then(() => requestCancel())
      : Promise.resolve(undefined)
  ).finally(() => {
    try {
      abort();
    } finally {
      cleanup();
    }
  });
  pending.set(jobId, operation);
  return operation;
}

export function cancelJobThenRemove<Result>({
  jobId,
  pending,
  settle,
  cancel,
  remove,
}: {
  jobId: string;
  pending: Map<string, Promise<void>>;
  settle?: () => Result | Promise<Result>;
  cancel?: () => Result | Promise<Result>;
  remove: () => void;
}) {
  const existing = pending.get(jobId);
  if (existing) return existing;

  let operation: Promise<void>;
  operation = Promise.resolve()
    .then(() => (settle || cancel)?.())
    .catch(() => undefined)
    .then(() => {
      remove();
    })
    .catch(() => undefined)
    .finally(() => {
      if (pending.get(jobId) === operation) pending.delete(jobId);
    });
  pending.set(jobId, operation);
  return operation;
}

export function removeCompletedQueueJobs<
  Job extends { status: "queued" | "running" | "success" | "error" | "canceled" },
>(
  jobs: readonly Job[],
  remove: (job: Job) => void | Promise<void>,
) {
  return Promise.all(
    jobs
      .filter((job) => job.status === "success" || job.status === "error" || job.status === "canceled")
      .map((job) => remove(job)),
  );
}
