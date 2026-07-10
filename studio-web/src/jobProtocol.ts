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
