/**
 * The generic pack's pure half: adherence to the skill's rules and the case's
 * rubric, from stored Nouls. Thresholds and weights come from the config.
 */
import type { PackScore, PackScoring, ScoreSubject } from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty, mean, weighted } from '@domain/stats.ts'
import { clip, type StatementAnswer, unmetFlag } from '../shared/score.ts'

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
): PackScore {
  const layers: Record<string, number | null> = { adherence: null, rubric: null }
  const flags: string[] = []
  if (!raw) return { layers, flags }
  const yes = config.yes
  if (raw.adherence?.rules.length) {
    const rules = raw.adherence.rules
    layers.adherence = rules.filter((r) => r.noul >= yes).length / rules.length
    for (const rule of rules)
      if (rule.noul < yes) flags.push(`rule not followed (${rule.section}): ${clip(rule.text)}`)
  }
  if (raw.rubric?.statements.length) {
    const statements = raw.rubric.statements
    layers.rubric = weighted(statements.map((s) => [s.noul >= yes ? 1 : 0, s.weight]))
    for (const s of statements)
      if (s.noul < yes)
        flags.push(`${unmetFlag(s)}${s.best !== null ? ` (closest: unit ${s.best + 1})` : ''}`)
  }
  return { layers, flags }
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
  layerHome: {
    adherence: {
      skill: 'The violated rule, in the SKILL.md section each flag names',
      bench: 'rules in evals/bench.json (which bullets count), the adherence points, or yes',
    },
    rubric: {
      skill:
        'The part of SKILL.md or its references that should produce what the failed statement asks for',
      bench: "The case's graders/*.md statements, the rubric points, or yes",
    },
  },
  score: scoreGeneric,
  confidence: confidenceGeneric,
}
