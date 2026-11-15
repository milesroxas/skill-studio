import { BASE_PACK } from './config.ts'
import {
  type Corrections,
  NO_CORRECTIONS,
  noOutput,
  type PackScoring,
  packFailure,
  type ScoreSubject,
  UNREADABLE,
  unreadable,
  type Verdict,
} from './pack.ts'
import type { BenchConfig, Report, ReportResult, Scores } from './schemas.ts'
import { mean, weighted } from './stats.ts'
import { finding } from './verdict.ts'

export interface Scored {
  scores: Scores
  flags: string[]
  /** Every fact the scores were counted from, the reader's corrections applied. */
  verdicts: Verdict[]
  confidence: number | null
  /**
   * Why the output has no total until its run is graded again, each reason as
   * a reader reads it: a part of its grading failed, the skill is graded as a
   * kind this grading did not cover, or the grading is behind (`behindOf`).
   * Empty when the total stands, and for an output with nothing in it, which
   * scores 0 however it is graded.
   */
  regrade: string[]
  /**
   * Those of `regrade` that are no failure: the grading is whole, and is of
   * something other than what the output is held to now. A failure is listed
   * among the verdicts; these are said beside the score they withhold.
   */
  stale: string[]
}

/** What an output with nothing in it is flagged with: no file, or a file that says nothing. */
const NO_OUTPUT = 'no output to judge'

/** What a grading of an output would be held to if it were made now. */
export interface GradedNow {
  /** The case's checks and settings as they are (`RunCase.yardstick`); null when the run has no such case. */
  yardstick: string | null
  /** Jev would be asked: a key is set. */
  jev: boolean
}

/**
 * Why a grading is behind what one made now would be, as the start of a line
 * a reader reads ("…, so it has no score"); null when it is not. A grading without Jev marked no rule or check,
 * so with a key it is behind. One made before its case's checks or settings
 * changed counted a total from other facts than the case states now. Either
 * way its total would be set beside totals counted from something else.
 */
export function behindOf(
  graded: { yardstick?: string; model: Report['model'] },
  now: GradedNow,
): string | null {
  if (now.jev && graded.model === null) return 'Graded without Jev'
  if (
    now.yardstick !== null &&
    graded.yardstick !== undefined &&
    graded.yardstick !== now.yardstick
  )
    return 'Graded before its case changed'
  return null
}

/** A pack's kind of work by its name, as Graded as lists it: "Design". */
const kindName = (pack: string): string => pack.charAt(0).toUpperCase() + pack.slice(1)

/** The flag an output carries for an active pack its grading did not run. */
const packUngradedFlag = (pack: string): string => `${pack} pack not graded`

/** What a reader reads of an output whose grading did not cover a kind the skill is graded as. */
const ungradedText = (pack: string): string =>
  pack === BASE_PACK ? 'Rules and checks are not marked yet' : `Not graded as ${kindName(pack)} yet`

/** A layer's share held to 0 to 1 whatever a pack returned; null when it is not a number at all. */
const share = (value: number | null): number | null =>
  value === null || !Number.isFinite(value) ? null : Math.min(1, Math.max(0, value))

/** "1600 × 900 px". */
export const pixelText = ([width, height]: [number, number]): string => `${width} × ${height} px`

