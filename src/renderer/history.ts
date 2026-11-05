/**
 * The route, read from the window's history and written to it. Every step to a
 * new place adds an entry, so Back and Forward retrace them: the buttons in the
 * top bar, the View menu and its shortcuts in the desktop app, the browser's
 * own in a browser.
 */
import { type RefObject, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { currentSkill } from './api.ts'
import { type Entry, entryOf, hashOf, placeOf, type Route } from './route.ts'

/** Where the newest position is kept, so a reload still knows how far Forward reaches. */
const LAST_KEY = 'skill-studio.history.last'

const written = entryOf(window.history.state)
let entry: Entry = written ?? { index: 0, skill: currentSkill() }
let last = written
  ? Math.max(written.index, Number(sessionStorage.getItem(LAST_KEY)) || 0)
  : entry.index
if (!written) window.history.replaceState(entry, '')

const read = (arrival: Route['arrival']): Route => ({
  ...placeOf(window.location.hash),
  ...entry,
  last,
  arrival,
})

let route = read('step')
const listeners = new Set<() => void>()
const publish = (arrival: Route['arrival']) => {
  route = read(arrival)
  for (const listener of listeners) listener()
}

/** A new entry is now the newest: whatever lay ahead of it is gone. */
const reach = (index: number) => {
  last = index
  sessionStorage.setItem(LAST_KEY, String(index))
}

window.addEventListener('popstate', (event) => {
  const found = entryOf(event.state)
  if (found) {
    entry = found
    publish('return')
    return
  }
  // A hash the app did not write, typed or linked: a new entry, marked like the rest.
  entry = { index: entry.index + 1, skill: currentSkill() }
  window.history.replaceState(entry, '')
  reach(entry.index)
  publish('step')
})

export interface NavigateOptions {
  /**
   * Take the place of the current entry instead of adding one. For a step that
   * is not somewhere to come back to: the form of a case just saved, the page
   * of a file just deleted.
   */
  replace?: boolean
  /** The skill the place is seen in, when it is not the open one yet. */
  skill?: string
}

/** Go to a screen. Anything in the page may call it; the route follows. */
export function navigate(
  screen: string,
  params: Record<string, string> = {},
  { replace = false, skill = currentSkill() }: NavigateOptions = {},
): void {
  const hash = hashOf(screen, params)
  // Going where the reader already is leaves nothing new to go back through.
  if (hash === window.location.hash && skill === entry.skill) return
  entry = { index: replace ? entry.index : entry.index + 1, skill }
  if (replace) window.history.replaceState(entry, '', hash)
  else {
    window.history.pushState(entry, '', hash)
    reach(entry.index)
  }
  publish('step')
}

export const back = (): void => window.history.back()
export const forward = (): void => window.history.forward()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useRoute(): [Route, typeof navigate] {
  return [useSyncExternalStore(subscribe, () => route), navigate]
}

/** What the reader does to take the scroll back while a screen is still settling. */
const TAKEOVER = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
/** How long to wait for a returning screen to load enough to scroll to its place: about 1.5s. */
const SETTLE_FRAMES = 90

/**
 * The pane's scroll, kept per history entry. A new screen starts at its top;
 * Back and Forward land where the reader left off, once the screen has loaded
 * enough to scroll that far. `screen` is the one shown, which `home` resolves to.
 */
export function usePaneScroll(route: Route, screen: string): RefObject<HTMLElement | null> {
  const pane = useRef<HTMLElement>(null)
  const tops = useRef(new Map<number, number>())
  const here = useRef({ index: route.index, screen })
  /** A return is waiting for its screen to grow: the clamped scroll is not the reader's. */
  const settling = useRef(false)

  useEffect(() => {
    const el = pane.current
    if (!el) return
    const keep = () => {
      if (!settling.current) tops.current.set(here.current.index, el.scrollTop)
    }
    el.addEventListener('scroll', keep, { passive: true })
    return () => el.removeEventListener('scroll', keep)
  }, [])

  useLayoutEffect(() => {
    const el = pane.current
    const from = here.current
    here.current = { index: route.index, screen }
    if (!el) return
    if (route.arrival === 'step' && from.screen === screen) {
      // The same screen with another choice: it stays where it is.
      tops.current.set(route.index, el.scrollTop)
      return
    }
    const top = route.arrival === 'return' ? (tops.current.get(route.index) ?? 0) : 0
    el.scrollTop = top
    if (el.scrollTop >= top - 1) return
    // The screen is still loading: try again as it grows, until the reader takes over.
    settling.current = true
    let frames = SETTLE_FRAMES
    let frame = 0
    const stop = () => {
      settling.current = false
      cancelAnimationFrame(frame)
      for (const type of TAKEOVER) el.removeEventListener(type, stop)
    }
    const retry = () => {
      el.scrollTop = top
      frames -= 1
      if (el.scrollTop >= top - 1 || frames <= 0) stop()
      else frame = requestAnimationFrame(retry)
    }
    for (const type of TAKEOVER) el.addEventListener(type, stop, { passive: true })
    frame = requestAnimationFrame(retry)
    return stop
  }, [route, screen])

  return pane
}
