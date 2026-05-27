export type GenerationQueueStatus = "queued" | "running" | "success" | "error" | "canceled";

export type GenerationQueueJobLike = {
  id: string;
  status: GenerationQueueStatus;
  createdAt: string;
};

export function hasRunningGenerationJob(jobs: GenerationQueueJobLike[]) {
  return jobs.some((job) => job.status === "running");
}

export function nextGenerationJobStatus(jobs: GenerationQueueJobLike[]) {
  return hasRunningGenerationJob(jobs) ? "queued" : "running";
}

export function nextQueuedGenerationJob<Job extends GenerationQueueJobLike>(jobs: Job[]) {
  if (hasRunningGenerationJob(jobs)) return undefined;
  return jobs
    .filter((job) => job.status === "queued")
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return leftTime - rightTime;
    })[0];
}

export function appendGenerationQueueJob<Job extends GenerationQueueJobLike>(jobs: Job[], job: Job, maxStoredJobs = 30) {
  const nextJobs = [job, ...jobs];
  const activeJobs = nextJobs.filter((item) => item.status === "queued" || item.status === "running");
  const finishedJobs = nextJobs.filter((item) => item.status !== "queued" && item.status !== "running");
  if (activeJobs.length >= maxStoredJobs) return activeJobs;
  return [...activeJobs, ...finishedJobs.slice(0, maxStoredJobs - activeJobs.length)];
}
