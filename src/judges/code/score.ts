/**
 * The code pack's pure half: a hard check layer from the case's command and a
 * review layer from the grader statements over the primary code file.
 */
import {
  type Corrections,
  NO_CORRECTIONS,
  type PackScore,
  type PackScoring,
  type ScoreSubject,
  type Verdict,
} from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty } from '@domain/stats.ts'
import { codeVerdict } from '@domain/verdict.ts'
import { clip, markChecks, type StatementAnswer } from '../shared/score.ts'

/** The config an active code pack sees: domain/config.ts lays these defaults under bench.json. */
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

function scoreCode(
  raw: CodeRaw | null,
  _subject: ScoreSubject,
  config: BenchConfig,
  corrections: Corrections = NO_CORRECTIONS,
): PackScore {
  const layers: Record<string, number | null> = { check: null, review: null }
  const flags: string[] = []
  const verdicts: Verdict[] = []
  if (!raw) return { layers, flags, verdicts }
  if (raw.check) {
    const passed = raw.check.exit === 0 && !raw.check.timedOut
    layers.check = passed ? 1 : 0
    const failure = raw.check.timedOut
      ? `check timed out: ${raw.check.command}`
      : `check failed (exit ${raw.check.exit ?? '?'}): ${clip(raw.check.tail.replace(/\s+/g, ' '), 160)}`
    if (!passed) flags.push(failure)
    verdicts.push(
      codeVerdict(
        {
          kind: 'other',
          id: 'other:check command',
          text: passed ? `check passed: ${raw.check.command}` : failure,
          layer: 'check',
        },
        passed,
      ),
    )
  }
  const checks = markChecks(raw.review?.statements ?? [], 'review', config.yes, corrections)
  layers.review = checks.share
  flags.push(...checks.flags)
  return { layers, flags, verdicts: [...verdicts, ...checks.verdicts] }
}

const certaintiesCode = (raw: CodeRaw | null): number[] =>
  (raw?.review?.statements ?? []).map((s) => certainty(s.noul))

export const codeScoring: PackScoring<CodeRaw> = {
  id: 'code',
  artifacts: ['code'],
  layers: ['check', 'review'],
  checks: 'review',
  defaults: {
    weights: { check: 60, review: 40 },
    /** Seconds the check command may run, and how many characters of code the review question reads. */
    codeCheck: { timeoutSeconds: 120, maxChars: 24000 },
  },
  score: scoreCode,
  certainties: certaintiesCode,
}
