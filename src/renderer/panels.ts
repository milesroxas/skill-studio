/**
 * The panels that fold: the sidebar, the list beside a workbench (the cases,
 * or the Skill screen's files) and the assistant. Each is open at a width the
 * person dragged it to, or folded to a strip at its side. Both are remembered.
 *
 * React says whether a panel is open; this module moves it. A width changes
 * every frame of a drag or a spring, so it is written to the page here, as
 * custom properties and styles on the panel (`components/FoldPanel.tsx` lays
 * out the parts), and never goes through a render. `fold.ts` holds the
 * numbers. Nothing moves when movement is reduced or the window is hidden:
 * the panel lands at once.
 */
import { useSyncExternalStore } from 'react'
import { api } from './api.ts'
import {
  clamp,
  FOLD_PULL,
  landing,
  look,
  MAIN_MIN,
  type Motion,
  PANELS,
  type PanelId,
  progressOn,
  releaseSpeed,
  type Sample,
  type Spring,
  shownWidth,
  stepSpring,
  stretched,
  THROW,
  TOGGLE,
  type Track,
} from './fold.ts'
import { createStore, useStore } from './store.ts'

export type { PanelId } from './fold.ts'

export interface PanelState {
  open: boolean
  /** The width it opens at: the last one it was dragged to. */
  width: number
  /** It changed between open and folded and has not come to rest: its contents are still on screen. */
  moving: boolean
}

type Panels = Record<PanelId, PanelState>

const KEY = 'skill-studio.panels'
/** Where the assistant's open state was kept before every panel could fold. */
const OLD_ASSISTANT_KEY = 'skill-studio.assistant'

function load(): Panels {
  let saved: Partial<Record<PanelId, { open?: unknown; width?: unknown }>> = {}
  let assistantOpen = false
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}
    assistantOpen = localStorage.getItem(OLD_ASSISTANT_KEY) === 'open'
  } catch {
    // Storage that cannot be read leaves every panel as it starts.
  }
  const panel = (id: PanelId, open: boolean): PanelState => {
    const size = PANELS[id]
    const s = saved[id]
    return {
      open: typeof s?.open === 'boolean' ? s.open : open,
      width:
        typeof s?.width === 'number' && Number.isFinite(s.width)
          ? clamp(Math.round(s.width), size.min, size.max)
          : size.def,
      moving: false,
    }
  }
  return {
    sidebar: panel('sidebar', true),
    list: panel('list', true),
    files: panel('files', true),
    assistant: panel('assistant', assistantOpen),
  }
}

const store = createStore<Panels>(load())

function save(): void {
  const all = store.get()
  const kept = Object.fromEntries(
    Object.entries(all).map(([id, s]) => [id, { open: s.open, width: s.width }]),
  )
  try {
    localStorage.setItem(KEY, JSON.stringify(kept))
    localStorage.removeItem(OLD_ASSISTANT_KEY)
  } catch {
    // A full or blocked store keeps the panels as they are for this session.
  }
}

function patch(id: PanelId, next: Partial<PanelState>): void {
  const all = store.get()
  const cur = all[id]
  if (Object.entries(next).every(([k, v]) => cur[k as keyof PanelState] === v)) return
  store.set({ ...all, [id]: { ...cur, ...next } })
}

/** Where each panel starts to fold: below it the sidebar is a menu, the list stacks over the item, and the assistant lies over the page. */
const FROM: Record<PanelId, MediaQueryList> = (() => {
  const sm = window.matchMedia('(min-width: 40rem)')
  const lg = window.matchMedia('(min-width: 64rem)')
  return { sidebar: sm, list: lg, files: lg, assistant: lg }
})()

/** Whether the window is wide enough for this panel to stand beside the page and fold. */
export function useFoldActive(id: PanelId): boolean {
  const query = FROM[id]
  return useSyncExternalStore(
    (listener) => {
      query.addEventListener('change', listener)
      return () => query.removeEventListener('change', listener)
    },
    () => query.matches,
  )
}

export function usePanel(id: PanelId): PanelState {
  return useStore(store)[id]
}

const still = (): boolean =>
  document.documentElement.dataset.motion === 'reduced' || document.visibilityState !== 'visible'

/* ---------- A panel on the page ---------- */

interface Parts {
  panel: HTMLElement
  clip: HTMLElement
  inner: HTMLElement
  rail: HTMLElement
  handle: HTMLElement
  button: HTMLElement | null
}

interface Drag {
  x: number
  w0: number
  wasOpen: boolean
  moved: boolean
  samples: Sample[]
  room: number
  raw: number
  pulledShut: boolean
}

