/**
 * Movement that CSS cannot time on its own: a sequence's turn-taking and a
 * number counting up. Both stand down when the person or the system asks for
 * less movement, which `preferences.ts` writes on the document as `data-motion`.
 */
import { type CSSProperties, useEffect, useRef, useState } from 'react'

const reducedMotion = (): boolean => document.documentElement.dataset.motion === 'reduced'

/** The turn of one part of a sequence: how long it waits before it moves, as `--delay`. */
export const after = (ms: number): CSSProperties => ({ '--delay': `${ms}ms` }) as CSSProperties

/**
 * The turn of a part of what the assistant handed over, settling into its
 * sheet (`animate-settle`): the first a beat after the sheet takes it, each
 * next 45ms after the one above, so they come top to bottom.
 */
export const settleTurn = (turn: number): CSSProperties => after(30 + turn * 45)

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
 * Whether `value` changed while the reader could watch it, about the same
 * `subject`: a line that changes under them, such as a skill's standing once
 * its file is saved. One that comes with another subject, or that was still
 * being read (`settled` false), is at rest. Give the element `key={value}`,
 * so each change plays.
 */
export function useChangedInPlace(
  subject: string | null,
  value: string,
  settled: boolean,
): boolean {
  const [seen, setSeen] = useState({ subject, value, settled, changed: false })
  if (subject !== seen.subject || value !== seen.value || settled !== seen.settled)
    setSeen({
      subject,
      value,
      settled,
      changed: settled && seen.settled && subject === seen.subject && value !== seen.value,
    })
  return seen.changed
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

/** How long a block takes to fold away (`animate-fold`): it stays on screen that long. */
const FOLD_MS = 180

/** How long a block takes to unfold and come to rest (`animate-unfold`, on `ease-spring-settle`). */
export const UNFOLD_MS = 750

/** One item of a list as `usePresence` shows it: on its way in, at rest, or on its way out. */
export interface Present<T> {
  item: T
  key: string
  /** It came in the list's last change, which the reader could watch: it unfolds in. */
  arrived: boolean
  /** It is gone from the list and folds away, in the place it had. */
  leaving: boolean
}

/**
 * A list as it is drawn while items come and go: one that left stays, in the
 * place it had, for `FOLD_MS` while it folds away, and one that came in the
 * last change arrives. What the list held when it was first drawn rests, and
 * so does all it holds when it is first filled from nothing, as a list read
 * from the backend is. One that comes back while it leaves stops leaving.
 * With movement reduced nothing stays behind.
 */
export function usePresence<T>(items: readonly T[], keyOf: (item: T) => string): Present<T>[] {
  const signature = items.map(keyOf).join('\n')
  const [state, setState] = useState<PresenceState<T>>(() => ({
    signature,
    items,
    fresh: new Set(),
    leaving: [],
  }))
  if (state.signature !== signature) setState(nextPresence(state, items, keyOf, reducedMotion()))
  const leavingKeys = state.leaving.map((entry) => entry.key).join('\n')
  useEffect(() => {
    if (!leavingKeys) return
    const timer = setTimeout(() => setState((was) => ({ ...was, leaving: [] })), FOLD_MS)
    return () => clearTimeout(timer)
  }, [leavingKeys])
  return drawnList(state, items, keyOf)
}

/** What `usePresence` keeps between renders: the list as last drawn, what came in its last change, and what is leaving. */
export interface PresenceState<T> {
  signature: string
  items: readonly T[]
  fresh: ReadonlySet<string>
  leaving: ReadonlyArray<{ item: T; key: string; index: number }>
}

/**
 * The state once the list changed to `items`: what came is fresh, unless the
 * list was empty (filled from nothing, it is read, not changed); what went
 * leaves from the place it had, unless movement is reduced; what came back
 * stops leaving.
 */
export function nextPresence<T>(
  state: PresenceState<T>,
  items: readonly T[],
  keyOf: (item: T) => string,
  reduced: boolean,
): PresenceState<T> {
  const keys = items.map(keyOf)
  const before = new Set(state.items.map(keyOf))
  const now = new Set(keys)
  const gone = state.items
    .map((item, index) => ({ item, key: keyOf(item), index }))
    .filter((entry) => !now.has(entry.key))
  return {
    signature: keys.join('\n'),
    items,
    fresh: before.size ? new Set(keys.filter((key) => !before.has(key))) : new Set(),
    leaving: reduced ? [] : [...state.leaving.filter((entry) => !now.has(entry.key)), ...gone],
  }
}

/** The list to draw: `items`, with each one leaving put back in the place it had. */
export function drawnList<T>(
  state: PresenceState<T>,
  items: readonly T[],
  keyOf: (item: T) => string,
): Present<T>[] {
  const shown: Present<T>[] = items.map((item) => {
    const key = keyOf(item)
    return { item, key, arrived: state.fresh.has(key), leaving: false }
  })
  for (const entry of [...state.leaving].sort((a, b) => a.index - b.index))
    shown.splice(Math.min(entry.index, shown.length), 0, {
      item: entry.item,
      key: entry.key,
      arrived: false,
      leaving: true,
    })
  return shown
}

/**
 * Whether something that comes and goes is drawn: it stays for `FOLD_MS`
 * after it is gone, so it can fold away. With movement reduced it goes at once.
 */
export function useStaying(present: boolean): boolean {
  const [staying, setStaying] = useState(present)
  if (present && !staying) setStaying(true)
  useEffect(() => {
    if (present || !staying) return
    if (reducedMotion()) {
      setStaying(false)
      return
    }
    const timer = setTimeout(() => setStaying(false), FOLD_MS)
    return () => clearTimeout(timer)
  }, [present, staying])
  return present || staying
}
