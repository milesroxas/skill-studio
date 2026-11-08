import type { PackScoring, ScoreSubject } from './pack.ts'
import type { BenchConfig, ReportResult, Scores } from './schemas.ts'
import { mean, weighted } from './stats.ts'

export interface Scored {
  scores: Scores
  flags: string[]
  confidence: number | null
}

/** Flags every pack shares: the output against the case's hard settings. */
function commonFlags(subject: ScoreSubject): string[] {
  const flags: string[] = []
  if (!subject.primary) flags.push('no output to judge')
  const range = subject.range
  if (range && subject.primary && (subject.words < range[0] || subject.words > range[1]))
    flags.push(`length: ${subject.words} words, case asks ${range[0]} to ${range[1]}`)
  return flags
}

/**
 * Layer scores (0 to 100), the total, the flags and the judge's confidence for
 * one graded output, from every active pack's stored answers. Pure, so the
 * review tool rescores as a knob moves.
 */
export function scoreResult(
  result: Pick<ReportResult, 'packs' | 'case' | 'primary' | 'artifacts' | 'words' | 'range'>,
  config: BenchConfig,
  scorers: PackScoring[],
): Scored {
  const subject: ScoreSubject = {
    case: result.case,
    primary: result.primary,
    artifacts: result.artifacts,
    words: result.words,
    range: result.range,
  }
  const raw: Record<string, number | null> = {}
  const flags = commonFlags(subject)
  const confidences: number[] = []
  for (const pack of scorers) {
    if (!config.packs.includes(pack.id)) continue
    const answers = result.packs[pack.id] ?? null
    const scored = pack.score(answers, subject, config)
    Object.assign(raw, scored.layers)
    flags.push(...scored.flags)
    const c = pack.confidence(answers)
    if (c !== null) confidences.push(c)
  }
  const present = Object.entries(raw).filter(
    ([layer, v]) => v !== null && (config.weights[layer] ?? 0) > 0,
  ) as Array<[string, number]>
  const total = weighted(present.map(([layer, v]) => [v, config.weights[layer]]))
  const scores: Scores = { total: total === null ? null : Math.round(total * 100) }
  for (const [layer, v] of Object.entries(raw))
    scores[layer] = v === null ? null : Math.round(v * 100)
  return { scores, flags, confidence: mean(confidences) }
}

/** The active packs that mark the case's checks; empty when no judge reads them. */
export const checkReaders = (config: BenchConfig, scorers: PackScoring[]): PackScoring[] =>
  scorers.filter((p) => config.packs.includes(p.id) && p.checks !== null)

/** Layers in display order across the active packs, then total. */
export const layerOrder = (config: BenchConfig, scorers: PackScoring[]): string[] => [
  ...scorers.filter((p) => config.packs.includes(p.id)).flatMap((p) => p.layers),
  'total',
]
