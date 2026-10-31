/**
 * The pure scorers of every pack, importable by the browser. A pack's
 * `score.ts` export goes here; its server half goes in index.ts.
 */
import type { PackScoring } from '@core/pack.ts'
import { codeScoring } from './code/score.ts'
import { designScoring } from './design/score.ts'
import { genericScoring } from './generic/score.ts'
import { workflowScoring } from './workflow/score.ts'
import { writingScoring } from './writing/score.ts'

export const scorers: PackScoring[] = [
  genericScoring,
  writingScoring,
  codeScoring,
  workflowScoring,
  designScoring,
]
