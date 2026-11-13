import { describe, expect, it } from 'vitest'
import {
  type LiftRun,
  liftWriter,
  pointsMoved,
  testedVersion,
  versionLift,
  writerKey,
} from './lift.ts'

const run = (over: Partial<LiftRun>): LiftRun => ({
  name: 'r',
  version: 'v0',
  writer: 'claude:sonnet',
  configuration: 'with_skill',
  createdAt: '2026-11-02T10:00:00Z',
  cases: { intro: 80 },
  ...over,
})

describe('versionLift', () => {
  it('compares one writer on the first and the latest version, over its run without the skill', () => {
    const lift = versionLift([
      run({ name: 'v0-sonnet', cases: { intro: 83 } }),
      run({
        name: 'v0-bare',
        configuration: 'without_skill',
        cases: { intro: 71 },
        createdAt: '2026-11-02T10:31:00Z',
      }),
      run({
        name: 'v1-sonnet',
        version: 'v1',
        cases: { intro: 98 },
        createdAt: '2026-11-03T05:04:00Z',
      }),
      // A newer run by a writer that ran on one version only does not count.
      run({
        name: 'v1-haiku',
        version: 'v1',
        writer: 'claude:haiku',
        cases: { intro: 92 },
        createdAt: '2026-11-03T05:26:00Z',
      }),
    ])
    expect(lift?.first).toMatchObject({ name: 'v0-sonnet', mean: 83 })
    expect(lift?.latest).toMatchObject({ name: 'v1-sonnet', mean: 98 })
    expect(lift?.baseline).toMatchObject({ name: 'v0-bare', mean: 71 })
    expect(lift?.rises).toBe(true)
    expect(lift).toMatchObject({ sharedCases: 1, casesDiffer: false })
  })

  it('never takes a run against an old skill as the floor', () => {
    const lift = versionLift([
      run({}),
      run({ version: 'v1', cases: { intro: 90 } }),
      run({ name: 'old', configuration: 'old_skill', cases: { intro: 60 } }),
    ])
    expect(lift?.baseline).toBeNull()
    expect(lift).toMatchObject({ baselineCases: 0, casesDiffer: false })
  })

  it("counts a run against an old skill's snapshot as that version, as the picks do", () => {
    const lift = versionLift([
      run({ name: 'old', configuration: 'old_skill', version: 'v0', cases: { intro: 60 } }),
      run({ version: 'v1', cases: { intro: 90 } }),
    ])
    expect(lift?.first.mean).toBe(60)
    expect(lift?.latest.mean).toBe(90)
  })

  it('is null when no writer ran on two versions', () => {
    expect(versionLift([run({}), run({ writer: 'claude:haiku', version: 'v1' })])).toBeNull()
  })

  it('skips runs with no graded output', () => {
    expect(versionLift([run({}), run({ version: 'v1', cases: {} })])).toBeNull()
  })

  it('takes the latest run of the latest version and the first of the first', () => {
    const lift = versionLift([
      run({ name: 'a', createdAt: '2026-11-01T00:00:00Z' }),
      run({ name: 'b', createdAt: '2026-11-02T00:00:00Z' }),
      run({ name: 'c', version: 'v2', createdAt: '2026-11-03T00:00:00Z' }),
      run({ name: 'd', version: 'v2', createdAt: '2026-11-04T00:00:00Z' }),
    ])
    expect([lift?.first.name, lift?.latest.name]).toEqual(['a', 'd'])
  })

  it('does not rise when the latest scores no higher', () => {
    expect(
      versionLift([run({ cases: { intro: 90 } }), run({ version: 'v1', cases: { intro: 85 } })])
        ?.rises,
    ).toBe(false)
  })

  it('does not rise when the two scores are shown as the same whole number', () => {
    const lift = versionLift([
      run({ cases: { a: 66, b: 67, c: 67 } }),
      run({ version: 'v1', cases: { a: 67, b: 67, c: 67 } }),
    ])
    // 66.67 and 67 both read 67: a ribbon from 67 to 67 would show a rise the numbers deny.
    expect(lift?.latest.mean).toBeGreaterThan(lift?.first.mean ?? 100)
    expect(lift?.rises).toBe(false)
    const up = versionLift([
      run({ cases: { intro: 66.4 } }),
      run({ version: 'v1', cases: { intro: 66.6 } }),
    ])
    expect(up?.rises).toBe(true)
  })

  it('reads v10 as later than v9', () => {
    const lift = versionLift([run({ version: 'v9' }), run({ version: 'v10', name: 'ten' })])
    expect(lift?.latest.name).toBe('ten')
  })

  it('compares the cases both runs answered, each case once, and says when some were left out', () => {
    const lift = versionLift([
      run({ cases: { intro: 60, shift: 80, review: 100 } }),
      run({ version: 'v1', cases: { intro: 90, shift: 70 } }),
      run({
        configuration: 'without_skill',
        cases: { intro: 40, review: 10 },
        createdAt: '2026-11-02T10:31:00Z',
      }),
    ])
    // Over intro and shift only: review ran on v0 alone.
    expect(lift?.first.mean).toBe(70)
    expect(lift?.latest.mean).toBe(80)
    // The floor is read over the same cases where it has them.
    expect(lift?.baseline?.mean).toBe(40)
    expect(lift).toMatchObject({ sharedCases: 2, casesDiffer: true, rises: true })
  })

  it('reads a case only from the runs that answered it, whatever its id', () => {
    // `constructor` is a name every object answers to: only the first run answered that case.
    const lift = versionLift([
      run({ cases: { intro: 60, constructor: 20 } }),
      run({ version: 'v1', cases: { intro: 90 } }),
      run({
        configuration: 'without_skill',
        cases: { intro: 40 },
        createdAt: '2026-11-02T10:31:00Z',
      }),
    ])
    expect(lift).toMatchObject({ sharedCases: 1, casesDiffer: true, baselineCases: 1 })
    expect(lift?.first.mean).toBe(60)
    expect(lift?.latest.mean).toBe(90)
    expect(lift?.baseline?.mean).toBe(40)
  })

  it('takes as the floor the newest run without the skill that answered every shared case', () => {
    const lift = versionLift([
      run({ cases: { a: 50, b: 50, c: 50 } }),
      run({ version: 'v1', cases: { a: 60, b: 60, c: 60 }, createdAt: '2026-11-03T00:00:00Z' }),
      run({ name: 'whole-old', configuration: 'without_skill', cases: { a: 30, b: 30, c: 30 } }),
      run({
        name: 'whole-new',
        configuration: 'without_skill',
        cases: { a: 40, b: 40, c: 40 },
        createdAt: '2026-11-04T00:00:00Z',
      }),
      // Newest of all, and it answered one case of three: its 90 is no floor for the other two.
      run({
        name: 'part',
        configuration: 'without_skill',
        cases: { c: 90 },
        createdAt: '2026-11-05T00:00:00Z',
      }),
    ])
    expect(lift?.baseline).toMatchObject({ name: 'whole-new', mean: 40 })
    expect(lift).toMatchObject({ baselineCases: 3, sharedCases: 3, casesDiffer: false })
  })

  it('says so when no floor answered every shared case, and over how many its mean is', () => {
    const lift = versionLift([
      run({ cases: { a: 50, b: 50, c: 50 } }),
      run({ version: 'v1', cases: { a: 60, b: 60, c: 60 }, createdAt: '2026-11-03T00:00:00Z' }),
      run({ name: 'one', configuration: 'without_skill', cases: { c: 90 } }),
      run({
        name: 'two',
        configuration: 'without_skill',
        cases: { a: 20, b: 40 },
        createdAt: '2026-11-01T00:00:00Z',
      }),
    ])
    // The run that answered the most of them, though it is the older one.
    expect(lift?.baseline).toMatchObject({ name: 'two', mean: 30 })
    expect(lift).toMatchObject({ baselineCases: 2, sharedCases: 3, casesDiffer: true })
  })

  it('reads an older floor when the newest answered none of the shared cases', () => {
    const lift = versionLift([
      run({ cases: { intro: 60 } }),
      run({ version: 'v1', cases: { intro: 90 }, createdAt: '2026-11-03T00:00:00Z' }),
      run({ name: 'old', configuration: 'without_skill', cases: { intro: 40 } }),
      run({
        name: 'new',
        configuration: 'without_skill',
        cases: { other: 90 },
        createdAt: '2026-11-04T00:00:00Z',
      }),
    ])
    expect(lift?.baseline).toMatchObject({ name: 'old', mean: 40 })
  })

  it('leaves the floor out when it answered none of the shared cases', () => {
    const lift = versionLift([
      run({ cases: { intro: 60 } }),
      run({ version: 'v1', cases: { intro: 90 } }),
      run({ configuration: 'without_skill', cases: { review: 10 } }),
    ])
    expect(lift?.baseline).toBeNull()
  })

  it('passes over a writer whose two versions share no case', () => {
    expect(
      versionLift([run({ cases: { intro: 60 } }), run({ version: 'v1', cases: { shift: 90 } })]),
    ).toBeNull()
    // Another writer with a case in common is chosen over it.
    const lift = versionLift([
      run({ cases: { intro: 60 } }),
      run({ version: 'v1', cases: { shift: 90 }, createdAt: '2026-11-05T00:00:00Z' }),
      run({ name: 'h0', writer: 'claude:haiku', cases: { intro: 50 } }),
      run({ name: 'h1', writer: 'claude:haiku', version: 'v1', cases: { intro: 70 } }),
    ])
    expect(lift?.latest.name).toBe('h1')
  })
})