interface Live {
  id: PanelId
  parts: Parts
  /** The width on screen. */
  shown: number
  /** The open width it is at or heading to. */
  w: number
  open: boolean
  track: Track | null
  /** A hand holds it open: a pull past its narrowest shows where letting go leads. */
  held: boolean
  /** Pulled out of its strip by a hand that has not let go. */
  fromRail: boolean
  motion: (Motion & { spring: Spring; raf: number; last: number }) | null
  drag: Drag | null
}

const live = new Map<PanelId, Live>()
const isMac = api.platform === 'darwin'
/**
 * On a Mac the sidebar's fold button stands right of the window's buttons,
 * 76 to 108px in, over the top bar once the sidebar folds. The bar's first
 * button then starts 4px after it; the bar pulls that button 14px left, so its
 * padding is the rest. Elsewhere the button stays on the sidebar's ink.
 */
const SIDEBAR_BUTTON_END = 76 + 32
const SIDEBAR_CLEAR = isMac ? SIDEBAR_BUTTON_END + 4 + 14 : 0
const BAR_PADDING = 24

/** How much width this panel may take: what the window leaves after the others and the page's own column. */
function room(p: Live): number {
  const size = PANELS[p.id]
  let others = 0
  for (const q of live.values())
    if (q !== p && FROM[q.id].matches) others += q.open ? q.w : PANELS[q.id].rail
  return Math.max(size.min, Math.min(size.max, window.innerWidth - MAIN_MIN - others))
}

/** Draw one width: every frame of a drag or a spring comes through here. */
function draw(p: Live, w: number): void {
  const size = PANELS[p.id]
  const { panel, handle, button } = p.parts
  p.shown = w
  panel.style.setProperty('--fold-w', `${w}px`)
  const last = store.get()[p.id].width
  const inner = !p.open ? last : p.fromRail ? Math.max(last, size.min) : Math.max(p.w, size.min)
  panel.style.setProperty('--fold-inner-w', `${inner}px`)
  handle.setAttribute('aria-valuenow', String(Math.round(w)))
  if (p.id === 'sidebar') {
    document.documentElement.style.setProperty(
      '--fold-lead',
      `${Math.max(BAR_PADDING, SIDEBAR_CLEAR - w)}px`,
    )
    // The sidebar's fold button is on ink while the sidebar covers it, on the top bar once it folds past.
    if (button) {
      if (!isMac || w > SIDEBAR_BUTTON_END) button.dataset.surface = 'ink'
      else delete button.dataset.surface
    }
  }
  paint(p, w)
}

function paint(p: Live, w: number): void {
  const size = PANELS[p.id]
  const { clip, inner, rail } = p.parts
  const t = progressOn(p.track, p.open, w)
  const l = look(size, t, w, p.held)
  rail.style.opacity = l.rail.toFixed(3)
  rail.style.setProperty('--solid', `${l.solid.toFixed(1)}%`)
  rail.toggleAttribute('data-frosted', l.frosted)
  for (const kid of rail.children) {
    if (!(kid instanceof HTMLElement || kid instanceof SVGElement)) continue
    kid.style.opacity = l.icons.toFixed(3)
    kid.style.transform =
      l.icons < 1 ? `translateX(${l.iconShift.toFixed(2)}px) scale(${l.iconScale.toFixed(4)})` : ''
  }
  inner.style.opacity = l.content.toFixed(3)
  inner.style.transform = t < 1 ? `scale(${l.contentScale.toFixed(4)})` : ''
  clip.style.opacity = l.ground.toFixed(3)
}

/** Lay a new track from where the panel is now, so nothing jumps. */
function lay(p: Live, wT: number, tT: number): void {
  const w0 = p.shown
  p.track = { w0, t0: progressOn(p.track, p.open, w0), wT, tT }
}

function stopSpring(p: Live): void {
  if (p.motion) cancelAnimationFrame(p.motion.raf)
  p.motion = null
}

/** At rest a panel draws its resting look: the values its motion ends on, so nothing jumps. */
function settle(p: Live): void {
  p.held = false
  p.fromRail = false
  p.track = null
  delete p.parts.panel.dataset.tucking
  paint(p, p.shown)
  patch(p.id, { moving: false })
}

/**
 * Move the width by spring, from the speed it has (or `v0`, the hand's, in
 * px/s). Sent somewhere new mid-flight, it turns around with the speed it has.
 */
