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
const subject: ScoreSubject = { case: null, primary: null, artifacts: [], words: 0, range: null }
const check = (over: Partial<CheckRaw>): CheckRaw => ({
  command: 'node --test',
  exit: 0,
  timedOut: false,
  tail: '',
  ...over,
})

describe('code check layer', () => {
  it('passes on exit 0', () => {
    const { layers, flags } = codeScoring.score({ check: check({}), review: null }, subject, config)
    expect(layers).toEqual({ check: 1, review: null })
    expect(flags).toEqual([])
  })

  it('fails on a nonzero exit with the output tail', () => {
    const raw = { check: check({ exit: 1, tail: 'AssertionError:\n  1 !== 2' }), review: null }
    const { layers, flags } = codeScoring.score(raw, subject, config)
    expect(layers.check).toBe(0)
    expect(flags).toEqual(['check failed (exit 1): AssertionError: 1 !== 2'])
  })

  it('fails on a timeout even with exit 0', () => {
    const raw = { check: check({ timedOut: true }), review: null }
    const { layers, flags } = codeScoring.score(raw, subject, config)
    expect(layers.check).toBe(0)
    expect(flags).toEqual(['check timed out: node --test'])
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
      title: null,
      case: { bench, graders: [] } as unknown as Case,
      images: [],
      rules: [],
      evidence: {},
      artifacts: [],
      primary: null,
      transcript: null,
      dir: '/sample',
    }) satisfies JudgeInput

  it("runs the case's check in the sample dir", async () => {
    const raw = await codePack.judge(input({ check: 'node --test' }), ctx)
    expect(runCommand).toHaveBeenCalledWith('node --test', { cwd: '/sample', timeoutMs: 120_000 })
    expect(raw).toEqual({
      check: { command: 'node --test', exit: 1, timedOut: false, tail: 'expected 3, got 4' },
      review: null,
    })
  })

  it('has nothing to say without a check command', async () => {
    expect(await codePack.judge(input({}), ctx)).toBeNull()
  })
})
