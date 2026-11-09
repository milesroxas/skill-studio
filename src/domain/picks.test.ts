import { describe, expect, it } from 'vitest'
import { defaultPair, type PickOutput, pickBetween, pickStanding } from './picks.ts'
import type { Preference } from './schemas.ts'

const output = (key: string, over: Partial<PickOutput> = {}): PickOutput => ({
  key,
  caseId: 'intro',
  version: 'v0',
  configuration: 'with_skill',
  writer: 'claude/sonnet/default',
  createdAt: '2026-11-01T10:00:00.000Z',
  index: 1,
  ...over,
})

const pick = (a: string, b: string, vote: Preference['vote'], over = {}): Preference => ({
  a,
  b,
  criterion: 'overall',
  vote,
  by: 'human',
  at: '2026-11-01T12:00:00.000Z',
  ...over,
})

describe('defaultPair', () => {
  it('sets the latest version beside the version before it', () => {
    const pair = defaultPair([
      output('r0/intro-s1', { version: 'v0' }),
      output('r1/intro-s1', { version: 'v1' }),
      output('r2/intro-s1', { version: 'v2' }),
    ])
    expect(pair.a?.key).toBe('r1/intro-s1')
    expect(pair.b?.key).toBe('r2/intro-s1')
  })

  it('takes the newest run of a version, and its first sample', () => {
    const pair = defaultPair([
      output('old/intro-s1', { version: 'v1', createdAt: '2026-11-01T09:00:00.000Z' }),
      output('new/intro-s2', { version: 'v1', createdAt: '2026-11-02T09:00:00.000Z', index: 2 }),
      output('new/intro-s1', { version: 'v1', createdAt: '2026-11-02T09:00:00.000Z' }),
      output('first/intro-s1', { version: 'v0' }),
    ])
    expect(pair.b?.key).toBe('new/intro-s1')
    expect(pair.a?.key).toBe('first/intro-s1')
  })

  it('falls back to the answer without the skill when there is one version', () => {
    const pair = defaultPair([
      output('bare/intro-s1', { configuration: 'without_skill' }),
      output('r0/intro-s1'),
    ])
    expect(pair.a?.key).toBe('bare/intro-s1')
    expect(pair.b?.key).toBe('r0/intro-s1')
  })

  it('prefers the version before over the baseline', () => {
    const pair = defaultPair([
      output('bare/intro-s1', { configuration: 'without_skill' }),
      output('r0/intro-s1', { version: 'v0' }),
      output('r1/intro-s1', { version: 'v1' }),
    ])
    expect(pair.a?.key).toBe('r0/intro-s1')
  })

  it('counts a run of an earlier skill as that version', () => {
    const pair = defaultPair([
      output('again/intro-s1', {
        version: 'v0',
        configuration: 'old_skill',
        createdAt: '2026-11-03T09:00:00.000Z',
      }),
      output('r0/intro-s1', { version: 'v0' }),
      output('r1/intro-s1', { version: 'v1' }),
    ])
    expect(pair.a?.key).toBe('again/intro-s1')
    expect(pair.b?.key).toBe('r1/intro-s1')
  })

  it('compares one writer with itself, though another wrote the latest version last', () => {
    const haiku = { writer: 'claude/haiku/default', createdAt: '2026-11-04T09:00:00.000Z' }
    const pair = defaultPair([
      output('r0/intro-s1', { version: 'v0' }),
      output('r1/intro-s1', { version: 'v1', createdAt: '2026-11-03T09:00:00.000Z' }),
      output('r1-haiku/intro-s1', { version: 'v1', ...haiku }),
    ])
    expect(pair.a?.key).toBe('r0/intro-s1')
    expect(pair.b?.key).toBe('r1/intro-s1')
  })

  it('takes the newest answer when no writer wrote on both sides', () => {
    const pair = defaultPair([
      output('r0/intro-s1', { version: 'v0' }),
      output('r1-haiku/intro-s1', { version: 'v1', writer: 'claude/haiku/default' }),
    ])
    expect(pair.a?.key).toBe('r0/intro-s1')
    expect(pair.b?.key).toBe('r1-haiku/intro-s1')
  })

  it('has one answer to read with one version and no baseline', () => {
    const pair = defaultPair([output('r0/intro-s1'), output('r0/intro-s2', { index: 2 })])
    expect(pair).toEqual({ a: null, b: expect.objectContaining({ key: 'r0/intro-s1' }) })
  })

  it('shows the baseline alone when nothing was written with the skill', () => {
    const pair = defaultPair([output('bare/intro-s1', { configuration: 'without_skill' })])
    expect(pair.a).toBeNull()
    expect(pair.b?.key).toBe('bare/intro-s1')
  })

  it('reads a run that recorded no version only when nothing else is there', () => {
    expect(defaultPair([output('legacy/a.md', { version: '' })]).b?.key).toBe('legacy/a.md')
    expect(defaultPair([])).toEqual({ a: null, b: null })
  })
})

describe('pickBetween', () => {
  it('says the pick from the order asked for', () => {
    const picks = [pick('x', 'y', 'a')]
    expect(pickBetween(picks, 'x', 'y')).toBe('a')
    expect(pickBetween(picks, 'y', 'x')).toBe('b')
    expect(pickBetween([pick('x', 'y', 'tie')], 'y', 'x')).toBe('tie')
  })

  it('is null for a pair not picked, and for a vote on another criterion', () => {
    expect(pickBetween([pick('x', 'y', 'a')], 'x', 'z')).toBeNull()
    expect(pickBetween([pick('x', 'y', 'a', { criterion: 'tone' })], 'x', 'y')).toBeNull()
  })

  it('reads only the reader’s own picks', () => {
    const stored = { ...pick('x', 'y', 'b'), by: 'jev' } as unknown as Preference
    expect(pickBetween([stored], 'x', 'y')).toBeNull()
  })
})

describe('pickStanding', () => {
  it('agrees when the pick and the higher score name the same side', () => {
    expect(pickStanding('b', 70, 90)).toBe('agrees')
    expect(pickStanding('a', 90, 70)).toBe('agrees')
  })

  it('differs when the other side scores higher', () => {
    expect(pickStanding('a', 70, 90)).toBe('differs')
    expect(pickStanding('b', 90, 70)).toBe('differs')
  })

  it('never differs on a tie, picked or scored', () => {
    expect(pickStanding('tie', 70, 90)).toBe('agrees')
    expect(pickStanding('a', 80, 80)).toBe('agrees')
  })

  it('has no standing without a pick or a score', () => {
    expect(pickStanding(null, 70, 90)).toBeNull()
    expect(pickStanding('a', null, 90)).toBeNull()
  })
})
