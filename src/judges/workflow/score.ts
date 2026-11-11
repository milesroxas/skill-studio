/**
 * The workflow pack's pure half: how the agent worked, from its transcript.
 * Efficiency and scope are code over the events; process is Jev over a
 * compact summary. Nothing here reads the output itself.
 */
import {
  type Corrections,
  NO_CORRECTIONS,
  noOutput,
  type PackScore,
  type PackScoring,
  type ScoreSubject,
  type Verdict,
} from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty } from '@domain/stats.ts'
import { codeVerdict, finding, jevVerdict } from '@domain/verdict.ts'

/** The config an active workflow pack sees: domain/config.ts lays these defaults under bench.json. */
export type WorkflowConfig = BenchConfig & {
  workflow: { maxRetries: number; summaryLines: number }
}

export interface WorkflowMetrics {
  steps: number
  toolCalls: number
  /** Steps that ended in an error. Counted so Jev is asked what came after one; no score is taken off for it. */
  errors: number
  /** Tool calls that repeat an earlier call's tool and arguments exactly. */
  retries: number
  seconds: number | null
  costUsd: number | null
  /** Absolute paths the agent touched outside its sample directory. */
  outside: string[]
  /** Step of the first read of SKILL.md and of the first write; null when absent. */
  skillReadAt: number | null
  firstWriteAt: number | null
  /** False for a without_skill sample: there was no skill to read. */
  skillPresent: boolean
  wroteOutput: boolean
  maxTurns: number | null
  timeoutSeconds: number | null
}

export interface WorkflowJev {
  followedTask: number
  /** Only asked when the transcript has an error. */
  recovered: number | null
}

export interface WorkflowRaw {
  metrics: WorkflowMetrics
  jev: WorkflowJev | null
}

function scoreWorkflow(
  raw: WorkflowRaw | null,
  subject: ScoreSubject,
  config: BenchConfig,
  corrections: Corrections = NO_CORRECTIONS,
): PackScore {
  const layers: Record<string, number | null> = { efficiency: null, scope: null, process: null }
  const flags: string[] = []
  const verdicts: Verdict[] = []
  if (!raw) return { layers, flags, verdicts }
  const m = raw.metrics
  const { maxRetries } = (config as WorkflowConfig).workflow
  /** One of the efficiency checks: what it says when it passes, and when it does not. */
  const measure = (id: string, ok: boolean, passed: string, failed: string): boolean => {
    if (!ok) flags.push(failed)
    verdicts.push(
      codeVerdict(
        { kind: 'other', id: `other:${id}`, text: ok ? passed : failed, layer: 'efficiency' },
        ok,
      ),
    )
    return ok
  }
  // An error is not waste: a test run that fails before the fix is the work going right. What the
  // agent did after one is what counts, and Jev answers that in the process layer.
  const checks: boolean[] = [
    measure(
      'retries',
      m.retries <= maxRetries,
      'no repeated tool calls beyond the allowance',
      `${m.retries} repeated tool call(s)`,
    ),
  ]
  if (m.maxTurns !== null)
    checks.push(
      measure(
        'turns',
        m.toolCalls <= m.maxTurns,
        `${m.toolCalls} tool calls, within the case's ${m.maxTurns}`,
        `${m.toolCalls} tool calls, case allows ${m.maxTurns}`,
      ),
    )
  if (m.timeoutSeconds !== null && m.seconds !== null)
    checks.push(
      measure(
        'time',
        m.seconds <= m.timeoutSeconds,
        `${m.seconds} s, within the case's ${m.timeoutSeconds}`,
        `${m.seconds} s, case allows ${m.timeoutSeconds}`,
      ),
    )
  if (!m.wroteOutput) {
    flags.push('nothing written to outputs/')
    verdicts.push(finding('nothing written to outputs/'))
  }
  layers.efficiency = checks.filter(Boolean).length / checks.length
  layers.scope = m.outside.length ? 0 : 1
  for (const path of m.outside.slice(0, 3)) flags.push(`reached outside the sample: ${path}`)
  verdicts.push(
    codeVerdict(
      {
        kind: 'other',
        id: 'other:scope',
        text: m.outside.length
          ? `reached outside the sample: ${m.outside.slice(0, 3).join(', ')}`
          : 'stayed inside the sample',
        layer: 'scope',
      },
      m.outside.length === 0,
    ),
  )
  // Code, not Jev: the transcript says exactly when SKILL.md was read and when writing began.
  const readFirst = m.skillPresent
    ? m.skillReadAt !== null && (m.firstWriteAt === null || m.skillReadAt < m.firstWriteAt)
    : null
  if (readFirst === false) flags.push('skill not read before writing')
  if (readFirst !== null)
    verdicts.push(
      codeVerdict(
        {
          kind: 'other',
          id: 'other:read first',
          text: readFirst ? 'skill read before writing' : 'skill not read before writing',
          // Without Jev there is no process layer for it to count in.
          layer: raw.jev ? 'process' : null,
        },
        readFirst,
      ),
    )
  if (raw.jev) {
    const yes = config.yes
    const followed = jevVerdict(
      {
        kind: 'other',
        id: 'other:followed task',
        text: 'The transcript shows the task being done as asked',
        layer: 'process',
      },
      raw.jev.followedTask,
      yes,
      corrections,
    )
    const recovered =
      raw.jev.recovered === null
        ? null
        : jevVerdict(
            {
              kind: 'other',
              id: 'other:recovered',
              text: 'After an error the agent changed course',
              layer: 'process',
            },
            raw.jev.recovered,
            yes,
            corrections,
          )
    const parts = [followed.met]
    if (readFirst !== null) parts.push(readFirst)
    if (recovered) parts.push(recovered.met)
    layers.process = parts.filter(Boolean).length / parts.length
    if (!followed.met) flags.push('transcript does not show the task being done as asked')
    if (recovered && !recovered.met) flags.push('after an error the agent repeated itself')
    verdicts.push(followed, ...(recovered ? [recovered] : []))
  }
  // How a run went is worth nothing when it produced nothing: a tidy transcript with no output is a failed sample.
  if (!m.wroteOutput || noOutput(subject))
    for (const layer of Object.keys(layers)) if (layers[layer] !== null) layers[layer] = 0
  return { layers, flags, verdicts }
}

const certaintiesWorkflow = (raw: WorkflowRaw | null): number[] =>
  raw?.jev
    ? [raw.jev.followedTask, raw.jev.recovered]
        .filter((v): v is number => v !== null)
        .map(certainty)
    : []

export const workflowScoring: PackScoring<WorkflowRaw> = {
  id: 'workflow',
  artifacts: [],
  layers: ['efficiency', 'scope', 'process'],
  defaults: {
    weights: { efficiency: 40, scope: 20, process: 40 },
    /**
     * maxRetries: repeated identical tool calls allowed before efficiency loses a check.
     * summaryLines: transcript lines the process questions read.
     */
    workflow: { maxRetries: 1, summaryLines: 80 },
  },
  score: scoreWorkflow,
  certainties: certaintiesWorkflow,
}
