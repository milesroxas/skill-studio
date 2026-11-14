import { describe, expect, it } from 'vitest'
import { pointsMoved, testedVersion, type VersionRun, versionWriter, writerKey } from './lift.ts'

const run = (over: Partial<VersionRun>): VersionRun => ({
  name: 'r',
  version: 'v0',
  writer: 'claude:sonnet',
  configuration: 'with_skill',
  createdAt: '2026-11-02T10:00:00Z',
  cases: { intro: 80 },
  ...over,
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

describe('versionWriter', () => {
  it('names the writer that ran two versions, and nobody before one has', () => {
    expect(versionWriter([run({}), run({ version: 'v1' })])).toBe('claude:sonnet')
    expect(versionWriter([run({}), run({ writer: 'claude:haiku', version: 'v1' })])).toBeNull()
  })

  it('skips runs with no graded output', () => {
    expect(versionWriter([run({}), run({ version: 'v1', cases: {} })])).toBeNull()
  })

  it('counts a run against an old skill’s copy as the version it copied', () => {
    expect(
      versionWriter([run({ configuration: 'old_skill', version: 'v0' }), run({ version: 'v1' })]),
    ).toBe('claude:sonnet')
  })

  it('reads v10 as later than v9', () => {
    expect(versionWriter([run({ version: 'v9' }), run({ version: 'v10' })])).toBe('claude:sonnet')
  })

  it('passes over a writer whose two versions share no case, for one with a case in common', () => {
    const apart = [
      run({ cases: { intro: 60 } }),
      run({ version: 'v1', cases: { shift: 90 }, createdAt: '2026-11-05T00:00:00Z' }),
    ]
    expect(versionWriter(apart)).toBeNull()
    expect(
      versionWriter([
        ...apart,
        run({ writer: 'claude:haiku', cases: { intro: 50 } }),
        run({ writer: 'claude:haiku', version: 'v1', cases: { intro: 70 } }),
      ]),
    ).toBe('claude:haiku')
  })

  it('is not kept from a writer by an early run that shares no case with its latest', () => {
    // v0 answered a case since changed: v1 and v2 still share one, so the writer ran two versions.
    expect(
      versionWriter([
        run({ cases: { old: 60 } }),
        run({ version: 'v1', cases: { intro: 70 } }),
        run({ version: 'v2', cases: { intro: 90 } }),
      ]),
    ).toBe('claude:sonnet')
  })

  it('takes the writer whose latest run is newest', () => {
    expect(
      versionWriter([
        run({}),
        run({ version: 'v1', createdAt: '2026-11-03T00:00:00Z' }),
        run({ writer: 'claude:haiku' }),
        run({ writer: 'claude:haiku', version: 'v1', createdAt: '2026-11-04T00:00:00Z' }),
      ]),
    ).toBe('claude:haiku')
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
