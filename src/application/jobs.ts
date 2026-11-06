/**
 * Background work the application runs: generation, grading and pairwise
 * votes. Interfaces either poll `listJobs` or subscribe with `watchJobs`, which
 * reports once per tick however many lines a job logged in it.
 */
import type { Job, JobKind } from '@domain/views.ts'

export type { Job } from '@domain/views.ts'

const LIST_LIMIT = 12

const jobs: Job[] = []
const watchers = new Set<(jobs: Job[]) => void>()
let pending = false

export const listJobs = (limit = LIST_LIMIT): Job[] => jobs.slice(0, limit)

/** Be told after every change to the job list, coalesced per tick. Returns the unsubscribe. */
export function watchJobs(listener: (jobs: Job[]) => void): () => void {
  watchers.add(listener)
  return () => {
    watchers.delete(listener)
  }
}

function changed(): void {
  if (pending || !watchers.size) return
  pending = true
  queueMicrotask(() => {
    pending = false
    const snapshot = listJobs()
    for (const listener of watchers) listener(snapshot)
  })
}

function startJob(kind: JobKind, title: string, skillPath: string | null): Job {
  const job: Job = {
    id: jobs.length + 1,
    kind,
    title,
    status: 'running',
    log: [],
    startedAt: Date.now(),
    finishedAt: null,
    skillPath,
    progress: null,
  }
  jobs.unshift(job)
  changed()
  return job
}

export const say = (job: Job, line: string): void => {
  job.log.push(`${new Date().toTimeString().slice(0, 8)}  ${line}`)
  changed()
}

/** Say how much of the job there is: `total` units, none done yet. */
export const sizeJob = (job: Job, total: number): void => {
  job.progress = { done: 0, total }
  changed()
}

/** One more unit of a sized job is done. */
export const stepJob = (job: Job): void => {
  if (!job.progress) return
  job.progress = { ...job.progress, done: Math.min(job.progress.total, job.progress.done + 1) }
  changed()
}

function finishJob(job: Job, ok: boolean): void {
  job.status = ok ? 'done' : 'failed'
  job.finishedAt = Date.now()
  changed()
}

/** Run `work` as a job on the skill at `skillPath`; its errors land in the log instead of the caller. */
export function runJob(
  kind: JobKind,
  title: string,
  skillPath: string | null,
  work: (job: Job) => Promise<boolean>,
): Job {
  const job = startJob(kind, title, skillPath)
  work(job).then(
    (ok) => finishJob(job, ok),
    (error: Error) => {
      say(job, error.message)
      finishJob(job, false)
    },
  )
  return job
}
