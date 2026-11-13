/**
 * Movement that CSS cannot time on its own: a sequence's turn-taking and a
 * number counting up. Both stand down when the person or the system asks for
 * less movement, which `preferences.ts` writes on the document as `data-motion`.
 */
import { type CSSProperties, useEffect, useRef, useState } from 'react'

const reducedMotion = (): boolean => document.documentElement.dataset.motion === 'reduced'

/** The turn of one part of a sequence: how long it waits before it moves, as `--delay`. */
export const after = (ms: number): CSSProperties => ({ '--delay': `${ms}ms` }) as CSSProperties

const easeOut = (t: number): number => 1 - (1 - t) ** 3

/**
 * A number that counts from `from` to `to` once, after `delay`. It is `to` at
 * once when movement is reduced.
 */
export function useCountUp(
  to: number,
  { from = 0, delay = 0, duration = 700 }: { from?: number; delay?: number; duration?: number },
): number {
  const [value, setValue] = useState(() => (reducedMotion() ? to : from))
  useEffect(() => {
    if (reducedMotion()) return
    let frame = 0
    const start = performance.now() + delay
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      setValue(Math.round(from + (to - from) * easeOut(t)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to, from, delay, duration])
  return value
}

/**
 * Whether what `key` names arrived after the view opened. What is there when a
 * view opens is at rest and plays no entrance; only a change someone can watch
 * does. True from the first change on.
 */
export function useArrived(key: string): boolean {
  const [seen, setSeen] = useState({ key, arrived: false })
  if (key !== seen.key) setSeen({ key, arrived: true })
  return seen.arrived
}

/**
 * Whether something the reader waited on in view has come: true once
 * `waiting` has been true and is false again. What was already there when the
 * view opened plays no entrance.
 */
export function useLanded(waiting: boolean): boolean {
  const [waited, setWaited] = useState(waiting)
  if (waiting && !waited) setWaited(true)
  return waited && !waiting
}

/**
 * How many items of a growing list were there before the reader could watch
 * it grow: those rest, and the ones after arrive. Null while the list is not
 * read yet. A list that shrinks, such as one cleared, starts again from what is left.
 */
export function useRested(count: number | null): number {
  const rested = useRef<number | null>(null)
  if (count !== null && (rested.current === null || count < rested.current)) rested.current = count
  return rested.current ?? 0
}

/**
 * Which items of a list came after the reader could watch it: those arrive,
 * and the ones there when the list was first read rest. By key, not by place,
 * so an item added at the top arrives as surely as one added at the end. A
 * list read empty rests until it first holds something.
 */
export function useArrivals(keys: readonly string[]): (key: string) => boolean {
  const rested = useRef<Set<string> | null>(null)
  if (rested.current === null && keys.length) rested.current = new Set(keys)
  const seen = rested.current
  return (key) => seen !== null && !seen.has(key)
}

/** How long a view takes to leave before the next one comes in: quicker than any arrival. */
const LEAVE_MS = 140

/**
 * One view swapped for another. The old one leaves first, quickly and
 * quietly; `leaving` is true while it does. With movement reduced the swap is
 * immediate.
 */
export function useSwap<T>(initial: T): { view: T; leaving: boolean; swap: (next: T) => void } {
  const [state, setState] = useState({ view: initial, leaving: false })
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const swap = (next: T) => {
    clearTimeout(timer.current)
    if (reducedMotion()) {
      setState({ view: next, leaving: false })
      return
    }
    setState((current) => ({ ...current, leaving: true }))
    timer.current = setTimeout(() => setState({ view: next, leaving: false }), LEAVE_MS)
  }
  return { ...state, swap }
}
