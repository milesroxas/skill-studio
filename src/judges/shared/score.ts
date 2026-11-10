/** Helpers the packs' pure halves share. No server imports: the browser loads these. */
import { weightMark } from '@domain/case-draft.ts'
import type { Corrections, JudgedVerdict, Verdict } from '@domain/pack.ts'
import { weighted } from '@domain/stats.ts'
import { jevVerdict } from '@domain/verdict.ts'

export interface StatementAnswer {
  id: string
  text: string
  weight: number
  /** Probability the statement is true of the whole output. */
  noul: number
  /** The same statement over each unit; null when the output has one unit or none. */
  units: number[] | null
  /** Index of the unit where the statement reads most true. */
  best: number | null
}

export const clip = (text: string, max = 110): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text

/** An unmet check, with its ×2 mark when it counts more: a marked miss costs more of the layer. */
export const unmetFlag = (s: StatementAnswer): string =>
  `grader ${s.id}${s.weight === 1 ? '' : ` (${weightMark(s.weight)})`} not met: ${clip(s.text)}`

/** One of a case's checks as a verdict of `layer`. */
const checkVerdict = (
  s: StatementAnswer,
  layer: string,
  yes: number,
  corrections: Corrections,
): JudgedVerdict =>
  jevVerdict(
    { kind: 'check', text: s.text, layer, ...(s.weight === 1 ? {} : { weight: s.weight }) },
    s.noul,
    yes,
    corrections,
  )

/** The share of facts met, each counted by its weight; null when there are none. */
export const metShare = (verdicts: readonly Verdict[]): number | null =>
  weighted(verdicts.map((v) => [v.met ? 1 : 0, v.weight ?? 1]))

/** A case's checks as one layer marks them: each as a verdict, the share met by weight, and a flag per miss. */
export interface ChecksMarked {
  verdicts: JudgedVerdict[]
  /** Null when the case has no checks, so the layer is left out. */
  share: number | null
  flags: string[]
}

/** The case's checks marked for `layer`, the reader's corrections over Jev's answers. Every pack that reads checks counts them here. */
export function markChecks(
  statements: readonly StatementAnswer[],
  layer: string,
  yes: number,
  corrections: Corrections,
): ChecksMarked {
  const verdicts = statements.map((s) => checkVerdict(s, layer, yes, corrections))
  return {
    verdicts,
    share: metShare(verdicts),
    flags: statements.filter((_, i) => !verdicts[i].met).map(unmetFlag),
  }
}
