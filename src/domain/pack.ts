import type { NoAnswer, Seen } from './exact.ts'
import type { ExactTest } from './rule-reading.ts'
import type { Artifact, ArtifactKind, BenchConfig } from './schemas.ts'

/** What a pack's scorer knows about the output besides its own raw answers. */
export interface ScoreSubject {
  case: string | null
  primary: Artifact | null
  artifacts: Artifact[]
  words: number
  range: [number, number] | null
  /** The file judged holds nothing but whitespace (`ReportResult.blank`). */
  blank?: boolean
  /** The picture's pixel size (`ReportResult.pixels`). */
  pixels?: [number, number] | null
  /** The size the case asked for (`ReportResult.size`). */
  size?: [number, number] | null
}

/**
 * The output has nothing in it to judge: the agent wrote no file, or the file
 * it wrote holds no character but whitespace. A file with no word in it, such
 * as `{}`, is an output, and so is a picture. Such an output scores 0,
 * whatever a pack could still count about the run.
 */
export const noOutput = (subject: Pick<ScoreSubject, 'primary' | 'blank'>): boolean =>
  !subject.primary || (subject.primary.kind !== 'image' && subject.blank === true)

/**
 * The output stands on a file Jev cannot read, such as a PDF (`other`). It is
 * an output, so it is not 0, and no pack judged it, so it has no score.
 */
export const unreadable = (subject: Pick<ScoreSubject, 'primary'>): boolean =>
  subject.primary?.kind === 'other'

/** What an output on a file Jev cannot read is flagged with, and its one verdict. */
export const UNREADABLE = 'a kind of file Jev cannot read, so it has no score'

/**
 * Why a grading kept from before is behind the questions a pack asks now, so
 * it has no total until it is graded again. Gradings on disk hold these words
 * as a reason, so they must not change.
 */
export const OLDER_VERSION = 'Graded by an older version of Skill Studio'

/** How a pack that threw while grading is noted among an output's flags: "<pack> pack failed: <why>". */
const PACK_FAILED = /^(\w+) pack failed: ([\s\S]*)$/

/** The flag a grading leaves on an output for a pack that threw; `packFailure` reads it back. */
export const packFailedFlag = (pack: string, reason: string): string =>
  `${pack} pack failed: ${reason}`

/**
 * The pack that failed on an output and why, read from the flag it left; null
 * for any other flag. The pack's layers are null for that reason, so the
 * output has no total until it is graded again.
 */
export function packFailure(flag: string): { pack: string; reason: string } | null {
  const failed = PACK_FAILED.exec(flag)
  return failed ? { pack: failed[1], reason: failed[2] } : null
}

/** A rule of the skill, a check of the case, or anything else a pack measures. */
export type VerdictKind = 'rule' | 'check' | 'other'

/**
 * Why a fact counts in no part of the score. `unsure`: Jev's answer sits
 * between the two thresholds, so it is as likely yes as no, or code read the
 * fact and would not call it (`CodeAnswer.why`). `inapplicable`: the rule
 * stands under a heading for another kind of work than this output is.
 * `unread`: the fact was not answered, because Jev did not read all of the
 * output it needs (a long output asked in parts that cannot settle it).
 * `unmarkable`: a reading says the rule or check is written so nobody can
 * mark it (`Unmarked`), so nobody was asked it. The reader's own answer on any
 * of these makes it count.
 */
export type Aside = 'unsure' | 'inapplicable' | 'unread' | 'unmarkable'

/** Who gave the answer a fact stands on: Jev, code, or the reader's own mark. */
export type Answerer = 'jev' | 'code' | 'reader'

/**
 * What code answered on a fact read by code (`answerExact` in `exact.ts`), and
 * what it saw. `met` is null where it gave no answer, with `why`. `stands` is
 * whether code's answer is the fact's before the reader's: true where it said
 * met or missed, and where it read the fact and would not call it, which sets
 * the fact aside as not sure; false where the reading does not read this
 * output, so Jev's answer stands.
 */
export interface CodeAnswer {
  met: boolean | null
  why: NoAnswer | null
  /** What each test saw, in the order of `tests`; empty where the output was not read at all. */
  saw: Seen[]
  /** The tests code answered, as the reading named them; empty in a reading that kept none. */
  tests: ExactTest[]
  stands: boolean
}

/** Why a rule or a check cannot be marked as written, and the words that would let it be. */
export interface Unmarked {
  /** `vague`: two careful people would mark it differently. `conflict`: it cannot hold beside another rule or check. */
  why: 'vague' | 'conflict'
  /** For a conflict, the words of the other rule or check; null for a vague one, or when the other is no longer there. */
  with: string | null
  /** The rule or check rewritten so it can be marked; null when there is none. */
  fix: string | null
}

/**
 * One fact about an output: a rule it follows or breaks, a check it meets or
 * misses, or another thing a pack measured. The facts are what a score is
 * counted from, so a reader can see which one cost the points.
 */