/** Flags every pack shares: the output against the case's hard settings. */
function commonFlags(subject: ScoreSubject): string[] {
  const flags: string[] = []
  if (unreadable(subject)) return [UNREADABLE]
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
 * Each layer is held to 0 to 100 whatever a pack returns, so no setting can
 * take the total past either end. `corrections` are the reader's own answers,
 * which stand over Jev's. Pure, so the page rescores as a setting moves or a
 * verdict is corrected.
 *
 * An output with nothing in it scores 0, in total and on every layer a pack
 * scored, so a failed sample counts as a failure wherever scores are averaged.
 * It is scored from that one fact: what a pack counted about the run is no
 * verdict of it.
 *
 * An output one of the active packs failed on (`packFailure` among the flags
 * its grading left) has no total: one counted from the layers that were left
 * would read as a score of the whole. Its other layers stand, and its flags
 * and verdicts open with the failure.
 *
 * An output that stands on a file Jev cannot read (`unreadable`) has no
 * total either, and nothing to grade again: its one verdict says so.
 *
 * The same holds for an active pack the grading never ran, which is one ticked
 * since: `packs` has no entry for it, where a pack that ran and had nothing to
 * say of the output left a null. And it holds for a grading that is `behind`
 * what one made now would be (`behindOf`). In each case the total would be
 * counted from other parts than the totals beside it, so there is none until
 * the run is graded again (`Scored.regrade`).
 */
export function scoreResult(
  result: Pick<
    ReportResult,
    | 'packs'
    | 'case'
    | 'primary'
    | 'artifacts'
    | 'words'
    | 'range'
    | 'blank'
    | 'pixels'
    | 'size'
    | 'flags'
  >,
  config: BenchConfig,
  scorers: PackScoring[],
  corrections: Corrections = NO_CORRECTIONS,
  behind: string | null = null,
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
  // A pack since unticked is not counted, so its failure takes nothing away.
  const failed = result.flags.flatMap((flag) => {
    const failure = packFailure(flag)
    return failure && config.packs.includes(failure.pack) ? [{ flag, ...failure }] : []
  })
  const common = commonFlags(subject)
  const empty = noOutput(subject)
  // A file Jev cannot read has no score, and no grading again would give it one.
  const unread = unreadable(subject)
  // An empty output scores 0 whatever it is graded on, so nothing is owed to it.
  const stale =
    empty || unread
      ? []
      : [
          ...scorers
            .filter((p) => config.packs.includes(p.id) && !Object.hasOwn(result.packs, p.id))
            .map((p) => ({ flag: packUngradedFlag(p.id), text: ungradedText(p.id) })),
          ...(behind ? [{ flag: behind, text: behind }] : []),
        ]
  const failures = failed.map((f) => `Grading failed: ${f.reason}`)
  const flags = [...failed.map((f) => f.flag), ...stale.map((s) => s.flag), ...common]
  const verdicts: Verdict[] = [...failures.map(finding), ...common.map(finding)]
  const certainties: number[] = []
  for (const pack of scorers) {
    if (!config.packs.includes(pack.id)) continue
    const answers = result.packs[pack.id] ?? null
    const scored = pack.score(answers, subject, config, corrections)
    for (const [layer, value] of Object.entries(scored.layers)) {
      const held = share(value)
      raw[layer] = unread ? null : empty && held !== null ? 0 : held
    }
    if (unread) continue
    flags.push(...scored.flags)
    if (!empty) verdicts.push(...scored.verdicts)
    certainties.push(...pack.certainties(answers))
  }
  const owed = empty || unread ? [] : [...failures, ...stale.map((s) => s.text)]
  const total = empty ? 0 : unread || owed.length ? null : totalOf(raw, config)
  return {
    scores: scoresOf(raw, total),
    flags,
    verdicts,
    confidence: mean(certainties),
    regrade: owed,
    stale: stale.map((s) => s.text),
  }
}

/** The total out of 100: the layers with points, weighted by them; null when none of those was scored. */
function totalOf(shares: Record<string, number | null>, config: BenchConfig): number | null {
  const present = Object.entries(shares).filter(
    ([layer, v]) => v !== null && (config.weights[layer] ?? 0) > 0,
  ) as Array<[string, number]>
  const total = weighted(present.map(([layer, v]) => [v, config.weights[layer]]))
  return total === null ? null : Math.round(total * 100)
}

/** Each layer's share as a score out of 100, under the total. */
function scoresOf(shares: Record<string, number | null>, total: number | null): Scores {
  const scores: Scores = { total }
  for (const [layer, v] of Object.entries(shares))
    scores[layer] = v === null ? null : Math.round(v * 100)
  return scores
}

/** Layers in display order across the active packs, then total. */
export const layerOrder = (config: BenchConfig, scorers: PackScoring[]): string[] => [
  ...scorers.filter((p) => config.packs.includes(p.id)).flatMap((p) => p.layers),
  'total',
]
