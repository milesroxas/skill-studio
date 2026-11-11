import {
  type Corrections,
  NO_CORRECTIONS,
  noOutput,
  type PackScoring,
  type ScoreSubject,
  type Verdict,
} from './pack.ts'
import type { BenchConfig, ReportResult, Scores } from './schemas.ts'
import { mean, weighted } from './stats.ts'
import { finding } from './verdict.ts'

export interface Scored {
  scores: Scores
  flags: string[]
  /** Every fact the scores were counted from, the reader's corrections applied. */
  verdicts: Verdict[]
  confidence: number | null
}

/** What an output with nothing in it is flagged with: no file, or a file that says nothing. */
const NO_OUTPUT = 'no output to judge'

/** A layer's share held to 0 to 1 whatever a pack returned; null when it is not a number at all. */
const share = (value: number | null): number | null =>
  value === null || !Number.isFinite(value) ? null : Math.min(1, Math.max(0, value))

/** "1600 × 900 px". */
export const pixelText = ([width, height]: [number, number]): string => `${width} × ${height} px`

/** Flags every pack shares: the output against the case's hard settings. */
function commonFlags(subject: ScoreSubject): string[] {
  const flags: string[] = []
  const empty = noOutput(subject)
  if (empty) flags.push(NO_OUTPUT)
  const range = subject.range
  if (range && !empty && (subject.words < range[0] || subject.words > range[1]))
    flags.push(`length: ${subject.words} words, case asks ${range[0]} to ${range[1]}`)
  // A picture is held to the case's size exactly; a page is drawn at that size instead.
  const { size, pixels } = subject
  if (size && !empty && subject.primary?.kind === 'image') {
    if (!pixels)
      flags.push(`size: the picture's size could not be read, case asks ${pixelText(size)}`)
    else if (pixels[0] !== size[0] || pixels[1] !== size[1])
      flags.push(`size: ${pixelText(pixels)}, case asks ${pixelText(size)}`)
  }
  return flags
}

/**
 * Layer scores (0 to 100), the total, the flags, the verdicts and Jev's
 * confidence for one graded output, from every active pack's stored answers.
 * An output with nothing in it scores 0, in total and on every layer a pack
 * scored, so a failed sample counts as a failure wherever scores are averaged.
 * Each layer is held to 0 to 100 whatever a pack returns, so no setting can
 * take the total past either end. `corrections` are the reader's own answers,
 * which stand over Jev's. Pure, so the page rescores as a setting moves or a
 * verdict is corrected.
 */
export function scoreResult(
  result: Pick<
    ReportResult,
    'packs' | 'case' | 'primary' | 'artifacts' | 'words' | 'range' | 'blank' | 'pixels' | 'size'
  >,
  config: BenchConfig,
  scorers: PackScoring[],
  corrections: Corrections = NO_CORRECTIONS,
): Scored {
  const subject: ScoreSubject = {
    case: result.case,
    primary: result.primary,
    artifacts: result.artifacts,
    words: result.words,
    range: result.range,
    blank: result.blank,
    pixels: result.pixels,
    size: result.size,
  }
  const raw: Record<string, number | null> = {}
  const flags = commonFlags(subject)
  const verdicts: Verdict[] = flags.map(finding)
  const certainties: number[] = []
  const empty = noOutput(subject)
  for (const pack of scorers) {
    if (!config.packs.includes(pack.id)) continue
    const answers = result.packs[pack.id] ?? null
    const scored = pack.score(answers, subject, config, corrections)
    for (const [layer, value] of Object.entries(scored.layers)) {
      const held = share(value)
      raw[layer] = empty && held !== null ? 0 : held
    }
    flags.push(...scored.flags)
    verdicts.push(...scored.verdicts)
    certainties.push(...pack.certainties(answers))
  }
  return { scores: scoresOf(raw, config, empty), flags, verdicts, confidence: mean(certainties) }
}

/**
 * Each layer's share as a score out of 100, and the total: the layers with
 * points, weighted by them. An output with nothing in it totals 0.
 */
function scoresOf(
  shares: Record<string, number | null>,
  config: BenchConfig,
  empty: boolean,
): Scores {
  const present = Object.entries(shares).filter(
    ([layer, v]) => v !== null && (config.weights[layer] ?? 0) > 0,
  ) as Array<[string, number]>
  const total = weighted(present.map(([layer, v]) => [v, config.weights[layer]]))
  const scores: Scores = { total: empty ? 0 : total === null ? null : Math.round(total * 100) }
  for (const [layer, v] of Object.entries(shares))
    scores[layer] = v === null ? null : Math.round(v * 100)
  return scores
}

/** Layers in display order across the active packs, then total. */
export const layerOrder = (config: BenchConfig, scorers: PackScoring[]): string[] => [
  ...scorers.filter((p) => config.packs.includes(p.id)).flatMap((p) => p.layers),
  'total',
]
