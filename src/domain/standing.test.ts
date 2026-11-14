import { describe, expect, it } from 'vitest'
import { byNeed, caseLift, standingOf, type Try } from './standing.ts'

const at = (version: string, score: number | null, over: Partial<Try> = {}): Try => ({
  version,
  configuration: 'with_skill',
  writer: 'claude:sonnet',
  createdAt: `2026-11-${String(Number(version.slice(1)) + 1).padStart(2, '0')}T10:00:00Z`,
  graded: 'jev',
  score,
  ...over,
})
const bare = (score: number | null, createdAt = '2026-11-01T09:00:00Z'): Try =>
  at('v0', score, { configuration: 'without_skill', createdAt })

describe('standingOf', () => {
  it('reads a case against its own runs: its latest score, the one before, and its first', () => {
    const standing = standingOf([at('v2', 79), at('v0', 70), at('v1', 87)], 'v2')
    expect(standing.tries.map((t) => t.version)).toEqual(['v0', 'v1', 'v2'])
    expect([standing.first?.score, standing.previous?.score, standing.latest?.score]).toEqual([
      70, 87, 79,
    ])
    expect(standing).toMatchObject({ change: -8, current: true })
  })

  it('is not current when the case has not run on the version asked about', () => {
    const standing = standingOf([at('v0', 70), at('v5', 91)], 'v9')
    expect(standing.latest?.version).toBe('v5')
    expect(standing).toMatchObject({ change: 21, current: false })
  })

  it('has nothing to move from after one run', () => {
    expect(standingOf([at('v3', 80)], 'v3')).toMatchObject({
      previous: null,
      change: null,
      current: true,
    })
  })

  it('passes over a run with no score, such as one that was stopped', () => {
    const standing = standingOf([at('v1', 80), at('v2', null)], 'v2')
    expect(standing.tries).toHaveLength(2)
    expect(standing.latest?.version).toBe('v1')
    expect(standing.current).toBe(false)
  })

  it('stands on the version asked about when a later one also ran, as after a restore', () => {
    const standing = standingOf([at('v1', 60), at('v3', 85), at('v9', 40)], 'v3')
    expect(standing.latest?.version).toBe('v3')
    expect(standing.previous?.version).toBe('v1')
    expect(standing.current).toBe(true)
  })

  it('counts a run on an earlier version’s copy as that version, whenever it ran', () => {
    const old = at('v1', 60, { configuration: 'old_skill', createdAt: '2026-11-20T10:00:00Z' })
    const standing = standingOf([at('v2', 90), old], 'v2')
    expect(standing.latest?.version).toBe('v2')
    expect(standing.first).toBe(old)
    expect(standing.change).toBe(30)
  })

  it('reads a move against the same writer’s run before, past another writer’s in between', () => {
    const haiku = at('v1', 95, { writer: 'claude:haiku', createdAt: '2026-11-02T05:00:00Z' })
    const standing = standingOf([at('v0', 84), haiku, at('v1', 95)], 'v1')
    expect(standing.previous?.version).toBe('v0')
    expect(standing.change).toBe(11)
  })

  it('reads two runs of one version in the order they ran', () => {
    const early = at('v2', 70, { createdAt: '2026-11-03T10:00:00Z' })
    const late = at('v2', 75, { createdAt: '2026-11-03T18:00:00Z', writer: 'claude:opus' })
    expect(standingOf([late, early], 'v2')).toMatchObject({ latest: late, previous: early })
  })

  it('keeps a run without the skill as the floor, never as a run of the skill', () => {
    const standing = standingOf([bare(55), bare(62, '2026-11-02T09:00:00Z'), at('v1', 80)], 'v1')
    expect(standing.tries).toHaveLength(1)
    expect(standing.floor?.score).toBe(62)
    const only = standingOf([bare(55)], 'v0')
    expect(only).toMatchObject({ latest: null, first: null, current: false, change: null })
    expect(only.floor?.score).toBe(55)
  })

  it('reads a move only between runs graded the same way', () => {
    const plain = at('v0', 40, { graded: 'plain' })
    const standing = standingOf([plain, at('v1', 70), at('v2', 90)], 'v2')
    expect(standing.first?.version).toBe('v1')
    expect(standing.change).toBe(20)
    // With nothing graded as the latest was, it has no move, and is still not the first run.
    const alone = standingOf([plain, at('v1', 70)], 'v1')
    expect(alone).toMatchObject({ previous: null, change: null, apart: true })
    expect(alone.first).toBe(alone.latest)
    expect(standingOf([at('v1', 70)], 'v1').apart).toBe(false)
  })

  it('takes the floor from a run without the skill graded as the latest was', () => {
    const plain = { ...bare(30, '2026-11-09T09:00:00Z'), graded: 'plain' }
    expect(standingOf([bare(55), plain, at('v1', 80)], 'v1').floor?.score).toBe(55)
    expect(standingOf([plain, at('v1', 80)], 'v1').floor).toBeNull()
    // With no run of the skill to be set against, any floor stands.
    expect(standingOf([plain], 'v1').floor?.score).toBe(30)
  })

  it('has no standing for a case never run', () => {
    expect(standingOf([], 'v1')).toMatchObject({ tries: [], latest: null, floor: null })
  })
})

