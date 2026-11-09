/** Helpers the packs' pure halves share. No server imports: the browser loads these. */
import { weightMark } from '@domain/case-draft.ts'
import type { Corrections, Verdict } from '@domain/pack.ts'
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
export const checkVerdict = (
  s: StatementAnswer,
  layer: string,
  yes: number,
  corrections: Corrections,
): Verdict =>
  jevVerdict(
    { kind: 'check', text: s.text, layer, ...(s.weight === 1 ? {} : { weight: s.weight }) },
    s.noul,
    yes,
    corrections,
  )

/** The share of facts met, each counted by its weight; null when there are none. */
export const metShare = (verdicts: readonly Verdict[]): number | null =>
  weighted(verdicts.map((v) => [v.met ? 1 : 0, v.weight ?? 1]))
