/**
 * The app's jobs, followed for as long as the window is open: pushed by the
 * desktop app, polled in a browser (quickly while one runs). The open skill is
 * read again when a job finishes, including one that started and ended between
 * two polls (a Jev vote takes under a second), and as a run of the open skill
 * writes each output, so Results shows them as they land.
 */
import { useEffect, useState } from 'react'
import { api, currentSkill, type Job } from './api.ts'

/** The least time between two reloads made for a run's progress: each output lands within this of being written. */
const PROGRESS_RELOAD_MS = 2000

export function useJobs(reload: () => Promise<void>): Job[] {
  const [jobs, setJobs] = useState<Job[]>([])
  useEffect(() => {
    let finished: Set<number> | null = null
    /** How far each running job had come when state was last read for it. */
    const progressed = new Map<number, number>()
    let progressReloadAt = 0
    let progressTimer: ReturnType<typeof setTimeout> | undefined
    /** Reload for progress at most once every two seconds; a reload for an end resets the wait. */
    const reloadForProgress = () => {
      const wait = progressReloadAt + PROGRESS_RELOAD_MS - Date.now()
      if (wait <= 0) {
        progressReloadAt = Date.now()
        void reload()
      } else if (progressTimer === undefined)
        progressTimer = setTimeout(() => {
          progressTimer = undefined
          progressReloadAt = Date.now()
          void reload()
        }, wait)
    }
    const take = (list: Job[]) => {
      setJobs(list)
      const done = new Set(list.filter((j) => j.status !== 'running').map((j) => j.id))
      if (finished && [...done].some((id) => !finished?.has(id))) {
        progressReloadAt = Date.now()
        void reload()
      }
      finished = done
      const skill = currentSkill()
      let advanced = false
      for (const job of list) {
        if (job.status !== 'running') {
          // Its count is no use once it is over: the map holds running jobs only.
          progressed.delete(job.id)
          continue
        }
        if (job.kind !== 'generate' || job.skillPath !== skill) continue
        const before = progressed.get(job.id) ?? 0
        const now = job.progress?.done ?? 0
        if (now > before) {
          progressed.set(job.id, now)
          advanced = true
        }
      }
      if (advanced) reloadForProgress()
    }
    let live = true
    /** A push has arrived: the first read, asked for before it and answered after, is older. */
    let pushed = false
    const stop = api.watchJobs
      ? api.watchJobs((list) => {
          pushed = true
          take(list)
        })
      : null
    if (stop)
      api.jobs().then(
        (list) => {
          if (live && !pushed) take(list)
        },
        () => {},
      )
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const list = await api.jobs()
        if (!live) return
        take(list)
        const running = list.some((j) => j.status === 'running')
        timer = setTimeout(tick, running ? 1500 : 3000)
      } catch {
        if (live) timer = setTimeout(tick, 8000)
      }
    }
    if (!stop) void tick()
    return () => {
      live = false
      stop?.()
      clearTimeout(timer)
      clearTimeout(progressTimer)
    }
  }, [reload])
  return jobs
}