describe('caseLift', () => {
  it('sets each case’s first score against its latest, over the cases that ran more than once', () => {
    const lift = caseLift([
      standingOf([at('v0', 60), at('v4', 80)], 'v4'),
      // Run on other versions than the first case: each is read against itself.
      standingOf([at('v2', 70), at('v3', 90)], 'v4'),
      // One run: nothing to move from, so it is in neither mean.
      standingOf([at('v4', 20)], 'v4'),
      standingOf([], 'v4'),
    ])
    expect(lift).toMatchObject({ first: 65, latest: 85, cases: 2, rises: true, mixed: false })
  })

  it('is null until one case has two scored runs', () => {
    expect(caseLift([standingOf([at('v0', 60)], 'v0'), standingOf([bare(50)], 'v0')])).toBeNull()
    expect(caseLift([standingOf([at('v0', 60), at('v1', null)], 'v1')])).toBeNull()
  })

  it('does not rise when the two means are shown as the same whole number', () => {
    const flat = caseLift([
      standingOf([at('v0', 66), at('v1', 67)], 'v1'),
      standingOf([at('v0', 67), at('v1', 67)], 'v1'),
      standingOf([at('v0', 67), at('v1', 67)], 'v1'),
    ])
    // 66.67 and 67 both read 67: a ribbon from 67 to 67 would show a rise the numbers deny.
    expect(flat?.latest).toBeGreaterThan(flat?.first ?? 100)
    expect(flat?.rises).toBe(false)
    expect(caseLift([standingOf([at('v0', 90), at('v1', 85)], 'v1')])?.rises).toBe(false)
  })

  it('reads the floor over the cases that ran without the skill, and says how many', () => {
    const lift = caseLift([
      standingOf([bare(50), at('v0', 60), at('v1', 80)], 'v1'),
      standingOf([at('v0', 70), at('v1', 90)], 'v1'),
    ])
    expect(lift).toMatchObject({ floor: 50, floorCases: 1, cases: 2 })
    expect(caseLift([standingOf([at('v0', 70), at('v1', 90)], 'v1')])).toMatchObject({
      floor: null,
      floorCases: 0,
    })
  })

  it('leaves out a case whose two runs were graded two ways', () => {
    expect(
      caseLift([standingOf([at('v0', 60, { graded: 'plain' }), at('v1', 80)], 'v1')]),
    ).toBeNull()
  })

  it('says when a case’s first and latest runs had different writers', () => {
    const lift = caseLift([
      standingOf([at('v0', 60), at('v1', 80, { writer: 'claude:opus' })], 'v1'),
    ])
    expect(lift?.mixed).toBe(true)
  })
})

describe('byNeed', () => {
  it('puts the biggest drop first, then the lowest score, and a case with no score last', () => {
    const dropped = standingOf([at('v0', 90), at('v1', 70)], 'v1')
    const low = standingOf([at('v1', 40)], 'v1')
    const fine = standingOf([at('v0', 80), at('v1', 95)], 'v1')
    const none = standingOf([], 'v1')
    expect([none, fine, low, dropped].sort(byNeed)).toEqual([dropped, low, fine, none])
  })
})
