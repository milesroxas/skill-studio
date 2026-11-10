import type { Artifact, BenchConfig } from './schemas.ts'

/** What a pack's scorer knows about the output besides its own raw answers. */
export interface ScoreSubject {
  case: string | null
  primary: Artifact | null
  artifacts: Artifact[]
  words: number
  range: [number, number] | null
  /** The file judged holds nothing but whitespace (`ReportResult.blank`). */
  blank?: boolean
}

/**
 * The output has nothing in it to judge: the agent wrote no file, or the file
 * it wrote holds no character but whitespace. A file with no word in it, such
 * as `{}`, is an output, and so is a picture. Such an output scores 0,
 * whatever a pack could still count about the run.
 */
export const noOutput = (subject: Pick<ScoreSubject, 'primary' | 'blank'>): boolean =>
  !subject.primary || (subject.primary.kind !== 'image' && subject.blank === true)

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
  /** Jev's own answer under the scoring in hand. */
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
  /** Layers this pack scores, in display order. */
  layers: string[]
  /** The layer that marks the case's checks, one of `layers`; null when the pack reads none. */
  checks: string | null
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
