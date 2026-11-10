import { useCallback, useEffect, useRef, useState } from 'react'

const sameDeps = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]))

/**
 * A value fetched once per `deps`, with its error. While the same `deps` load
 * again (`reload`), the last value stays in view, so a refresh never flashes.
 * When `deps` change, the value and the error of the old ones are gone at
 * once: nothing read for one thing is ever shown for another.
 */
export function useFetch<T>(
  load: () => Promise<T>,
  deps: unknown[],
): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  /** What the last load to land said, and the deps it was made for. */
  const [held, setHeld] = useState<{
    deps: unknown[]
    data: T | null
    error: string | null
  } | null>(null)
  /** The deps and the reload whose load has landed: until they are these ones, a load is on its way. */
  const [landed, setLanded] = useState<{ deps: unknown[]; tick: number } | null>(null)
  const [tick, setTick] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps come from the caller
  useEffect(() => {
    let live = true
    load().then(
      (value) => {
        if (!live) return
        setHeld({ deps, data: value, error: null })
        setLanded({ deps, tick })
      },
      (e: Error) => {
        if (!live) return
        // The value read for these same deps stays; one read for others does not.
        setHeld((was) => ({
          deps,
          data: was && sameDeps(was.deps, deps) ? was.data : null,
          error: e.message,
        }))
        setLanded({ deps, tick })
      },
    )
    return () => {
      live = false
    }
  }, [...deps, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const mine = held && sameDeps(held.deps, deps) ? held : null
  const loading = !(landed && landed.tick === tick && sameDeps(landed.deps, deps))
  return { data: mine?.data ?? null, error: mine?.error ?? null, loading, reload }
}

/**
 * One awaited step behind a button: `busy` while it runs, and a failure said
 * on the status line. `run(work)` resolves true when the work finished; a
 * second call while the first runs does nothing and resolves false. `failed`
 * leads the failure's message, as in "Not saved: the disk is full".
 */
export function useAction(
  report: Reporter,
): [busy: boolean, run: (work: () => Promise<void>, failed?: string) => Promise<boolean>] {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const run = useCallback(
    async (work: () => Promise<void>, failed?: string): Promise<boolean> => {
      if (running.current) return false
      running.current = true
      setBusy(true)
      try {
        await work()
        return true
      } catch (e) {
        const error = e as Error
        if (failed) report(`${failed}: ${error.message}`, { tone: 'destructive' })
        else report(error)
        return false
      } finally {
        running.current = false
        setBusy(false)
      }
    },
    [report],
  )
  return [busy, run]
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
