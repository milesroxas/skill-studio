/** The jobs strip: what the server is running now, and the last logs. It hides a minute after a job succeeds. */
import { useState } from 'react'
import type { Job } from '../api.ts'

const QUIET_AFTER_MS = 60_000

export function JobsStrip({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(false)
  const running = jobs.filter((j) => j.status === 'running')
  const recent = jobs[0]
  if (!recent) return null
  const settled =
    !running.length &&
    recent.status === 'done' &&
    recent.finishedAt !== null &&
    Date.now() - recent.finishedAt > QUIET_AFTER_MS
  if (settled) return null
  const label = running.length
    ? `Running ${running.map((j) => j.title).join(', ')}`
    : recent.status === 'failed'
      ? `Failed: ${recent.title}`
      : `Done: ${recent.title}`
  return (
    <>
      <div className={`jobs-strip ${running.length ? 'busy' : recent.status}`}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {running.length ? <span className="dot" aria-hidden="true" /> : null}
          {label}
          <span className="muted"> · {open ? 'Hide log' : 'Show log'}</span>
        </button>
      </div>
      {open ? (
        <div className="jobs-open">
          <JobLogs jobs={jobs.slice(0, 3)} />
        </div>
      ) : null}
    </>
  )
}

export function JobLogs({ jobs }: { jobs: Job[] }) {
  return (
    <div className="stack">
      {jobs.map((job) => (
        <div key={job.id} className={`job ${job.status}`}>
          <div className="job-title">
            <b>{job.title}</b> <span className="muted">{job.status}</span>
          </div>
          <pre className="log">{job.log.slice(-40).join('\n') || 'Starting…'}</pre>
        </div>
      ))}
    </div>
  )
}