function springTo(p: Live, target: number, spring: Spring, v0?: number): void {
  lay(p, target, p.open ? 1 : 0)
  if (still() || !FROM[p.id].matches) {
    stopSpring(p)
    draw(p, target)
    settle(p)
    return
  }
  const size = PANELS[p.id]
  if (p.motion) {
    p.motion.target = target
    p.motion.spring = spring
    if (v0 !== undefined) p.motion.v = v0
    return
  }
  const m = { x: p.shown, v: v0 ?? 0, target, spring, raf: 0, last: performance.now() }
  p.motion = m
  const step = (now: number) => {
    const dt = Math.min(0.05, (now - m.last) / 1000)
    m.last = now
    const done = stepSpring(m, m.spring, dt)
    draw(p, done ? m.target : shownWidth(size, m.x))
    if (done) {
      p.motion = null
      settle(p)
      return
    }
    m.raf = requestAnimationFrame(step)
  }
  m.raf = requestAnimationFrame(step)
}

/** Open or fold by spring. A change of state tucks the contents under the strip. */
function move(p: Live, open: boolean, spring: Spring = TOGGLE, v0?: number): void {
  const size = PANELS[p.id]
  const changed = p.open !== open
  // Pin the progress where it is before the state flips, so the track starts from what is on screen.
  const t0 = progressOn(p.track, p.open, p.shown)
  p.track = { w0: p.shown, t0, wT: p.shown, tT: t0 }
  if (changed && !open) patch(p.id, { width: Math.round(clamp(p.w, size.min, size.max)) })
  if (changed && open) p.w = clamp(store.get()[p.id].width, size.min, room(p))
  p.open = open
  if (changed) {
    if (!still()) p.parts.panel.dataset.tucking = ''
    patch(p.id, { open, moving: true })
    save()
  }
  springTo(p, open ? p.w : size.rail, spring, v0)
}

/** Open or fold a panel. One not on the page now opens or folds where it next appears. */
export function setPanelOpen(id: PanelId, open: boolean): void {
  const p = live.get(id)
  if (p) move(p, open)
  else {
    patch(id, { open })
    save()
  }
}

export const togglePanel = (id: PanelId): void => setPanelOpen(id, !store.get()[id].open)

/* ---------- The hand ---------- */

const root = document.documentElement

function pointerDown(p: Live, e: PointerEvent): void {
  if (e.button !== 0) return
  e.preventDefault()
  p.parts.handle.setPointerCapture(e.pointerId)
  // Caught mid-spring: the hand takes it from exactly where it is.
  stopSpring(p)
  if (p.open) p.w = p.shown
  p.drag = {
    x: e.clientX,
    w0: p.shown,
    wasOpen: p.open,
    moved: false,
    samples: [{ t: e.timeStamp, raw: p.shown }],
    room: room(p),
    raw: p.shown,
    pulledShut: false,
  }
}

function pointerMove(p: Live, e: PointerEvent): void {
  const d = p.drag
  if (!d) return
  const size = PANELS[p.id]
  const dx = (e.clientX - d.x) * (size.side === 'start' ? 1 : -1)
  if (!d.moved) {
    if (Math.abs(dx) < 3) return
    d.moved = true
    p.parts.handle.dataset.dragging = ''
    root.dataset.resizing = ''
    p.held = d.wasOpen
    if (d.wasOpen) {
      // On an open panel the hand changes its size, not its state.
      lay(p, p.shown, 1)
    } else {
      // Out of its strip: it opens under the strip's glass, following the hand.
      p.fromRail = true
      lay(p, Math.max(store.get()[p.id].width, size.min), 1)
      p.open = true
      p.w = size.rail
      p.parts.panel.dataset.tucking = ''
      patch(p.id, { open: true, moving: true })
    }
  }
  const raw = d.w0 + dx
  d.raw = raw
  d.samples.push({ t: e.timeStamp, raw })
  while (d.samples.length > 2 && e.timeStamp - (d.samples[0]?.t ?? 0) > 80) d.samples.shift()
  if (!d.wasOpen) {
    p.w = clamp(raw, size.rail, d.room)
    draw(p, p.w)
    return
  }
  p.w = stretched(size, raw, d.room)
  d.pulledShut = size.min - raw > FOLD_PULL
  draw(p, p.w)
}

function pointerUp(p: Live, e: PointerEvent): void {
  const d = p.drag
  if (!d) return
  p.drag = null
  delete p.parts.handle.dataset.dragging
  delete root.dataset.resizing
  // A click on a folded panel's divider opens it, as its strip does.
  if (!d.moved) {
    if (!d.wasOpen) move(p, true)
    return
  }
  const size = PANELS[p.id]
  const v = releaseSpeed([...d.samples, { t: e.timeStamp, raw: d.raw }], e.timeStamp)
  // A stretched edge moved slower than the hand.
  const vs = (p.shown === p.w ? v : v * 0.5) * 1000
  const to = landing(size, {
    wasOpen: d.wasOpen,
    raw: d.raw,
    shown: p.shown,
    v,
    room: d.room,
    pulledShut: d.pulledShut,
  })
  if (!to.open) {
    if (d.wasOpen) {
      p.w = clamp(d.w0, size.min, size.max)
      move(p, false, THROW, Math.min(vs, 0))
    } else {
      p.open = false
      patch(p.id, { open: false })
      springTo(p, size.rail, THROW, Math.min(vs, 0))
    }
    return
  }
  p.w = to.width
  patch(p.id, { width: Math.round(to.width) })
  save()
  springTo(p, to.width, to.spring, d.wasOpen ? vs : Math.max(vs, 0))
}

