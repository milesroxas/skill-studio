/**
 * The workflow pack's pure half: how the agent worked, from its transcript.
 * Efficiency and scope are code over the events; process is Jev over a
 * compact summary. Nothing here reads the output itself.
 */
import type { PackScore, PackScoring, ScoreSubject } from '@core/pack.ts'
import type { BenchConfig } from '@core/schemas.ts'
import { certainty, mean } from '@core/stats.ts'

/** The config an active workflow pack sees: core/config.ts lays these defaults under bench.json. */
export type WorkflowConfig = BenchConfig & {
  workflow: { maxRetries: number; summaryLines: number }
}

export interface WorkflowMetrics {
  steps: number
  toolCalls: number
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
  _subject: ScoreSubject,
  config: BenchConfig,
): PackScore {
  const layers: Record<string, number | null> = { efficiency: null, scope: null, process: null }
  const flags: string[] = []
  if (!raw) return { layers, flags }
  const m = raw.metrics
  const { maxRetries } = (config as WorkflowConfig).workflow
  const checks: boolean[] = [m.errors === 0, m.retries <= maxRetries]
  if (m.errors) flags.push(`${m.errors} tool error(s)`)
  if (m.retries > maxRetries) flags.push(`${m.retries} repeated tool call(s)`)
  if (m.maxTurns !== null) {
    checks.push(m.toolCalls <= m.maxTurns)
    if (m.toolCalls > m.maxTurns) flags.push(`${m.toolCalls} tool calls, case allows ${m.maxTurns}`)
  }
  if (m.timeoutSeconds !== null && m.seconds !== null) {
    checks.push(m.seconds <= m.timeoutSeconds)
    if (m.seconds > m.timeoutSeconds) flags.push(`${m.seconds} s, case allows ${m.timeoutSeconds}`)
  }
  if (!m.wroteOutput) flags.push('nothing written to outputs/')
  layers.efficiency = checks.filter(Boolean).length / checks.length
  layers.scope = m.outside.length ? 0 : 1
  for (const path of m.outside.slice(0, 3)) flags.push(`reached outside the sample: ${path}`)
  // Code, not Jev: the transcript says exactly when SKILL.md was read and when writing began.
  const readFirst = m.skillPresent
    ? m.skillReadAt !== null && (m.firstWriteAt === null || m.skillReadAt < m.firstWriteAt)
    : null
  if (readFirst === false) flags.push('skill not read before writing')
  if (raw.jev) {
    const yes = config.yes
    const parts = [raw.jev.followedTask >= yes]
    if (readFirst !== null) parts.push(readFirst)
    if (raw.jev.recovered !== null) parts.push(raw.jev.recovered >= yes)
    layers.process = parts.filter(Boolean).length / parts.length
    if (raw.jev.followedTask < yes)
      flags.push('transcript does not show the task being done as asked')
    if (raw.jev.recovered !== null && raw.jev.recovered < yes)
      flags.push('after an error the agent repeated itself')
  }
  return { layers, flags }
}

const confidenceWorkflow = (raw: WorkflowRaw | null): number | null =>
  raw?.jev
    ? mean(
        [raw.jev.followedTask, raw.jev.recovered]
          .filter((v): v is number => v !== null)
          .map(certainty),
      )
    : null

export const workflowScoring: PackScoring<WorkflowRaw> = {
  id: 'workflow',
  layers: ['efficiency', 'scope', 'process'],
  defaults: {
    weights: { efficiency: 40, scope: 20, process: 40 },
    /**
     * maxRetries: repeated identical tool calls allowed before efficiency loses a check.
     * summaryLines: transcript lines the process questions read.
     */
    workflow: { maxRetries: 1, summaryLines: 80 },
  },
  layerHome: {
    efficiency: {
      skill:
        'The steps SKILL.md asks for: too many, in the wrong order, or missing a stop condition',
      bench: 'The case front matter (max_turns, timeout_seconds), or workflow.maxRetries',
    },
    scope: {
      skill: 'What SKILL.md tells the agent to read; it reached outside the sample',
      bench: 'The scope weight',
    },
    process: {
      skill:
        'How SKILL.md tells the agent to start (read the skill, then the inputs) and to finish',
      bench:
        'The followed_task and recovered questions, the skill-read check in judges/workflow, the process weight, or yes',
    },
  },
  score: scoreWorkflow,
  confidence: confidenceWorkflow,
}
