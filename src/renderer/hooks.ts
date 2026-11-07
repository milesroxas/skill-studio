import { useCallback, useEffect, useState } from 'react'

/**
 * A value fetched once per `deps`, with its error. The last value stays in
 * view while the next one loads, so a refresh never flashes; a success clears
 * an earlier error.
 */
export function useFetch<T>(
  load: () => Promise<T>,
  deps: unknown[],
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** A load is on its way, from the first one to any reload: a Try again button stays busy meanwhile. */
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps come from the caller
  useEffect(() => {
    let live = true
    setLoading(true)
    load().then(
      (value) => {
        if (!live) return
        setData(value)
        setError(null)
        setLoading(false)
      },
      (e: Error) => {
        if (!live) return
        setError(e.message)
        setLoading(false)
      },
    )
    return () => {
      live = false
    }
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

/** A set and a toggle for one member, for checkbox and filter groups. */
export function useToggleSet<T>(initial: Iterable<T>): [Set<T>, (value: T) => void] {
  const [set, setSet] = useState(() => new Set(initial))
  const toggle = (value: T) =>
    setSet((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  return [set, toggle]
}

/** What the status line says about a step that just finished or failed, and what it offers beside it. */
export interface Notice {
  message: string
  /**
   * `destructive`: the step failed. `warning`: the reader must change something
   * before it can be taken. Otherwise the plain dot: a notice is a fact, not a
   * verdict.
   */
  tone?: 'warning' | 'destructive'
  /** Takes back the step the message reports. The line then offers Undo. One offer at most: a notice is one line. */
  undo?: () => void
  /** One step that follows from the message, such as opening what it announces. */
  action?: { label: string; run: () => void }
}

/** Say what just happened. An Error reports as a failure; a string takes the tone it is given. */
export type Reporter = (message: string | Error, more?: Omit<Notice, 'message'>) => void

/** With a button on offer, long enough to notice it and reach for it. */
const OFFER_MS = 7000

/** Long enough to read: a floor for short lines, then about 200 words a minute. */
const noticeMs = ({ message, undo, action }: Notice): number =>
  Math.max(undo || action ? OFFER_MS : 2600, message.split(/\s+/).length * 300 + 1000)

/** The notice on the status line, a way to report one, and a way to clear it early. */
export function useNotice(): [Notice | null, Reporter, () => void] {
  const [notice, setNotice] = useState<Notice | null>(null)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), noticeMs(notice))
    return () => clearTimeout(timer)
  }, [notice])
  const report = useCallback<Reporter>(
    (message, more) =>
      setNotice(
        typeof message === 'string'
          ? { message, ...more }
          : { message: message.message, tone: 'destructive', ...more },
      ),
    [],
  )
  const dismiss = useCallback(() => setNotice(null), [])
  return [notice, report, dismiss]
}
