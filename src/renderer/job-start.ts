/**
 * A button that starts a job is busy from the press until the job is over.
 * Starting returns as soon as the job is queued, and in a browser the list of
 * jobs is polled every few seconds, so between the two the button would come
 * back and ask to be pressed again. This holds it over that gap.
 */
import { useCallback, useEffect, useState } from 'react'
import type { Job } from './api.ts'
import type { Reporter } from './hooks.ts'

/** How long a start is held after its call returns while its job has not shown in the list. */
const SHOW_WITHIN_MS = 5000

/** The job of `kind` still running, by its title when one is given. */
function runningJob(jobs: readonly Job[], kind: Job['kind'], title?: string): Job | undefined {
  return jobs.find(
    (j) => j.status === 'running' && j.kind === kind && (title === undefined || j.title === title),
  )
}

/** Whether any running job, a grading or a run's own grading step, is grading `run` of the skill at `skillPath`. */
export const gradingRun = (jobs: readonly Job[], skillPath: string, run: string): boolean =>
  jobs.some((j) => j.status === 'running' && j.skillPath === skillPath && j.grading.includes(run))

/** A start with no title of its own: any job of the kind answers it. */
const ANY = ''

export interface JobStart {
  /** A start of the job titled `title` (any, when left out) was pressed and its job has not shown yet. */
  starting: (title?: string) => boolean
  /** That, or the job is running: what the button that starts it is busy on. */
  busy: (title?: string) => boolean
  /**
   * Start the jobs titled `titles` (none: one job of the kind, whatever its
   * title) by running `work`. One start at a time: a second press while one
   * is held does nothing. A failure is reported and lets go at once.
   */
  start: (titles: string[], work: () => Promise<void>) => Promise<void>
}

/** Follow the starts of jobs of one `kind` among `jobs`. */
export function useJobStart(jobs: readonly Job[], kind: Job['kind'], report: Reporter): JobStart {
  /** The titles whose start is being called. */
  const [calling, setCalling] = useState<string[]>([])
  /** The titles whose call returned and whose job the list has not shown yet. */
  const [waiting, setWaiting] = useState<string[]>([])

  // A job that shows in the list keeps its button busy by itself from then on.
  useEffect(() => {
    const left = waiting.filter((title) => !runningJob(jobs, kind, title || undefined))
    if (left.length !== waiting.length) setWaiting(left)
  }, [jobs, kind, waiting])
  // A job that never shows, such as one over before the next poll, does not hold the button for good.
  useEffect(() => {
    if (!waiting.length) return
    const timer = setTimeout(() => setWaiting([]), SHOW_WITHIN_MS)
    return () => clearTimeout(timer)
  }, [waiting])

  const held = calling.length > 0 || waiting.length > 0
  const start = useCallback(
    async (titles: string[], work: () => Promise<void>) => {
      if (held) return
      const keys = titles.length ? [...new Set(titles)] : [ANY]
      setCalling(keys)
      try {
        await work()
        setWaiting(keys)
      } catch (e) {
        report(e as Error)
      } finally {
        setCalling([])
      }
    },
    [held, report],
  )

  const starting = (title?: string) =>
    title === undefined ? held : calling.includes(title) || waiting.includes(title)
  return {
    starting,
    busy: (title) => starting(title) || Boolean(runningJob(jobs, kind, title)),
    start,
  }
}
