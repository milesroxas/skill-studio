import { useCallback, useEffect, useState } from 'react'

/**
 * A value fetched once per `deps`, with its error. The last value stays in
 * view while the next one loads, so a refresh never flashes; a success clears
 * an earlier error.
 */
export function useFetch<T>(
  load: () => Promise<T>,
  deps: unknown[],
): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps come from the caller
  useEffect(() => {
    let live = true
    load().then(
      (value) => {
        if (!live) return
        setData(value)
        setError(null)
      },
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [...deps, tick])
  return { data, error, reload: () => setTick((t) => t + 1) }
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

export interface ToastState {
  message: string
  /** Takes back the step the message reports. The toast then offers Undo. */
  undo?: () => void
}

export type ShowToast = (message: string, undo?: () => void) => void

/** With Undo on offer, long enough to notice the slip and reach for it. */
const UNDO_MS = 7000

/** Long enough to read: a floor for short lines, then about 200 words a minute. */
const toastMs = ({ message, undo }: ToastState): number =>
  Math.max(undo ? UNDO_MS : 2600, message.split(/\s+/).length * 300 + 1000)

/** The toast in view, a way to show one, and a way to put it away early. */
export function useToast(): [ToastState | null, ShowToast, () => void] {
  const [toast, setToast] = useState<ToastState | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), toastMs(toast))
    return () => clearTimeout(timer)
  }, [toast])
  const show = useCallback<ShowToast>((message, undo) => setToast({ message, undo }), [])
  const dismiss = useCallback(() => setToast(null), [])
  return [toast, show, dismiss]
}
