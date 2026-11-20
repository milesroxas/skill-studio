import { describe, expect, it } from 'vitest'
import {
  BACK,
  FOLD_PULL,
  landing,
  look,
  type Motion,
  PANELS,
  progressOn,
  releaseSpeed,
  rubber,
  stepSpring,
  stretched,
  THROW,
  TOGGLE,
} from './fold.ts'

const list = PANELS.list

/** Run a spring at 60 frames a second; the frame it rests on, and every width on the way. */
function run(m: Motion, spring = TOGGLE): { frames: number; xs: number[] } {
  const xs: number[] = []
  for (let frame = 1; frame <= 120; frame++) {
    const done = stepSpring(m, spring, 1 / 60)
    xs.push(m.x)
    if (done) return { frames: frame, xs }
  }
  return { frames: Number.POSITIVE_INFINITY, xs }
}

describe('the spring', () => {
  it('opens a panel from its strip by a click in about a third of a second, never past its width', () => {
    const { frames, xs } = run({ x: list.rail, v: 0, target: list.def })
    expect(frames * (1000 / 60)).toBeLessThan(400)
    expect(Math.max(...xs)).toBeLessThanOrEqual(list.def)
    // 90% of the way within about 170ms.
    const near = xs.findIndex((x) => x >= list.rail + 0.9 * (list.def - list.rail))
    expect((near + 1) * (1000 / 60)).toBeLessThan(200)
  })

  it('lets a fast throw overshoot a few pixels and settle', () => {
    const { frames, xs } = run({ x: 300, v: 1500, target: 360 }, THROW)
    expect(Math.max(...xs)).toBeGreaterThan(360)
    expect(Math.max(...xs)).toBeLessThan(380)
    expect(frames).toBeLessThan(40)
  })

  it('comes back from a stretch with more snap than a throw', () => {
    expect(BACK.k).toBeGreaterThan(THROW.k)
    expect(run({ x: list.min - 40, v: 0, target: list.min }, BACK).frames).toBeLessThan(30)
  })

  it('lands exactly on its target', () => {
    const m = { x: 48, v: 0, target: 260 }
    run(m)
    expect(m.x).toBe(260)
    expect(m.v).toBe(0)
  })
})

describe('the hand', () => {
  it('has no speed when it paused before letting go', () => {
    const samples = [
      { t: 0, raw: 200 },
      { t: 16, raw: 240 },
      { t: 200, raw: 240 },
    ]
    expect(releaseSpeed(samples, 200)).toBe(0)
  })

  it('reads its speed over the last 80ms', () => {
    const samples = [
      { t: 0, raw: 100 },
      { t: 100, raw: 200 },
      { t: 140, raw: 240 },
    ]
    expect(releaseSpeed(samples, 140)).toBeCloseTo(1, 5)
  })

  it('stretches past a limit, never further than the give', () => {
    expect(stretched(list, 300, 420)).toBe(300)
    expect(stretched(list, list.min - 1000, 420)).toBeGreaterThan(list.min - 140)
    expect(stretched(list, 500, 420)).toBeLessThan(500)
    expect(rubber(0)).toBe(0)
  })
})

describe('where a release lands', () => {
  const open = { wasOpen: true, room: 420, pulledShut: false }

  it('lands a slow drop where it was let go', () => {
    expect(landing(list, { ...open, raw: 330, shown: 330, v: 0 })).toEqual({
      open: true,
      width: 330,
      spring: THROW,
    })
  })

  it('snaps a drop near the first width onto it', () => {
    const to = landing(list, { ...open, raw: 270, shown: 270, v: 0 })
    expect(to).toMatchObject({ open: true, width: list.def })
  })

  it('carries a throw on, to the widest the window allows', () => {
    expect(landing(list, { ...open, raw: 330, shown: 330, v: 2 })).toMatchObject({ width: 420 })
  })

  it('folds a panel pulled past the point that folds, or flicked shut', () => {
    expect(landing(list, { ...open, raw: 100, shown: 150, v: 0, pulledShut: true }).open).toBe(
      false,
    )
    expect(landing(list, { ...open, raw: 230, shown: 230, v: -1 }).open).toBe(false)
    expect(landing(list, { ...open, raw: list.min - FOLD_PULL + 10, shown: 190, v: 0 })).toEqual({
      open: true,
      width: list.min,
      spring: BACK,
    })
  })

  it('opens a panel pulled out of its strip most of the way, or flung', () => {
    const rail = { wasOpen: false, room: 420, pulledShut: false }
    expect(landing(list, { ...rail, raw: 120, shown: 120, v: 0 }).open).toBe(false)
    expect(landing(list, { ...rail, raw: 150, shown: 150, v: 0 })).toMatchObject({
      open: true,
      width: list.min,
    })
    expect(landing(list, { ...rail, raw: 90, shown: 90, v: 0.8 }).open).toBe(true)
  })
})

describe('the choreography', () => {
  it('runs straight along a track and holds its end through an overshoot', () => {
    const track = { w0: 48, t0: 0, wT: 260, tT: 1 }
    expect(progressOn(track, true, 154)).toBeCloseTo(0.5, 5)
    expect(progressOn(track, true, 270)).toBe(1)
    expect(progressOn(null, false, 48)).toBe(0)
    expect(progressOn(null, true, 300)).toBe(1)
  })

  it('rests open with nothing over the contents, and folded with only the strip', () => {
    const open = look(list, 1, 260, false)
    expect(open).toMatchObject({ rail: 0, content: 1, contentScale: 1, ground: 1, icons: 0 })
    const folded = look(list, 0, list.rail, false)
    expect(folded).toMatchObject({ rail: 1, content: 0, ground: 0, icons: 1, frosted: false })
    expect(folded.solid).toBe(100)
  })

  it('frosts the strip while the panel passes under it', () => {
    const mid = look(list, 0.3, 150, false)
    expect(mid.frosted).toBe(true)
    expect(mid.solid).toBe(70)
  })

  it('sends the strip icons toward the panel as it opens', () => {
    expect(look(PANELS.sidebar, 0.2, 100, false).iconShift).toBeGreaterThan(0)
    expect(look(PANELS.assistant, 0.2, 100, false).iconShift).toBeLessThan(0)
  })

  it('previews a fold while the hand pulls an open panel past its narrowest', () => {
    const pulled = look(list, 1, list.min - rubber(FOLD_PULL), true)
    expect(pulled.rail).toBeCloseTo(1, 5)
    expect(pulled.content).toBeCloseTo(0.5, 5)
    expect(look(list, 1, list.min, true).rail).toBe(0)
  })

  it('changes no layer by more than half its range in one frame of a click', () => {
    const m = { x: list.rail, v: 0, target: list.def }
    const track = { w0: list.rail, t0: 0, wT: list.def, tT: 1 }
    let before = look(list, 0, list.rail, false)
    for (let frame = 0; frame < 60; frame++) {
      const done = stepSpring(m, TOGGLE, 1 / 60)
      const now = look(list, progressOn(track, true, m.x), m.x, false)
      for (const key of ['rail', 'content', 'ground'] as const)
        expect(Math.abs(now[key] - before[key])).toBeLessThan(0.65)
      before = now
      if (done) break
    }
  })
})
