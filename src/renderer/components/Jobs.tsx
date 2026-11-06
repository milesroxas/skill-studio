/**
 * What the backend is running, at the foot of the sidebar: a pulsing dot and a
 * line while a job runs, the last result for a minute after, and the logs in a
 * popover. It never moves the screen above it.
 */
import { cva } from 'class-variance-authority'
import type { Job } from '../api.ts'
import { Rows } from './layout.tsx'
import { Text } from './text.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

const QUIET_AFTER_MS = 60_000

const indicator = cva(
  'flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-[background-color] duration-150 ease-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-sidebar-accent',
  {
    variants: {
      status: {
        running: 'text-sidebar-foreground',
        done: 'text-muted-foreground',
        failed: 'text-destructive',
      },
    },
  },
)

const dot = cva('size-1.5 shrink-0 rounded-full', {
  variants: {
    status: {
      running: 'animate-pulse bg-signal',
      done: 'bg-success',
      failed: 'bg-destructive',
    },
  },
})

export function JobsIndicator({ jobs }: { jobs: Job[] }) {
  const running = jobs.filter((j) => j.status === 'running')
  const recent = jobs[0]
  if (!recent) return null
  const settled =
    !running.length &&
    recent.status === 'done' &&
    recent.finishedAt !== null &&
    Date.now() - recent.finishedAt > QUIET_AFTER_MS
  if (settled) return null
  const status = running.length ? 'running' : recent.status
  const label = running.length
    ? running.length === 1
      ? running[0].title
      : `${running.length} jobs running`
    : recent.status === 'failed'
      ? `Failed: ${recent.title}`
      : `Done: ${recent.title}`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={indicator({ status })}
          aria-label={`${label}. Show the log.`}
        >
          <span className={dot({ status })} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate" title={label}>
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" size="wide">
        <JobLogs jobs={jobs.slice(0, 3)} />
      </PopoverContent>
    </Popover>
  )
}

/** The latest jobs, newest first: a row each with its title, status and the tail of its log. */
export function JobLogs({ jobs }: { jobs: Job[] }) {
  return (
    <Rows>
      {jobs.map((job) => (
        <li key={job.id} className="flex flex-col gap-1 py-2.5">
          <Text size="xs">
            <Text weight="semibold" tone={job.status === 'failed' ? 'destructive' : 'default'}>
              {job.title}
            </Text>{' '}
            <Text tone="muted">{job.status}</Text>
          </Text>
          {/* One scroller per screen on touch: the log flows at full height there. */}
          <pre className="m-0 max-h-60 overflow-auto font-mono text-2xs whitespace-pre-wrap break-words text-muted-foreground pointer-coarse:max-h-none pointer-coarse:overflow-visible">
            {job.log.slice(-40).join('\n') || 'Starting…'}
          </pre>
        </li>
      ))}
    </Rows>
  )
}
