import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import type { Case } from '@domain/schemas.ts'
import { describe, expect, it, vi } from 'vitest'
import { Jev } from '../jev.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import { codePack } from './index.ts'
import { type CheckRaw, codeScoring } from './score.ts'

// The check runs a shell command; stand in for it.
const runCommand = vi.hoisted(() =>
  vi.fn(() => ({ exit: 1, stdout: '', tail: 'expected 3, got 4', timedOut: false })),
)
vi.mock('../shared/exec.ts', () => ({ runCommand }))

const config = mergeConfig({ packs: ['code'] }, [codeScoring])
const subject: ScoreSubject = {
  case: null,
  primary: { file: 'outputs/a.ts', kind: 'code' },
  artifacts: [],
  words: 40,
  range: null,
}
const check = (over: Partial<CheckRaw>): CheckRaw => ({
  command: 'node --test',
  exit: 0,
  timedOut: false,
  tail: '',
  ...over,
})

describe('code check layer', () => {
  it('passes on exit 0', () => {
    const { layers, flags } = codeScoring.score({ check: check({}) }, subject, config)
    expect(layers).toEqual({ check: 1 })
    expect(flags).toEqual([])
  })

  it('fails on a nonzero exit with the output tail', () => {
    const raw = { check: check({ exit: 1, tail: 'AssertionError:\n  1 !== 2' }) }
    const { layers, flags } = codeScoring.score(raw, subject, config)
    expect(layers.check).toBe(0)
    expect(flags).toEqual(['check failed (exit 1): AssertionError: 1 !== 2'])
  })

  it('fails on a timeout even with exit 0', () => {
    const raw = { check: check({ timedOut: true }) }
    const { layers, flags } = codeScoring.score(raw, subject, config)
    expect(layers.check).toBe(0)
    expect(flags).toEqual(['check timed out: node --test'])
  })

  it('reports the command as one fact code measured, which no correction changes', () => {
    const raw = { check: check({ exit: 1, tail: 'boom' }) }
    const { layers, verdicts } = codeScoring.score(raw, subject, config, {
      'other:check command': true,
    })
    expect(layers.check).toBe(0)
    expect(verdicts).toEqual([
      expect.objectContaining({
        text: 'check failed (exit 1): boom',
        met: false,
        open: false,
        layer: 'check',
      }),
    ])
  })
})

describe('code scoring of a reading from before', () => {
  it('counts no checks: the case’s checks are the generic pack’s to mark', () => {
    const statement = { id: 'a', text: 'x', weight: 1, noul: 0.1, units: null, best: null }
    const old = { check: null, review: { statements: [statement] } }
    expect(codeScoring.score(old, subject, config)).toEqual({
      layers: { check: null },
      flags: [],
      verdicts: [],
    })
    expect(codeScoring.certainties(old)).toEqual([])
  })
})

describe('code pack without Jev', () => {
  const ctx: JudgeContext = {
    jev: new Jev(),
    useJev: false,
    config,
    skillDir: '/skill',
    log: () => {},
  }
  const input = (bench: Case['bench']): JudgeInput =>
    ({
      text: 'export const sum = (a, b) => a + b',
      units: [],
      case: { bench, graders: [] } as unknown as Case,
      images: [],
      rules: [],
      artifacts: [],
      primary: null,
      others: [],
      skill: null,
      notes: null,
      transcript: null,
      dir: '/sample',
      renders: [],
    }) satisfies JudgeInput

  it("runs the case's check in the sample dir", async () => {
    const raw = await codePack.judge(input({ check: 'node --test' }), ctx)
    expect(runCommand).toHaveBeenCalledWith(ctx, 'node --test', {
      cwd: '/sample',
      timeoutMs: 120_000,
    })
    expect(raw).toEqual({
      check: { command: 'node --test', exit: 1, timedOut: false, tail: 'expected 3, got 4' },
    })
  })

  it('has nothing to say without a check command, with Jev or without', async () => {
    expect(await codePack.judge(input({}), ctx)).toBeNull()
    expect(await codePack.judge(input({}), { ...ctx, useJev: true })).toBeNull()
  })
})
