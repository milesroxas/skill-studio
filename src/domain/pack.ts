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
  /** Whether the output meets it: the reader's own answer where they gave one, else the pack's. */
  met: boolean
  /** The layer of the score it counts in; null for a finding that counts in none. */
  layer: string | null
  /** A rule's section of SKILL.md. */
  section?: string
  /** A check's weight, when it counts more than once. */
  weight?: number
}

/** A fact Jev answered, so the reader may answer it themselves. */
export interface JudgedVerdict extends VerdictBase {
  open: true
  /** Jev's own answer under the skill's scoring. */
  jev: boolean
  /** The reader answered it. Their answer stands whether or not it agrees with Jev's. */
  corrected: boolean
}

/** A fact code measured. It has no answer of Jev's, and nobody corrects a count. */
export interface MeasuredVerdict extends VerdictBase {
  open: false
  jev?: undefined
  corrected: false
}

export type Verdict = JudgedVerdict | MeasuredVerdict

/** The reader's own answers on one output, by verdict id: true when the output meets it. */
export type Corrections = Readonly<Record<string, boolean>>

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
   */
  certainties(raw: Raw | null): number[]
}
