/**
 * How a panel folds: its sizes, the spring that moves its width, where a
 * throw lands, and how every layer of it looks at a given width. Pure, so the
 * numbers that make it feel right are tested here; `panels.ts` drives the page.
 *
 * A panel is open at a width the person picked, or folded to a strip of icons
 * at its fixed side. Its width is the one thing that moves. Everything else
 * (the strip, its icons, the panel's contents and ground) is drawn from one
 * number, the fold progress `t`: 0 folded, 1 open. So whatever moves the width
 * moves every layer in step, through a drag, a throw, a spring and a reversal.
 */

export type PanelId = 'sidebar' | 'list' | 'files' | 'assistant'

/** Which side of the window a panel stands on: it folds toward that side. */
export type Side = 'start' | 'end'

export interface PanelSize {
  side: Side
  /** The narrowest open width. A drag past it stretches, and far enough past it folds. */
  min: number
  max: number
  /** The width it opens at first, and that a release near it snaps to. */
  def: number
  /** The folded strip's width. */
  rail: number
}

export const PANELS: Readonly<Record<PanelId, PanelSize>> = {
  sidebar: { side: 'start', min: 180, max: 320, def: 232, rail: 48 },
  list: { side: 'start', min: 200, max: 420, def: 260, rail: 48 },
  files: { side: 'start', min: 200, max: 420, def: 260, rail: 48 },
  assistant: { side: 'end', min: 300, max: 560, def: 360, rail: 48 },
}

/** The screen's own column never gets narrower than this from a drag. */
export const MAIN_MIN = 400

export const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)
const lerp = (a: number, b: number, x: number): number => a + (b - a) * x
/** A 0 to 1 window of a progress. */
const seg = (t: number, a: number, b: number): number => clamp((t - a) / (b - a), 0, 1)
/** Cubic ease-out: quick to answer, soft to land. */
const easeOut = (x: number): number => 1 - (1 - x) ** 3
/** Smoothstep: a crossfade with no corners. */
const smooth = (x: number): number => x * x * (3 - 2 * x)

/** Resistance past a limit: the further the hand goes, the less the edge follows, never past `d`. */
export const rubber = (x: number, d = 140): number => (1 - 1 / ((x * 0.55) / d + 1)) * d

/** How far past its narrowest the hand pulls an open panel before letting go folds it. */
export const FOLD_PULL = 72
/** How far the stretched edge gives for that pull. */
const FOLD_GIVE = rubber(FOLD_PULL)
/** A release this close to the first width lands on it, so the size most people want is easy to find again. */
const SNAP = 20

/** A spring's stiffness and damping ratio. */
export interface Spring {
  k: number
  zeta: number
}

/**
 * A click, a shortcut or the strip: critically damped, 90% of the way in
 * about 170ms and at rest by about 350ms.
 */
export const TOGGLE: Spring = { k: 625, zeta: 1 }
/** A release: a little under-damped, so a fast throw overshoots a few pixels and settles. */
export const THROW: Spring = { k: 500, zeta: 0.78 }
/** Out of the stretch past a limit: snappier, with a touch more give. */
export const BACK: Spring = { k: 700, zeta: 0.7 }

/** One moving width: where it is, how fast (px/s), and where it heads. */
export interface Motion {
  x: number
  v: number
  target: number
}

/**
 * Advance a spring by `dt` seconds, in steps of 1/240s so a dropped frame
 * never makes it unstable. Returns whether it has come to rest on its target.
 */
export function stepSpring(m: Motion, spring: Spring, dt: number): boolean {
  const c = 2 * spring.zeta * Math.sqrt(spring.k)
  for (let t = 0; t < dt; t += 1 / 240) {
    const h = Math.min(1 / 240, dt - t)
    m.v += (-spring.k * (m.x - m.target) - c * m.v) * h
    m.x += m.v * h
  }
  if (Math.abs(m.x - m.target) < 1 && Math.abs(m.v) < 20) {
    m.x = m.target
    m.v = 0
    return true
  }
  return false
}

/** An overshoot gives a few pixels, never a gap past the strip or a squeeze of the page. */
export const shownWidth = (size: PanelSize, x: number): number =>
  clamp(x, size.rail * 0.85, size.max + 40)

/** One sample of the hand: when (ms) and where its edge would be with no limits. */
export interface Sample {
  t: number
  raw: number
}

/**
 * The hand's speed when it let go, in px/ms (positive is wider), over the last
 * 80ms only: a hand that paused before letting go has no speed left. Below
 * 0.25px/ms it was placing, not throwing.
 */
export function releaseSpeed(samples: readonly Sample[], at: number): number {
  const recent = samples.filter((s) => at - s.t <= 80)
  const first = recent[0]
  const last = recent.at(-1)
  if (!first || !last || recent.length < 2) return 0
  const v = (last.raw - first.raw) / Math.max(8, last.t - first.t)
  return Math.abs(v) < 0.25 ? 0 : v
}

