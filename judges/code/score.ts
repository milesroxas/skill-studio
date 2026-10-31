/**
 * The code pack's pure half: a hard check layer from the case's command and a
 * review layer from the grader statements over the primary code file.
 */
import type { PackScore, PackScoring, ScoreSubject } from '@core/pack.ts'
import type { BenchConfig } from '@core/schemas.ts'
import { certainty, mean, weighted } from '@core/stats.ts'
import { clip, type StatementAnswer, unmetFlag } from '../shared/score.ts'

/** The config an active code pack sees: core/config.ts lays these defaults under bench.json. */
export type CodeConfig = BenchConfig & { codeCheck: { timeoutSeconds: number; maxChars: number } }

export interface CheckRaw {
  command: string
  exit: number | null
  timedOut: boolean
  tail: string
}

export interface CodeRaw {
  /** Null when the case names no `bench.check`. */
  check: CheckRaw | null
  /** Null when Jev was off or the case has no graders. */
  review: { statements: StatementAnswer[] } | null
}

function scoreCode(raw: CodeRaw | null, _subject: ScoreSubject, config: BenchConfig): PackScore {
  const layers: Record<string, number | null> = { check: null, review: null }
  const flags: string[] = []
  if (!raw) return { layers, flags }
  if (raw.check) {
    const passed = raw.check.exit === 0 && !raw.check.timedOut
    layers.check = passed ? 1 : 0
    if (!passed)
      flags.push(
        raw.check.timedOut
          ? `check timed out: ${raw.check.command}`
          : `check failed (exit ${raw.check.exit ?? '?'}): ${clip(raw.check.tail.replace(/\s+/g, ' '), 160)}`,
      )
  }
  const yes = config.yes
  if (raw.review?.statements.length) {
    layers.review = weighted(raw.review.statements.map((s) => [s.noul >= yes ? 1 : 0, s.weight]))
    for (const s of raw.review.statements) if (s.noul < yes) flags.push(unmetFlag(s))
  }
  return { layers, flags }
}

const confidenceCode = (raw: CodeRaw | null): number | null =>
  raw?.review ? mean(raw.review.statements.map((s) => certainty(s.noul))) : null

export const codeScoring: PackScoring<CodeRaw> = {
  id: 'code',
  layers: ['check', 'review'],
  defaults: {
    weights: { check: 60, review: 40 },
    /** Seconds the check command may run, and how many characters of code the review question reads. */
    codeCheck: { timeoutSeconds: 120, maxChars: 24000 },
  },
  layerHome: {
    check: {
      skill: 'The part of SKILL.md that says how the code must run or be tested',
      bench: "The case's bench.check command, or the check weight",
    },
    review: {
      skill: 'The SKILL.md section that should produce what the failed statement asks for',
      bench: "The case's graders/*.md statements, the review weight, or yes",
    },
  },
  score: scoreCode,
  confidence: confidenceCode,
}