function onKey(p: Live, e: KeyboardEvent): void {
  const size = PANELS[p.id]
  const start = size.side === 'start'
  const grow = e.key === (start ? 'ArrowRight' : 'ArrowLeft')
  const shrink = e.key === (start ? 'ArrowLeft' : 'ArrowRight')
  // A key lands at once: nothing animates on a keyboard step.
  const now = (w: number, open: boolean) => {
    stopSpring(p)
    const changed = p.open !== open
    p.open = open
    p.track = null
    if (open) p.w = w
    patch(p.id, { open, ...(open ? { width: Math.round(w) } : {}), moving: false })
    if (changed || open) save()
    draw(p, open ? w : size.rail)
    settle(p)
  }
  const last = () => clamp(store.get()[p.id].width, size.min, room(p))
  if (grow || shrink) {
    e.preventDefault()
    if (!p.open) {
      if (grow) now(last(), true)
      return
    }
    now(clamp(p.w + (grow ? 1 : -1) * (e.shiftKey ? 64 : 16), size.min, room(p)), true)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (p.open) {
      patch(p.id, { width: Math.round(p.w) })
      now(p.w, false)
    } else now(last(), true)
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault()
    now(e.key === 'Home' ? size.min : room(p), true)
  }
}

function onDoubleClick(p: Live): void {
  if (!p.open) return
  const size = PANELS[p.id]
  p.w = clamp(size.def, size.min, room(p))
  patch(p.id, { width: Math.round(p.w) })
  save()
  springTo(p, p.w, TOGGLE)
}

/** A folded panel's strip opens it, unless the click was on one of the strip's own buttons. */
function onRailClick(p: Live, e: MouseEvent): void {
  if (p.open || (e.target instanceof Element && e.target.closest('button'))) return
  move(p, true)
}

/* ---------- Attaching ---------- */

/**
 * Put a panel on the page: its parts are found under `panel` by their
 * `data-fold-*` names. Drawn before the first paint. Returns the way to take
 * it off, which brings a moving panel to rest.
 */
export function attachPanel(id: PanelId, panel: HTMLElement): () => void {
  const part = (name: string) => panel.querySelector<HTMLElement>(`:scope > [data-fold-${name}]`)
  const clip = part('clip')
  const inner = clip?.querySelector<HTMLElement>(':scope > [data-fold-inner]')
  const rail = part('rail')
  const handle = part('handle')
  if (!clip || !inner || !rail || !handle) return () => {}
  const state = store.get()[id]
  const size = PANELS[id]
  const p: Live = {
    id,
    parts: { panel, clip, inner, rail, handle, button: part('button') },
    shown: state.open ? state.width : size.rail,
    w: state.width,
    open: state.open,
    track: null,
    held: false,
    fromRail: false,
    motion: null,
    drag: null,
  }
  const down = (e: PointerEvent) => pointerDown(p, e)
  const moved = (e: PointerEvent) => pointerMove(p, e)
  const up = (e: PointerEvent) => pointerUp(p, e)
  const key = (e: KeyboardEvent) => onKey(p, e)
  const dbl = () => onDoubleClick(p)
  const railClick = (e: MouseEvent) => onRailClick(p, e)
  handle.addEventListener('pointerdown', down)
  handle.addEventListener('pointermove', moved)
  handle.addEventListener('pointerup', up)
  handle.addEventListener('pointercancel', up)
  handle.addEventListener('keydown', key)
  handle.addEventListener('dblclick', dbl)
  rail.addEventListener('click', railClick)
  live.set(id, p)
  draw(p, p.shown)
  settle(p)
  return () => {
    stopSpring(p)
    if (p.drag) delete root.dataset.resizing
    handle.removeEventListener('pointerdown', down)
    handle.removeEventListener('pointermove', moved)
    handle.removeEventListener('pointerup', up)
    handle.removeEventListener('pointercancel', up)
    handle.removeEventListener('keydown', key)
    handle.removeEventListener('dblclick', dbl)
    rail.removeEventListener('click', railClick)
    if (live.get(id) === p) live.delete(id)
    patch(id, { moving: false })
  }
}

/** The narrow window's layout changed under a panel: draw it again for the room it now has. */
for (const query of new Set(Object.values(FROM)))
  query.addEventListener('change', () => {
    for (const p of live.values()) draw(p, p.shown)
  })