/** Where a release sends the panel: open at a width, or folded. */
export type Landing = { open: true; width: number; spring: Spring } | { open: false }

/**
 * Where letting go lands: where the throw would carry the edge, the release
 * point plus 150ms of the hand's speed. A quick flick shuts or opens the
 * panel, a slow drop lands where it was let go.
 *
 * `raw` is the edge with no limits; `shown` is where the edge is drawn, which
 * differs while it stretches past a limit; `room` is the widest the window
 * allows; `pulledShut` is whether the hand went past the point that folds.
 */
export function landing(
  size: PanelSize,
  {
    wasOpen,
    raw,
    shown,
    v,
    room,
    pulledShut,
  }: { wasOpen: boolean; raw: number; shown: number; v: number; room: number; pulledShut: boolean },
): Landing {
  const projected = raw + v * 150
  const snap = (w: number) => (Math.abs(w - size.def) < SNAP ? size.def : w)
  if (wasOpen) {
    if (pulledShut || projected < size.min - FOLD_PULL || (v < -0.5 && projected < size.min))
      return { open: false }
    const outside = shown < size.min || shown > room
    return {
      open: true,
      width: snap(clamp(projected, size.min, room)),
      spring: outside ? BACK : THROW,
    }
  }
  // Pulled out of the strip: it opens once the throw would carry it most of the way.
  if (projected < size.min * 0.7 && !(v > 0.5)) return { open: false }
  return { open: true, width: snap(clamp(projected, size.min, room)), spring: THROW }
}

/** The edge drawn for a hand at `raw` on an open panel: 1:1 inside the limits, stretching past them. */
export function stretched(size: PanelSize, raw: number, room: number): number {
  if (raw < size.min) return size.min - rubber(size.min - raw)
  if (raw > room) return room + rubber(raw - room, 80)
  return raw
}

/**
 * A motion's track: from width `w0` at progress `t0` to width `wT` at `tT`.
 * Progress runs straight along it as the width travels, so a release, a new
 * target or a reversal starts from exactly what is on screen, and progress
 * lands on 0 or 1 the moment the width does. An overshoot holds `tT`.
 */
export interface Track {
  w0: number
  t0: number
  wT: number
  tT: number
}

export function progressOn(track: Track | null, open: boolean, w: number): number {
  if (!track) return open ? 1 : 0
  const f = track.wT === track.w0 ? 1 : clamp((w - track.w0) / (track.wT - track.w0), 0, 1)
  return lerp(track.t0, track.tT, f)
}

/** Every layer of a panel at one moment. */
export interface Look {
  /** The strip: its opacity, and how solid its ground is (100% at rest, 70% as glass). */
  rail: number
  solid: number
  /** Whether the strip blurs what passes under it. */
  frosted: boolean
  /** The strip's icons: they leave toward the panel as it opens. */
  icons: number
  iconShift: number
  iconScale: number
  /** The panel's contents. */
  content: number
  contentScale: number
  /** The panel's own ground: the sidebar's ink. */
  ground: number
}

/**
 * The choreography, as `t` goes 0 to 1 (folding plays it backwards). Spring
 * time is for a click from rest: opening reaches t .35 at about 65ms and t .8
 * at about 120ms, then a long soft tail.
 *
 *   strip icons   leave   t 0 to .35   smoothstep; drift 6px toward the panel, scale to .92
 *   ground        in      t 0 to .40   smoothstep: the sidebar's corner turns ink
 *   strip         frosts  t 0 to .15   solid 100% to 70%, once there is panel under it
 *   contents      in      t .2 to .7   ease-out; scale .97 to 1 over the whole travel
 *   strip         lifts   t .35 to .8  smoothstep: gone before the tail, so the
 *                                      panel lands its last pixels unveiled
 *
 * `held` is the hand's pull past the narrowest width of an open panel: 0
 * there, 1 where letting go folds it. The glass gathers over the edge and the
 * contents draw back to half, so the pull shows where letting go leads.
 */
export function look(size: PanelSize, t: number, w: number, held: boolean): Look {
  const pull = held ? smooth(clamp((size.min - w) / FOLD_GIVE, 0, 1)) : 0
  const rail = Math.max(1 - smooth(seg(t, 0.35, 0.8)), pull)
  const leave = smooth(seg(t, 0, 0.35))
  const toward = size.side === 'start' ? 1 : -1
  return {
    rail,
    solid: lerp(100, 70, smooth(seg(t, 0, 0.15))),
    frosted: rail > 0 && t > 0,
    icons: 1 - leave,
    iconShift: toward * 6 * leave,
    iconScale: 1 - 0.08 * leave,
    content: easeOut(seg(t, 0.2, 0.7)) * (1 - 0.5 * pull),
    contentScale: 0.97 + 0.03 * easeOut(t),
    ground: smooth(seg(t, 0, 0.4)),
  }
}
