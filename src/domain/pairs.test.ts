import { describe, expect, it } from 'vitest'
import { defaultPair, type PairOutput } from './pairs.ts'

const output = (key: string, over: Partial<PairOutput> = {}): PairOutput => ({
  key,
  caseId: 'intro',
  version: 'v0',
  configuration: 'with_skill',
  writer: 'claude/sonnet/default',
  createdAt: '2026-11-01T10:00:00.000Z',
  index: 1,
  written: true,
  ...over,
})

describe('defaultPair', () => {
  it('passes over a newer output that was never written, such as one of a stopped run', () => {
    const pair = defaultPair([
      output('v1-a/intro-s1', { version: 'v1', createdAt: '2026-11-02T10:00:00.000Z' }),
      output('v1-b/intro-s1', {
        version: 'v1',
        createdAt: '2026-11-03T10:00:00.000Z',
        written: false,
      }),
    ])
    expect(pair.b?.key).toBe('v1-a/intro-s1')
  })

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
