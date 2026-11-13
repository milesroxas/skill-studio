/**
 * The generic pack's pure half: adherence to the skill's rules and the case's
 * rubric, from stored Nouls, whatever kind of file the output is. Thresholds and weights come from the config, and
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
import { certainty } from '@domain/stats.ts'
import { finding, jevVerdict } from '@domain/verdict.ts'
import { clip, markChecks, type StatementAnswer } from '../shared/score.ts'

export interface RuleAnswer {
  id: string
  text: string
  section: string
  /** Probability the output follows the rule. */
  noul: number
}

export interface GenericRaw {
  adherence: { rules: RuleAnswer[] } | null
  /** `unasked` says why each check that was not asked was left out: its picture is one Jev cannot read. */
  rubric: { statements: StatementAnswer[]; unasked?: string[] } | null
  /** Why the output's picture was left out, when it was. */
  unread?: string
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
  // What was not judged counts in no layer, and is said.
  const unjudged = [...(raw.unread ? [raw.unread] : []), ...(raw.rubric?.unasked ?? [])]
  flags.push(...unjudged)
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
  const checks = markChecks(raw.rubric?.statements ?? [], 'rubric', yes, corrections)
  layers.rubric = checks.share
  flags.push(...checks.flags)
  return {
    layers,
    flags,
    verdicts: [...unjudged.map(finding), ...followed, ...checks.verdicts],
  }
}

const certaintiesGeneric = (raw: GenericRaw | null): number[] =>
  [
    ...(raw?.adherence?.rules.map((r) => r.noul) ?? []),
    ...(raw?.rubric?.statements.map((s) => s.noul) ?? []),
  ].map(certainty)

export const genericScoring: PackScoring<GenericRaw> = {
  id: 'generic',
  // Any output: what a skill's rules ask does not depend on the kind of file it makes.
  artifacts: [],
  layers: ['adherence', 'rubric'],
  defaults: { weights: { adherence: 50, rubric: 50 } },
  score: scoreGeneric,
  certainties: certaintiesGeneric,
}