interface VerdictBase {
  /** Names the fact by its kind and its words, so an edited rule or check is a new fact. */
  id: string
  kind: VerdictKind
  /** The rule, the check, or the finding, as a reader reads it. */
  text: string
  /**
   * Whether the output meets it: the reader's own answer where they gave one,
   * else the pack's. False for a fact set aside, which is neither met nor missed.
   */
  met: boolean
  /** Why the fact counts in no layer; absent for one that is met or missed. */
  aside?: Aside
  /** The layer of the score it counts in; null for a finding that counts in none. */
  layer: string | null
  /** A rule's section of SKILL.md. */
  section?: string
  /** A check's weight, when it counts more than once. */
  weight?: number
}

/**
 * A fact the reader may answer themselves: one Jev answered, or one code
 * answered on a reading a model chose, which can be wrong.
 */
export interface JudgedVerdict extends VerdictBase {
  open: true
  /** Who the answer it stands on is from: the reader's where they gave one, else code's where code's stands, else Jev's. */
  by: Answerer
  /** Jev's own answer under the skill's scoring; null when Jev's answer set the fact aside, or Jev gave none it could stand on (`unread`). */
  jev: boolean | null
  /** What code answered and saw, for a fact read by code; absent for one only Jev was asked. */
  code?: CodeAnswer
  /** The reader answered it. Their answer stands whether or not it agrees with Jev's. */
  corrected: boolean
}

/** A fact code measured. It has no answer of Jev's, and nobody corrects a count. */
export interface MeasuredVerdict extends VerdictBase {
  open: false
  by: 'code'
  jev?: undefined
  code?: undefined
  corrected: false
}

/**
 * A rule or check a reading says nobody can mark as written: nobody was
 * asked it, and it is shown with why and with its fix. It counts in no layer
 * until the reader answers it; their answer counts, as on a fact Jev was not
 * sure of, since the reading is a model's and can be wrong.
 */
export interface UnmarkableVerdict extends VerdictBase {
  open: true
  /** The reader's, where they answered it; null where nobody did. */
  by: 'reader' | null
  /** `unmarkable` until the reader answers it; absent once they have. */
  aside?: 'unmarkable'
  unmarkable: Unmarked
  jev?: undefined
  code?: undefined
  corrected: boolean
}

export type Verdict = JudgedVerdict | MeasuredVerdict | UnmarkableVerdict

/**
 * The answer a fact stood on before the reader's: code's where code's stands,
 * else Jev's; for a fact code measured, its answer. Null where it was set
 * aside or never answered, and for a fact nobody can mark.
 */
export function packAnswer(verdict: Verdict): boolean | null {
  if ('unmarkable' in verdict) return null
  if (!verdict.open) return verdict.met
  return verdict.code?.stands ? verdict.code.met : verdict.jev
}

/**
 * Facts a change between two ends leaves out at both (`changeReading` in
 * `change.ts`), each by `factKey`. Held under a symbol, so no list of the
 * reader's answers ever sees it, and only a change's reading sets it.
 */
export const LEFT_OUT: unique symbol = Symbol('left out')

/**
 * The reader's own answers on one output, by verdict id: true when the output
 * meets it. A change's reading may add the facts it leaves out (`LEFT_OUT`).
 */
export type Corrections = Readonly<Record<string, boolean>> & {
  readonly [LEFT_OUT]?: ReadonlySet<string>
}

export const NO_CORRECTIONS: Corrections = Object.freeze({})

export interface PackScore {
  /** Layer shares, 0 to 1; null leaves the layer out of the total. */
  layers: Record<string, number | null>
  flags: string[]
  /** Every fact the layers and flags were counted from. */
  verdicts: Verdict[]
}

/**
 * The pure half of a judge pack: raw Jev answers in, layer shares, flags and
 * verdicts out. Shared by the server and the browser, so scores follow a
 * scoring setting or a correction without new calls. The server half
 * (questions, code checks) lives in `judges/<pack>/index.ts` and extends this.
 */
export interface PackScoring<Raw = unknown> {
  id: string
  /**
   * Artifact kinds this pack judges; empty means any sample, with or without
   * an artifact. A file of one of these kinds is the work when an output holds
   * several, and the pack runs on the outputs whose primary artifact is one,
   * unless its judge half says it runs on every sample (`JudgePack.wholeSample`).
   */
  artifacts: ArtifactKind[]
  /** Layers this pack scores, in display order. */
  layers: string[]
  /** Points for its layers and its own settings, laid under `bench.json`. */
  defaults: Partial<BenchConfig>
  score(
    raw: Raw | null,
    subject: ScoreSubject,
    config: BenchConfig,
    corrections?: Corrections,
  ): PackScore
  /**
   * How sure Jev was of each answer the pack keeps, 0 to 1 each; empty when it
   * asked none. Every pack's go into one mean, so a pack that asked two
   * questions weighs as two answers, not as much as one that asked twenty.
   * `cuts` are the thresholds scoring reads answers by, for a pack whose
   * answer to one fact is put together from several (`joinParts` in `span.ts`).
   */
  certainties(raw: Raw | null, cuts: Pick<BenchConfig, 'yes' | 'no'>): number[]
  /**
   * Why a reading this pack kept is of less than the pack reads now, so the
   * output has no total until it is graded again, as a reader reads it; null
   * when it stands. Grading does not take such a reading from the judge cache.
   * Absent: every reading stands.
   */
  behind?(raw: Raw | null): string | null
}

/** A fact the output misses: not met, and not set aside. */
export const isMissed = (verdict: Verdict): boolean => !verdict.met && !verdict.aside
