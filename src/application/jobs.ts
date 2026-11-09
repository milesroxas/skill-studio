/**
 * Background work the application runs: generation and grading. Interfaces
 * either poll `listJobs` or subscribe with `watchJobs`, which
 * reports once per tick however many lines a job logged in it. Each job has
 * an abort controller kept here, never on the job the interfaces read, so
 * `stopJob` can end it.
 */
import type { Job, JobKind } from '@domain/views.ts'

export type { Job } from '@domain/views.ts'

const LIST_LIMIT = 12
/** Finished jobs kept, with their logs, for the list to show. Older ones go. */
const KEEP_FINISHED = 50

const jobs: Job[] = []
const controllers = new Map<number, AbortController>()
/** What a job works on, so a second job on the same thing can be refused: a skill path, or a run. */
const targets = new Map<number, string>()
const watchers = new Set<(jobs: Job[]) => void>()
let pending = false
let nextId = 1

export const listJobs = (limit = LIST_LIMIT): Job[] => jobs.slice(0, limit)

/** The running job of `kind` on `target`, if there is one. */
export const runningJob = (kind: JobKind, target: string): Job | undefined =>
  jobs.find(
    (job) => job.status === 'running' && job.kind === kind && targets.get(job.id) === target,
  )

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

/** Drop the oldest finished jobs beyond the cap. The list is newest first, so they sit at its end. */
function trim(): void {
  let finished = 0
  for (let i = 0; i < jobs.length; i += 1) {
    if (jobs[i].status === 'running') continue
    finished += 1
    if (finished > KEEP_FINISHED) {
      const [gone] = jobs.splice(i, 1)
      controllers.delete(gone.id)
      targets.delete(gone.id)
      i -= 1
    }
  }
}

function startJob(kind: JobKind, title: string, skillPath: string | null, target: string): Job {
  const job: Job = {
    id: nextId++,
    kind,
    title,
    status: 'running',
    log: [],
    startedAt: Date.now(),
    finishedAt: null,
    skillPath,
    progress: null,
  }
  controllers.set(job.id, new AbortController())
  targets.set(job.id, target)
  jobs.unshift(job)
  trim()
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
  // A stopped job did not do what it set out to, so it is neither done nor failed.
  job.status = controllers.get(job.id)?.signal.aborted ? 'stopped' : ok ? 'done' : 'failed'
  job.finishedAt = Date.now()
  controllers.delete(job.id)
  trim()
  changed()
}

/**
 * Stop a running job. Its work sees the signal: agents in flight are ended,
 * no more samples start, and the job finishes as stopped with "Stopped." in
 * its log. A job that has already finished is left as it is.
 */
export function stopJob(id: number): Job {
  const job = jobs.find((j) => j.id === id)
  if (!job) throw new Error('That job is no longer listed.')
  const controller = controllers.get(id)
  if (job.status !== 'running' || !controller) throw new Error('That job has already finished.')
  if (!controller.signal.aborted) {
    controller.abort()
    say(job, 'Stopped.')
  }
  return job
}

/**
 * Run `work` as a job on the skill at `skillPath`; its errors land in the log
 * instead of the caller. `target` names what it works on, for `runningJob`.
 */
export function runJob(
  kind: JobKind,
  title: string,
  skillPath: string | null,
  target: string,
  work: (job: Job, signal: AbortSignal) => Promise<boolean>,
): Job {
  const job = startJob(kind, title, skillPath, target)
  const controller = controllers.get(job.id) as AbortController
  work(job, controller.signal).then(
    (ok) => finishJob(job, ok),
    (error: Error) => {
      // "Stopped." was said when the job was stopped; what the work threw on the way out is noise.
      if (!controller.signal.aborted) say(job, error.message)
      finishJob(job, false)
    },
  )
  return job
}
