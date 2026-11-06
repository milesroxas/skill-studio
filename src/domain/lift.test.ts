import { describe, expect, it } from 'vitest'
import { type LiftRun, versionLift, writerKey } from './lift.ts'

const run = (over: Partial<LiftRun>): LiftRun => ({
  name: 'r',
  version: 'v0',
  writer: 'claude:sonnet',
  configuration: 'with_skill',
  createdAt: '2026-11-02T10:00:00Z',
  mean: 80,
  ...over,
})

describe('versionLift', () => {
  it('compares one writer on the first and the latest version, over its run without the skill', () => {
    const lift = versionLift([
      run({ name: 'v0-sonnet', mean: 83 }),
      run({
        name: 'v0-bare',
        configuration: 'without_skill',
        mean: 71,
        createdAt: '2026-11-02T10:31:00Z',
      }),
      run({ name: 'v1-sonnet', version: 'v1', mean: 98, createdAt: '2026-11-03T05:04:00Z' }),
      // A newer run by a writer that ran on one version only does not count.
      run({
        name: 'v1-haiku',
        version: 'v1',
        writer: 'claude:haiku',
        mean: 92,
        createdAt: '2026-11-03T05:26:00Z',
      }),
    ])
    expect(lift?.first.name).toBe('v0-sonnet')
    expect(lift?.latest.name).toBe('v1-sonnet')
    expect(lift?.baseline?.name).toBe('v0-bare')
    expect(lift?.rises).toBe(true)
  })

  it('never takes a run against an old skill as the floor', () => {
    const lift = versionLift([
      run({}),
      run({ version: 'v1', mean: 90 }),
      run({ name: 'old', configuration: 'old_skill', mean: 60 }),
    ])
    expect(lift?.baseline).toBeNull()
  })

  it('is null when no writer ran on two versions', () => {
    expect(versionLift([run({}), run({ writer: 'claude:haiku', version: 'v1' })])).toBeNull()
  })

  it('skips runs with no graded output', () => {
    expect(versionLift([run({}), run({ version: 'v1', mean: null })])).toBeNull()
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
    expect(versionLift([run({ mean: 90 }), run({ version: 'v1', mean: 85 })])?.rises).toBe(false)
  })

  it('reads v10 as later than v9', () => {
    const lift = versionLift([run({ version: 'v9' }), run({ version: 'v10', name: 'ten' })])
    expect(lift?.latest.name).toBe('ten')
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
