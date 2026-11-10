/**
 * What the backend is running, at the foot of the sidebar: a pulsing dot and a
 * line while a job runs, the last result for a minute after, and the logs in a
 * popover. It never moves the screen above it.
 */
import { cva } from 'class-variance-authority'
import { useEffect, useState } from 'react'
import { api, type Job, type JobProgress } from '../api.ts'
import { reportFailure } from '../transport.ts'
import { Rows } from './layout.tsx'
import { Dot, type Tone } from './Status.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

const QUIET_AFTER_MS = 60_000

const indicator = cva(
  'flex min-h-8 w-full flex-col justify-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs focus-ring-inset transition-[background-color] duration-150 ease-out hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent',
  {
    variants: {
      status: {
        running: 'text-sidebar-foreground',
        done: 'text-muted-foreground',
        failed: 'text-destructive',
        stopped: 'text-muted-foreground',
      },
    },
  },
)

/** Running is the yellow dot, the one that moves. */
const TONE = {
  running: 'signal',
  done: 'success',
  failed: 'destructive',
  // Ended by the reader: a fact, not a verdict.
  stopped: 'muted',
} as const satisfies Record<string, Tone>

/** What the running jobs that know their size add up to; null when none does. */
function progressOf(jobs: readonly Job[]): JobProgress | null {
  const sized = jobs.flatMap((j) => (j.status === 'running' && j.progress ? [j.progress] : []))
  if (!sized.length) return null
  return sized.reduce((sum, p) => ({ done: sum.done + p.done, total: sum.total + p.total }))
}

/** How far a job has come, as a hairline that fills from the left. Never yellow: the dot says running. */
function ProgressBar({ done, total }: JobProgress) {
  return (
    <span aria-hidden="true" className="block h-0.5 w-full overflow-hidden bg-foreground/10">
      <span
        className="block h-full origin-left bg-foreground/70 transition-transform duration-300 ease-out-strong"
        style={{ transform: `scaleX(${total ? done / total : 0})` }}
      />
    </span>
  )
}

/**
 * A skill's run in progress, on its row in a list of skills: the running dot
 * on an ink chip, and how far the run has come when it knows.
 */
export function RunningTag({ jobs, skillPath }: { jobs: readonly Job[]; skillPath: string }) {
  const mine = jobs.filter((j) => j.status === 'running' && j.skillPath === skillPath)
  if (!mine.length) return null
  const progress = progressOf(mine)
  return (
    <span
      data-surface="ink"
      className="ml-2 inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 align-middle font-mono text-2xs font-medium tabular-nums"
    >
      <Dot size="sm" tone={TONE.running} />
      Running{progress ? ` ${progress.done}/${progress.total}` : null}
    </span>
  )
}

export function JobsIndicator({ jobs }: { jobs: Job[] }) {
  const running = jobs.filter((j) => j.status === 'running')
  const recent = jobs[0]
  /** When the last result has been in view long enough; null while it stays, as a running or failed one does. */
  const quietAt =
    recent &&
    !running.length &&
    (recent.status === 'done' || recent.status === 'stopped') &&
    recent.finishedAt !== null
      ? recent.finishedAt + QUIET_AFTER_MS
      : null
  // Nothing else may render in that minute: the line takes itself away.
  const [, setQuiet] = useState(0)
  useEffect(() => {
    if (quietAt === null || quietAt <= Date.now()) return
    const timer = setTimeout(() => setQuiet(quietAt), quietAt - Date.now())
    return () => clearTimeout(timer)
  }, [quietAt])
  if (!recent) return null
  if (quietAt !== null && Date.now() >= quietAt) return null
  const status = running.length ? 'running' : recent.status
  const progress = progressOf(running)
  const label = running.length
    ? running.length === 1
      ? running[0].title
      : `${running.length} jobs running`
    : recent.status === 'failed'
      ? `Failed: ${recent.title}`
      : recent.status === 'stopped'
        ? `Stopped: ${recent.title}`
        : `Done: ${recent.title}`
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={indicator({ status })}
          aria-label={`${label}${progress ? `, ${progress.done} of ${progress.total} done` : ''}. Show the log.`}
        >
          <span className="flex w-full items-center gap-2">
            <Dot size="sm" tone={TONE[status]} />
            <span className="min-w-0 flex-1 truncate" title={label}>
              {label}
            </span>
            {progress ? (
              <Text font="mono" tone="muted" tabular aria-hidden="true">
                {progress.done}/{progress.total}
              </Text>
            ) : null}
          </span>
          {progress ? <ProgressBar {...progress} /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" size="wide">
        <JobLogs jobs={jobs.slice(0, 3)} />
      </PopoverContent>
    </Popover>
  )
}

/** Stop the running job on this row. The job's log says "Stopped." when it has. */
function StopJob({ job }: { job: Job }) {
  const [stopping, setStopping] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      busy={stopping}
      busyLabel="Stopping…"
      onClick={() => {
        setStopping(true)
        // The row leaves with the job's status, so a failed stop puts the button back and says why.
        api.stopJob(job.id).catch((e: Error) => {
          setStopping(false)
          reportFailure(e)
        })
      }}
    >
      Stop
    </Button>
  )
}

/** The latest jobs, newest first: a row each with its title, status and the tail of its log. */
function JobLogs({ jobs }: { jobs: Job[] }) {
  return (
    <Rows>
      {jobs.map((job) => (
        <li key={job.id} className="flex flex-col gap-1 py-2.5">
          <span className="flex items-center justify-between gap-2">
            <Text size="xs">
              <Text weight="semibold" tone={job.status === 'failed' ? 'destructive' : 'default'}>
                {job.title}
              </Text>{' '}
              <Text tone="muted">{job.status}</Text>
            </Text>
            {job.status === 'running' ? <StopJob job={job} /> : null}
          </span>
          {/* One scroller per screen on touch: the log flows at full height there. */}
          <pre className="m-0 max-h-60 overflow-auto font-mono text-2xs whitespace-pre-wrap break-words text-muted-foreground pointer-coarse:max-h-none pointer-coarse:overflow-visible">
            {job.log.slice(-40).join('\n') || 'Starting…'}
          </pre>
        </li>
      ))}
    </Rows>
  )
}
