/** The jobs strip: what the server is running now, and the last logs. It hides a minute after a job succeeds. */
import { cva } from 'class-variance-authority'
import { useState } from 'react'
import type { Job } from '../api.ts'
import { Stack } from './layout.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

const QUIET_AFTER_MS = 60_000

const strip = cva(
  'flex min-h-8 items-center border-b bg-muted pr-[max(16px,env(safe-area-inset-right,0px))] pl-[max(16px,env(safe-area-inset-left,0px))] text-xs',
  {
    variants: {
      status: {
        busy: '',
        running: '',
        done: '',
        failed: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
      },
    },
  },
)

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
      <div className={strip({ status: running.length ? 'busy' : recent.status })}>
        <Button
          type="button"
          variant="ghost"
          size="inline"
          className="min-h-8 font-normal hover:bg-transparent"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {running.length ? (
            <span
              className="mr-2 inline-block size-[7px] animate-pulse rounded-full bg-current"
              aria-hidden="true"
            />
          ) : null}
          {label}
          <Text tone="muted"> · {open ? 'Hide log' : 'Show log'}</Text>
        </Button>
      </div>
      {open ? (
        <div className="border-b bg-muted px-[max(16px,env(safe-area-inset-left,0px))] pt-2 pb-3">
          <JobLogs jobs={jobs.slice(0, 3)} />
        </div>
      ) : null}
    </>
  )
}

const jobCard = cva('rounded-md border bg-card px-2.5 py-2', {
  variants: {
    status: {
      running: '',
      done: '',
      failed: 'border-destructive',
    },
  },
})

export function JobLogs({ jobs }: { jobs: Job[] }) {
  return (
    <Stack>
      {jobs.map((job) => (
        <div key={job.id} className={jobCard({ status: job.status })}>
          <div className="text-xs">
            <b>{job.title}</b> <Text tone="muted">{job.status}</Text>
          </div>
          {/* One scroller per screen on touch: the log flows at full height there. */}
          <pre className="mt-1 max-h-60 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap break-words text-muted-foreground pointer-coarse:max-h-none pointer-coarse:overflow-visible">
            {job.log.slice(-40).join('\n') || 'Starting…'}
          </pre>
        </div>
      ))}
    </Stack>
  )
}
