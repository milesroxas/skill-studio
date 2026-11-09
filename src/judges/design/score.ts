/**
 * The design pack's pure half. Markup is code over the HTML; visual is Jev
 * over the HTML text and, when the agent left one, a screenshot.
 */
import {
  type Corrections,
  NO_CORRECTIONS,
  type PackScore,
  type PackScoring,
  type ScoreSubject,
  type Verdict,
} from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty, mean } from '@domain/stats.ts'
import { codeVerdict, finding, jevVerdict } from '@domain/verdict.ts'
import { checkVerdict, metShare, type StatementAnswer, unmetFlag } from '../shared/score.ts'

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
  /** Why the screenshot was left out of the visual questions, when it was. */
  unread?: string
}

function scoreDesign(
  raw: DesignRaw | null,
  _subject: ScoreSubject,
  config: BenchConfig,
  corrections: Corrections = NO_CORRECTIONS,
): PackScore {
  const layers: Record<string, number | null> = { markup: null, visual: null }
  const flags: string[] = []
  const verdicts: Verdict[] = []
  if (!raw) return { layers, flags, verdicts }
  if (raw.unread) {
    flags.push(raw.unread)
    verdicts.push(finding(raw.unread))
  }
  if (raw.markup?.length) {
    layers.markup = raw.markup.filter((c) => c.ok).length / raw.markup.length
    for (const c of raw.markup) {
      if (!c.ok) flags.push(`markup: ${c.note}`)
      verdicts.push(
        codeVerdict(
          {
            kind: 'other',
            id: `other:markup ${c.id}`,
            text: c.ok ? `markup: ${c.id}` : `markup: ${c.note}`,
            layer: 'markup',
          },
          c.ok,
        ),
      )
    }
  }
  if (raw.jev) {
    const yes = config.yes
    const hierarchy = jevVerdict(
      {
        kind: 'other',
        id: 'other:hierarchy',
        text: 'The markup shows a clear visual hierarchy',
        layer: 'visual',
      },
      raw.jev.hierarchy,
      yes,
      corrections,
    )
    const finished =
      raw.jev.finished === null
        ? null
        : jevVerdict(
            {
              kind: 'other',
              id: 'other:finished',
              text: 'The screenshot looks finished, with nothing broken',
              layer: 'visual',
            },
            raw.jev.finished,
            yes,
            corrections,
          )
    const checked = raw.jev.statements.map((s) => checkVerdict(s, 'visual', yes, corrections))
    const visual = [hierarchy, ...(finished ? [finished] : []), ...checked]
    layers.visual = metShare(visual)
    if (!hierarchy.met) flags.push('no clear visual hierarchy in the markup')
    if (finished && !finished.met) flags.push('screenshot does not look finished')
    raw.jev.statements.forEach((s, i) => {
      if (!checked[i].met) flags.push(unmetFlag(s))
    })
    verdicts.push(...visual)
  }
  return { layers, flags, verdicts }
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
  checks: 'visual',
  defaults: {
    weights: { markup: 40, visual: 60 },
    /** How many characters of HTML the visual questions read. */
    design: { maxChars: 20000 },
  },
  score: scoreDesign,
  confidence: confidenceDesign,
}
