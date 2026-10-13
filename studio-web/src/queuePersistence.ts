export type QueueJobStatus = "queued" | "running" | "success" | "error" | "canceled";
export type QueueJobEngine = "gpt-image-2" | "banana";
export const REFRESH_INTERRUPTED_QUEUE_ERROR = "__refresh_interrupted__";
export const MAX_ACTIVE_QUEUE_JOBS = 80;

export type PersistentQueueImage = {
  id?: string;
  name?: string;
  saved_name?: string;
  saved_url?: string;
  saved_path?: string;
  url?: string;
  data_url?: string;
  mime_type?: string;
};

export type PersistentQueueJob = {
  id: string;
  turnId: string;
  sessionId: string;
  clientId?: string;
  prompt: string;
  engine: QueueJobEngine;
  configName: string;
  model: string;
  status: QueueJobStatus;
  createdAt: string;
  finishedAt?: string;
  elapsedSeconds?: number;
  images?: PersistentQueueImage[];
  error?: string;
};

const validStatuses = new Set<QueueJobStatus>(["queued", "running", "success", "error", "canceled"]);
const validEngines = new Set<QueueJobEngine>(["gpt-image-2", "banana"]);
const maxStoredQueueJobs = 30;

function cleanImage(value: unknown): PersistentQueueImage | null {
  if (!value || typeof value !== "object") return null;
  const image = value as Record<string, unknown>;
  const next: PersistentQueueImage = {};
  (["id", "name", "saved_name", "saved_url", "saved_path", "url", "data_url", "mime_type"] as const).forEach((key) => {
    const raw = image[key];
    if (typeof raw === "string" && raw.trim()) {
      next[key] = raw;
    }
  });
  return Object.keys(next).length ? next : null;
}

function normalizeQueueJob(value: unknown): PersistentQueueJob | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id || "").trim();
  const turnId = String(item.turnId || "").trim();
  const sessionId = String(item.sessionId || "").trim();
  const engine = String(item.engine || "") as QueueJobEngine;
  const status = String(item.status || "") as QueueJobStatus;
  if (!id || !turnId || !sessionId || !validEngines.has(engine) || !validStatuses.has(status)) return null;

  const interrupted = status === "running" || status === "queued";
  const images = Array.isArray(item.images) ? item.images.map(cleanImage).filter((image): image is PersistentQueueImage => Boolean(image)) : [];
  const elapsedSeconds = Number(item.elapsedSeconds);
  return {
    id,
    turnId,
    sessionId,
    clientId: typeof item.clientId === "string" ? item.clientId : undefined,
    prompt: String(item.prompt || ""),
    engine,
    configName: String(item.configName || "默认配置"),
    model: String(item.model || "模型名"),
    status: interrupted ? "canceled" : status,
    createdAt: String(item.createdAt || new Date().toISOString()),
    finishedAt: String(item.finishedAt || (interrupted ? new Date().toISOString() : "")) || undefined,
    elapsedSeconds: Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : undefined,
    images: images.length ? images : undefined,
    error: interrupted ? REFRESH_INTERRUPTED_QUEUE_ERROR : String(item.error || "") || undefined,
  };
}

export function normalizeStoredQueueJobs(value: unknown, clientId?: string): PersistentQueueJob[] {
  if (!Array.isArray(value)) return [];
  const values: unknown[] = clientId ? value.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const job = item as Record<string, unknown>;
    return job.clientId === clientId
      || (!["running", "queued"].includes(String(job.status)) && job.error !== REFRESH_INTERRUPTED_QUEUE_ERROR);
  }) : value;
  const isActive = (item: unknown) => Boolean(item && typeof item === "object"
    && ["running", "queued"].includes(String((item as { status?: unknown }).status)));
  const normalize = (items: unknown[]) => items.map(normalizeQueueJob).filter((job): job is PersistentQueueJob => Boolean(job));
  const active = normalize(values.filter(isActive)).slice(0, MAX_ACTIVE_QUEUE_JOBS);
  const jobs = normalize(values.filter((item) => !isActive(item)));
  // A refresh must retain every admitted active job, even after marking it canceled.
  const interrupted = jobs.filter((job) => job.error === REFRESH_INTERRUPTED_QUEUE_ERROR).slice(0, MAX_ACTIVE_QUEUE_JOBS - active.length);
  const finished = jobs.filter((job) => job.error !== REFRESH_INTERRUPTED_QUEUE_ERROR);
  return [...active, ...interrupted, ...finished.slice(0, Math.max(0, maxStoredQueueJobs - active.length - interrupted.length))];
}

export function serializeQueueJobs(jobs: PersistentQueueJob[]): string {
  const compact = normalizeStoredQueueJobs(jobs);
  return JSON.stringify(compact);
}
