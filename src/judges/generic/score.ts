/**
 * The generic pack's pure half: adherence to the skill's rules and the case's
 * rubric, from stored Nouls. Thresholds and weights come from the config, and
 * the reader's corrections stand over Jev's answers.
 */
import {
  type Corrections,
  NO_CORRECTIONS,
  type PackScore,
  type PackScoring,
  type ScoreSubject,
} from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty, mean } from '@domain/stats.ts'
import { jevVerdict } from '@domain/verdict.ts'
import { checkVerdict, clip, metShare, type StatementAnswer, unmetFlag } from '../shared/score.ts'

export interface RuleAnswer {
  id: string
  text: string
  section: string
  /** Probability the output follows the rule. */
  noul: number
}

export interface GenericRaw {
  adherence: { rules: RuleAnswer[] } | null
  rubric: { statements: StatementAnswer[] } | null
}

function scoreGeneric(
  raw: GenericRaw | null,
  _subject: ScoreSubject,
  config: BenchConfig,
  corrections: Corrections = NO_CORRECTIONS,
): PackScore {
  const layers: Record<string, number | null> = { adherence: null, rubric: null }
  const flags: string[] = []
  if (!raw) return { layers, flags, verdicts: [] }
  const yes = config.yes
  const rules = raw.adherence?.rules ?? []
  const followed = rules.map((rule) =>
    jevVerdict(
      { kind: 'rule', text: rule.text, layer: 'adherence', section: rule.section },
      rule.noul,
      yes,
      corrections,
    ),
  )
  if (rules.length) {
    layers.adherence = followed.filter((v) => v.met).length / rules.length
    rules.forEach((rule, i) => {
      if (!followed[i].met) flags.push(`rule not followed (${rule.section}): ${clip(rule.text)}`)
    })
  }
  const statements = raw.rubric?.statements ?? []
  const checked = statements.map((s) => checkVerdict(s, 'rubric', yes, corrections))
  if (statements.length) {
    layers.rubric = metShare(checked)
    statements.forEach((s, i) => {
      if (!checked[i].met)
        flags.push(`${unmetFlag(s)}${s.best !== null ? ` (closest: unit ${s.best + 1})` : ''}`)
    })
  }
  return { layers, flags, verdicts: [...followed, ...checked] }
}

function confidenceGeneric(raw: GenericRaw | null): number | null {
  if (!raw) return null
  const nouls = [
    ...(raw.adherence?.rules.map((r) => r.noul) ?? []),
    ...(raw.rubric?.statements.map((s) => s.noul) ?? []),
  ]
  return mean(nouls.map(certainty))
}

export const genericScoring: PackScoring<GenericRaw> = {
  id: 'generic',
  layers: ['adherence', 'rubric'],
  checks: 'rubric',
  defaults: { weights: { adherence: 50, rubric: 50 } },
  score: scoreGeneric,
  confidence: confidenceGeneric,
}
