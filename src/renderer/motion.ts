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
