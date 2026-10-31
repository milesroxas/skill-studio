/** Background work the server runs: generation, grading and pairwise votes. The page polls the log. */

export interface Job {
  id: number
  kind: 'generate' | 'grade' | 'pairwise'
  title: string
  status: 'running' | 'done' | 'failed'
  log: string[]
  startedAt: number
  finishedAt: number | null
}

const jobs: Job[] = []

function startJob(kind: Job['kind'], title: string): Job {
  const job: Job = {
    id: jobs.length + 1,
    kind,
    title,
    status: 'running',
    log: [],
    startedAt: Date.now(),
    finishedAt: null,
  }
  jobs.unshift(job)
  return job
}

export const say = (job: Job, line: string): void => {
  job.log.push(`${new Date().toTimeString().slice(0, 8)}  ${line}`)
}

function finishJob(job: Job, ok: boolean): void {
  job.status = ok ? 'done' : 'failed'
  job.finishedAt = Date.now()
}

/** Run `work` as a job; its errors land in the log instead of the server. */
export function runJob(
  kind: Job['kind'],
  title: string,
  work: (job: Job) => Promise<boolean>,
): Job {
  const job = startJob(kind, title)
  work(job).then(
    (ok) => finishJob(job, ok),
    (error: Error) => {
      say(job, error.message)
      finishJob(job, false)
    },
  )
  return job
}

export const listJobs = (limit = 12): Job[] => jobs.slice(0, limit)
