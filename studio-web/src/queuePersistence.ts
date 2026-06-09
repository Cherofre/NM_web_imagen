export type QueueJobStatus = "queued" | "running" | "success" | "error" | "canceled";
export type QueueJobEngine = "gpt-image-2" | "banana";
export const REFRESH_INTERRUPTED_QUEUE_ERROR = "__refresh_interrupted__";

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

export function normalizeStoredQueueJobs(value: unknown): PersistentQueueJob[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeQueueJob).filter((job): job is PersistentQueueJob => Boolean(job)).slice(0, maxStoredQueueJobs);
}

export function serializeQueueJobs(jobs: PersistentQueueJob[]): string {
  const compact = normalizeStoredQueueJobs(jobs).slice(0, maxStoredQueueJobs);
  return JSON.stringify(compact);
}
