/**
 * The design pack's pure half. Markup is code over the HTML; visual is Jev
 * over the HTML text and the page as drawn: the agent's own screenshot, or the
 * page the app drew at desktop and phone width.
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
import { certainty } from '@domain/stats.ts'
import { codeVerdict, finding, jevVerdict } from '@domain/verdict.ts'
import { markChecks, metShare, type StatementAnswer } from '../shared/score.ts'

/** The config an active design pack sees: domain/config.ts lays these defaults under bench.json. */
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
  /** Whether the page fits a phone; null when it was not drawn at phone width, absent in a reading from before. */
  phone?: number | null
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
    const phone =
      raw.jev.phone == null
        ? null
        : jevVerdict(
            {
              kind: 'other',
              id: 'other:phone',
              text: 'The page fits a phone screen',
              layer: 'visual',
            },
            raw.jev.phone,
            yes,
            corrections,
          )
    const checks = markChecks(raw.jev.statements, 'visual', yes, corrections)
    const visual = [
      hierarchy,
      ...(finished ? [finished] : []),
      ...(phone ? [phone] : []),
      ...checks.verdicts,
    ]
    layers.visual = metShare(visual)
    if (!hierarchy.met) flags.push('no clear visual hierarchy in the markup')
    if (finished && !finished.met) flags.push('screenshot does not look finished')
    if (phone && !phone.met) flags.push('page does not fit a phone screen')
    flags.push(...checks.flags)
    verdicts.push(...visual)
  }
  return { layers, flags, verdicts }
}

const certaintiesDesign = (raw: DesignRaw | null): number[] =>
  raw?.jev
    ? [
        raw.jev.hierarchy,
        raw.jev.finished,
        raw.jev.phone ?? null,
        ...raw.jev.statements.map((s) => s.noul),
      ]
        .filter((v): v is number => v !== null)
        .map(certainty)
    : []

export const designScoring: PackScoring<DesignRaw> = {
  id: 'design',
  artifacts: ['html', 'image'],
  layers: ['markup', 'visual'],
  checks: 'visual',
  defaults: {
    weights: { markup: 40, visual: 60 },
    /** How many characters of HTML the visual questions read. */
    design: { maxChars: 20000 },
  },
  score: scoreDesign,
  certainties: certaintiesDesign,
}
