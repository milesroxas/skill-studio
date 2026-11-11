/**
 * The code pack's pure half: one hard layer, whether the case's check command
 * passed.
 */
import type { PackScore, PackScoring, Verdict } from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { codeVerdict } from '@domain/verdict.ts'
import { clip } from '../shared/score.ts'

/** The config an active code pack sees: domain/config.ts lays these defaults under bench.json. */
export type CodeConfig = BenchConfig & { codeCheck: { timeoutSeconds: number } }

export interface CheckRaw {
  command: string
  exit: number | null
  timedOut: boolean
  tail: string
}

export interface CodeRaw {
  /** Null in a reading of a case that names no `bench.check`. */
  check: CheckRaw | null
}

function scoreCode(raw: CodeRaw | null): PackScore {
  const layers: Record<string, number | null> = { check: null }
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
  return { layers, flags, verdicts }
}

export const codeScoring: PackScoring<CodeRaw> = {
  id: 'code',
  artifacts: ['code'],
  layers: ['check'],
  defaults: {
    weights: { check: 60 },
    /** Seconds the check command may run. */
    codeCheck: { timeoutSeconds: 120 },
  },
  score: scoreCode,
  // Code measured it: there is no answer of Jev's to be sure or unsure of.
  certainties: () => [],
}
