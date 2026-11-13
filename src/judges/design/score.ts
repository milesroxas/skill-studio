/**
 * The design pack's pure half: one layer, how the output looks, from Jev's
 * answers about its picture (the page the app drew at desktop and phone
 * width, or the picture the agent made).
 */
import {
  type Corrections,
  isMissed,
  NO_CORRECTIONS,
  type PackScore,
  type PackScoring,
  type ScoreSubject,
  type Verdict,
} from '@domain/pack.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import { certainty } from '@domain/stats.ts'
import { finding, jevVerdict } from '@domain/verdict.ts'
import { metShare } from '../shared/score.ts'

export interface DesignJev {
  hierarchy: number
  /** Null in a reading taken without a picture. */
  finished: number | null
  /** Whether the page fits a phone; null or absent when it was not drawn at phone width. */
  phone?: number | null
}

export interface DesignRaw {
  /** Null when Jev was not asked: only a picture left unread is said. */
  jev: DesignJev | null
  /** Why a picture was left out, when one was. */
  unread?: string
}

/** The fixed questions, by the name a correction knows each by. */
const QUESTIONS = [
  {
    key: 'hierarchy',
    text: 'The output has one clear main point',
    flag: 'no clear main point',
  },
  {
    key: 'finished',
    text: 'Nothing in the output looks broken',
    flag: 'something looks broken',
  },
  { key: 'phone', text: 'The page fits a phone screen', flag: 'page does not fit a phone screen' },
] as const

function scoreDesign(
  raw: DesignRaw | null,
  _subject: ScoreSubject,
  config: BenchConfig,
  corrections: Corrections = NO_CORRECTIONS,
): PackScore {
  const layers: Record<string, number | null> = { visual: null }
  const flags: string[] = []
  const verdicts: Verdict[] = []
  if (!raw) return { layers, flags, verdicts }
  if (raw.unread) {
    flags.push(raw.unread)
    verdicts.push(finding(raw.unread))
  }
  const { jev } = raw
  if (jev) {
    const asked = QUESTIONS.flatMap((q) => {
      const answer = jev[q.key]
      if (answer == null) return []
      const verdict = jevVerdict(
        { kind: 'other', id: `other:${q.key}`, text: q.text, layer: 'visual' },
        answer,
        config,
        corrections,
      )
      if (isMissed(verdict)) flags.push(q.flag)
      return [verdict]
    })
    layers.visual = metShare(asked)
    verdicts.push(...asked)
  }
  return { layers, flags, verdicts }
}

const certaintiesDesign = (raw: DesignRaw | null): number[] =>
  raw?.jev
    ? [raw.jev.hierarchy, raw.jev.finished, raw.jev.phone ?? null]
        .filter((v): v is number => v !== null)
        .map(certainty)
    : []

export const designScoring: PackScoring<DesignRaw> = {
  id: 'design',
  artifacts: ['html', 'image'],
  layers: ['visual'],
  defaults: { weights: { visual: 30 } },
  score: scoreDesign,
  certainties: certaintiesDesign,
}
