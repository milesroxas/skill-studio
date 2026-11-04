import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import type { Case, TranscriptEvent } from '@domain/schemas.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Jev } from '../jev.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import { workflowPack } from './index.ts'
import { type WorkflowMetrics, workflowScoring } from './score.ts'

const config = mergeConfig({ packs: ['workflow'] }, [workflowScoring])
const ctx: JudgeContext = { jev: new Jev(), useJev: false, config, skillDir: '/s', log: () => {} }
const subject: ScoreSubject = { case: null, primary: null, artifacts: [], words: 0, range: null }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-workflow-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

let step = 0
const ev = (kind: TranscriptEvent['kind'], extra: Partial<TranscriptEvent> = {}) => ({
  step: ++step,
  at: step * 1000,
  kind,
  ...extra,
})
const tool = (name: string, args: string) => ev('tool', { tool: name, args })

const metrics = async (
  events: TranscriptEvent[],
  settings = {},
  sampleDir = dir,
): Promise<WorkflowMetrics> => {
  const input = {
    text: '',
    units: [],
    title: null,
    case: { settings: { maxTurns: null, timeoutSeconds: null, ...settings } } as unknown as Case,
    rules: [],
    evidence: {},
    artifacts: [{ file: 'outputs/note.md', kind: 'markdown' }],
    primary: null,
    transcript: events,
    dir: sampleDir,
  } satisfies JudgeInput
  const raw = await workflowPack.judge(input, ctx)
  if (!raw) throw new Error('no raw')
  return raw.metrics
}

describe('workflow metrics', () => {
  beforeEach(() => {
    step = 0
  })

  it('counts steps, tool calls, errors and exact repeats', async () => {
    const m = await metrics([
      ev('system', { text: 'claude' }),
      tool('Read', `${dir}/.agents/skills/x/SKILL.md`),
      ev('result', { tool: 'Read' }),
      tool('Bash', 'ls'),
      ev('result', { tool: 'Bash', error: true }),
      tool('Bash', 'ls'),
      ev('text', { text: 'done' }),
      ev('error', { text: 'boom' }),
    ])
    expect(m).toMatchObject({ steps: 4, toolCalls: 3, errors: 2, retries: 1, seconds: 8 })
  })

  it('finds when SKILL.md was read and when writing began', async () => {
    const m = await metrics([
      tool('Bash', `echo hi > ${dir}/outputs/note.md`),
      tool('Read', 'SKILL.md'),
      tool('Write', 'outputs/note.md (4 chars)'),
    ])
    expect(m).toMatchObject({ firstWriteAt: 1, skillReadAt: 2 })
  })

  it('lists absolute paths outside the sample, ignoring system dirs', async () => {
    const m = await metrics([
      tool('Read', `${dir}/outputs/a.md`),
      tool('Read', '/Users/someone/.ssh/config'),
      tool('Bash', 'cat /usr/share/dict/words /tmp/scratch'),
    ])
    expect(m.outside).toEqual(['/Users/someone/.ssh/config'])
  })

  it('compares whole path segments, so a sibling sample or system look-alike is outside', async () => {
    // Samples live under the skill's evals/runs/, never under a system dir like /tmp
    // (which is where os.tmpdir() points on Linux), so this path is not on disk.
    const sample = '/work/skill/evals/runs/r1/case-s1'
    const m = await metrics(
      [
        tool('Read', `${sample}0/outputs/a.md`),
        tool('Read', `${sample}/../elsewhere/b.md`),
        tool('Read', '/etc2/passwd'),
        tool('Read', '/tmp-cache/x'),
        tool('Read', `${sample}/outputs/./c.md`),
      ],
      {},
      sample,
    )
    expect(m.outside).toEqual([
      `${sample}0/outputs/a.md`,
      `${sample}/../elsewhere/b.md`,
      '/etc2/passwd',
      '/tmp-cache/x',
    ])
  })

  it('reads time and cost from timing.json and the skill from .agents/skills', async () => {
    writeFileSync(join(dir, 'timing.json'), JSON.stringify({ durationMs: 41_600, costUsd: 0.02 }))
    mkdirSync(join(dir, '.agents/skills'), { recursive: true })
    const m = await metrics([tool('Read', 'x')], { maxTurns: 5 })
    expect(m).toMatchObject({ seconds: 42, costUsd: 0.02, skillPresent: true, maxTurns: 5 })
  })

  it('returns null without a transcript', async () => {
    const input = { transcript: [], dir } as unknown as JudgeInput
    expect(await workflowPack.judge(input, ctx)).toBeNull()
  })
})

describe('workflow scoring', () => {
  const base: WorkflowMetrics = {
    steps: 4,
    toolCalls: 3,
    errors: 0,
    retries: 0,
    seconds: 10,
    costUsd: null,
    outside: [],
    skillReadAt: 1,
    firstWriteAt: 2,
    skillPresent: true,
    wroteOutput: true,
    maxTurns: null,
    timeoutSeconds: null,
  }
  const score = (over: Partial<WorkflowMetrics>) =>
    workflowScoring.score({ metrics: { ...base, ...over }, jev: null }, subject, config)

  it('gives a clean run full efficiency and scope, process left to Jev', () => {
    expect(score({})).toEqual({ layers: { efficiency: 1, scope: 1, process: null }, flags: [] })
  })

  it('loses efficiency checks for errors, repeats and the case limits', () => {
    const { layers, flags } = score({ errors: 1, retries: 2, maxTurns: 2, timeoutSeconds: 20 })
    expect(layers.efficiency).toBe(1 / 4)
    expect(flags).toEqual([
      '1 tool error(s)',
      '2 repeated tool call(s)',
      '3 tool calls, case allows 2',
    ])
  })

  it('zeroes scope for a path outside and flags a write before the skill read', () => {
    const { layers, flags } = score({ outside: ['/etc2/x'], skillReadAt: 3, wroteOutput: false })
    expect(layers.scope).toBe(0)
    expect(flags).toEqual([
      'nothing written to outputs/',
      'reached outside the sample: /etc2/x',
      'skill not read before writing',
    ])
  })
})
