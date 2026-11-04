/** Helpers the packs' pure halves share. No server imports: the browser loads these. */

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

export const unmetFlag = (s: StatementAnswer): string => `grader ${s.id} not met: ${clip(s.text)}`