describe('testedVersion', () => {
  it('counts a run with the skill and one on an earlier version’s copy, never one without it', () => {
    expect(testedVersion(run({}))).toBe(true)
    expect(testedVersion(run({ configuration: 'old_skill' }))).toBe(true)
    expect(testedVersion(run({ configuration: 'without_skill' }))).toBe(false)
    // A run that recorded no version tested none that can be named.
    expect(testedVersion(run({ version: '' }))).toBe(false)
  })
})

describe('pointsMoved', () => {
  it('counts the move in the whole points the scores are shown in', () => {
    expect(pointsMoved(66.67, 67)).toBe(0)
    expect(pointsMoved(66.4, 66.6)).toBe(1)
    expect(pointsMoved(90, 85.2)).toBe(-5)
  })
})

describe('liftWriter', () => {
  it('names the writer the lift compares, and nobody before one has run two versions', () => {
    expect(liftWriter([run({}), run({ version: 'v1' })])).toBe('claude:sonnet')
    expect(liftWriter([run({}), run({ writer: 'claude:haiku', version: 'v1' })])).toBeNull()
  })
})

describe('writerKey', () => {
  it('names a writer by engine, model and effort only', () => {
    const a = writerKey({ engine: 'claude', model: 'sonnet', effort: null, harness: 'agent' })
    const b = writerKey({ harness: 'api', effort: null, model: 'sonnet', engine: 'claude' })
    expect(a).toBe(b)
    expect(
      writerKey({ engine: 'claude', model: 'haiku', effort: null, harness: 'agent' }),
    ).not.toBe(a)
  })
})
