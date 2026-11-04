/**
 * The design pack's pure half. Markup is code over the HTML; visual is Jev
 * over the HTML text and, when the agent left one, a screenshot.
 */
import type { PackScore, PackScoring, ScoreSubject } from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty, mean, weighted } from '@domain/stats.ts'
import { type StatementAnswer, unmetFlag } from '../shared/score.ts'

/** The config an active design pack sees: core/config.ts lays these defaults under bench.json. */
export type DesignConfig = BenchConfig & { design: { maxChars: number } }

export interface MarkupCheck {
  id: string
  ok: boolean
  note: string
}

export interface DesignJev {
  hierarchy: number
  /** Null without a screenshot. */
  finished: number | null
  statements: StatementAnswer[]
}

export interface DesignRaw {
  /** Null when the primary artifact is an image. */
  markup: MarkupCheck[] | null
  jev: DesignJev | null
}

function scoreDesign(
  raw: DesignRaw | null,
  _subject: ScoreSubject,
  config: BenchConfig,
): PackScore {
  const layers: Record<string, number | null> = { markup: null, visual: null }
  const flags: string[] = []
  if (!raw) return { layers, flags }
  if (raw.markup?.length) {
    layers.markup = raw.markup.filter((c) => c.ok).length / raw.markup.length
    for (const c of raw.markup) if (!c.ok) flags.push(`markup: ${c.note}`)
  }
  if (raw.jev) {
    const yes = config.yes
    const parts: Array<[number, number]> = [[raw.jev.hierarchy >= yes ? 1 : 0, 1]]
    if (raw.jev.finished !== null) parts.push([raw.jev.finished >= yes ? 1 : 0, 1])
    for (const s of raw.jev.statements) parts.push([s.noul >= yes ? 1 : 0, s.weight])
    layers.visual = weighted(parts)
    if (raw.jev.hierarchy < yes) flags.push('no clear visual hierarchy in the markup')
    if (raw.jev.finished !== null && raw.jev.finished < yes)
      flags.push('screenshot does not look finished')
    for (const s of raw.jev.statements) if (s.noul < yes) flags.push(unmetFlag(s))
  }
  return { layers, flags }
}

const confidenceDesign = (raw: DesignRaw | null): number | null =>
  raw?.jev
    ? mean(
        [raw.jev.hierarchy, raw.jev.finished, ...raw.jev.statements.map((s) => s.noul)]
          .filter((v): v is number => v !== null)
          .map(certainty),
      )
    : null

export const designScoring: PackScoring<DesignRaw> = {
  id: 'design',
  layers: ['markup', 'visual'],
  defaults: {
    weights: { markup: 40, visual: 60 },
    /** How many characters of HTML the visual questions read. */
    design: { maxChars: 20000 },
  },
  layerHome: {
    markup: {
      skill: 'The HTML rules in SKILL.md: document shell, landmarks, alt text, heading order',
      bench: 'The markup checks in judges/design, or the markup weight',
    },
    visual: {
      skill: 'The layout, hierarchy and copy guidance in SKILL.md or its references',
      bench: "The hierarchy and finished questions, the case's graders, the visual weight, or yes",
    },
  },
  score: scoreDesign,
  confidence: confidenceDesign,
}
