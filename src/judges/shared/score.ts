/** Helpers the packs' pure halves share. No server imports: the browser loads these. */
import { weightMark } from '@domain/case-draft.ts'

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
