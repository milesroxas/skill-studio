/**
 * Shared types for Skill Studio. Pure: no Node imports, so the browser, the
 * server and the CLI all read the same shapes.
 */

import type { GradingCost } from './cost.ts'
import type { ImageRef } from './image.ts'
import type { InputUpload } from './inputs.ts'

const ARTIFACT_KINDS = ['markdown', 'html', 'image', 'code', 'transcript'] as const
/**
 * What an output file is. `other` is a file that does not read as text and is
 * no page or picture, such as a PDF: Jev cannot read it, so an output that
 * stands on one has no score. A case cannot name it as the kind it is graded as.
 */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number] | 'other'
export const isArtifactKind = (value: unknown): value is ArtifactKind =>
  (ARTIFACT_KINDS as readonly unknown[]).includes(value)

export const CONFIGURATIONS = ['with_skill', 'without_skill', 'old_skill'] as const
/** Which skill the generating agent saw. `old_skill` points at a snapshot directory. */
export type Configuration = (typeof CONFIGURATIONS)[number]

/** One `graders/NN-*.md` statement, or one legacy `expectations` line. */
export interface Grader {
  id: string
  type: string
  focus: string | null
  weight: number
  statement: string
  /** Skill-relative path of the picture the statement is about, such as a mock-up to match. */
  image: string | null
}

/** The optional `bench` block of `case.yaml` (or of a legacy `evals.json` entry). */
export interface CaseBench {
  artifact?: ArtifactKind
  /** Command whose exit code is a hard layer (code pack). */
  check?: string
  /** Word range the primary output should fall in. */
  words?: [number, number]
  /** The output is a page meant to work on a phone: the design pack also judges it drawn 390 px wide. */
  phone?: boolean
  /**
   * Width and height in pixels. A picture must be exactly this size; a page
   * is drawn at this size for the judge and opens at this width on Results.
   */
  size?: [number, number]
  /** `false` skips Jev for this case. */
  judge?: boolean
  [key: string]: unknown
}

export interface CaseSettings {
  tags: string[]
  maxTurns: number | null
  timeoutSeconds: number | null
  allowedTools: string[] | null
}

export interface Case {
  /** Stable key: the folder name, or `<id>-<name>` for a legacy entry. */
  id: string
  /** Numeric id of a legacy `evals.json` entry. */
  legacyId: number | string | null
  title: string
  prompt: string
  expectedOutcome: string
  /** Skill-relative input file paths. */
  files: string[]
  graders: Grader[]
  settings: CaseSettings
  bench: CaseBench
  source: 'folder' | 'evals.json'
  /** Skill-relative folder for a folder case. */
  dir: string | null
}

/** The editable part of a folder case. A grader without an id is new. */
export interface CaseDraft {
  id: string
  title: string
  prompt: string
  expectedOutcome: string
  words: [number, number] | null
  /** Judge the page at phone width too (`bench.phone`). Absent in a draft stored before it existed. */
  phone?: boolean
  /** Width and height in pixels (`bench.size`); null for none. Absent in a draft stored before it existed. */
  size?: [number, number] | null
  /**
   * The kind of file graded when an answer has more than one (`bench.artifact`);
   * null for none, which leaves the choice to the app. Absent in a draft stored
   * before it existed.
   */
  artifact?: ArtifactKind | null
  /** Pictures the agent gets with the prompt, which the judge sees too. */
  images: ImageRef[]
  /** Files and folders picked for the agent, copied into the case's `files/` on save. Absent in a draft stored before it existed. */
  added?: InputUpload[]
  /** Names right in the case's `files/` that the save takes out. Absent in a draft stored before it existed. */
  removed?: string[]
  graders: Array<{
    id: string | null
    statement: string
    weight: number
    /** The picture the statement is about; null for a check on the output alone. */
    image: ImageRef | null
  }>
}

/** A skill file being edited: its text now, and the text it had on disk (null when new). */
export interface FileDraft {
  text: string
  previous: string | null
}

/**
 * Unsaved work on one skill, kept outside the skill so it survives a reload or
 * a quit without touching its git history. Cases are keyed by id; a case not
 * saved yet is under NEW_CASE_KEY.
 */
export interface SkillDrafts {
  files: Record<string, FileDraft>
  cases: Record<string, CaseDraft>
  /**
   * When each drafted case was saved as its draft began, by draft key (null
   * for a case not saved yet), so a save over a case changed since is refused.
   */
  caseBases?: Record<string, string | null>
  updatedAt: string | null
}

export const NEW_CASE_KEY = '+new'

export const emptyDrafts = (): SkillDrafts => ({ files: {}, cases: {}, updatedAt: null })

/** Everything in `evals/bench.json`, after defaults. Packs add their own keys. */
export interface BenchConfig {
  /** Judge packs that apply, in order. */
  packs: string[]
  /** Adherence rules; `null` parses them from SKILL.md bullets. */
  rules: string[] | null
  /** Points per layer. Layers a pack does not score are left out and the rest rescale. */
  weights: Record<string, number>
  /** A Noul at or above this reads as yes. */
  yes: number
  /** A Noul at or below this reads as no. One between the two is no answer, and counts in no layer. */
  no: number
  [key: string]: unknown
}

export type TranscriptKind = 'system' | 'text' | 'thinking' | 'tool' | 'result' | 'error'

/** One line of `transcript.jsonl`, the same shape for every engine. */
export interface TranscriptEvent {
  step: number
  /** Milliseconds since the run started. */
  at: number
  kind: TranscriptKind
  tool?: string
  /** One-line summary of the tool's arguments. */
  args?: string
  /**
   * A short hash of the tool's whole input. The one-line summary leaves out an
   * edit's text and a read's offset, so this is what tells two calls apart.
   * Absent from a transcript written before it was kept.
   */
  call?: string
  /** One-line summary of the tool's result. */
  result?: string
  durationMs?: number
  text?: string
  error?: boolean
}

export interface Writer {
  engine: string
  model: string | null
  effort: string | null
  harness: 'agent' | 'api'
}

export interface Tokens {
  input: number
  output: number
}

/** `timing.json` inside a sample dir. */
export interface Timing {
  startedAt: string
  finishedAt: string
  durationMs: number
  costUsd: number | null
  tokens: Tokens | null
  model: string | null
}

/** Why a sample's agent did not run to its end, in words that follow "It". */
export type SampleFailure = 'ran out of time' | 'could not start' | 'ended with an error'

export interface SampleMeta {
  /** Sample directory name: `<case>-s<n>`. */
  dir: string
  case: string
  index: number
  /** It left at least one output file. */
  ok: boolean
  seconds: number
  costUsd: number | null
  tokens: Tokens | null
  model: string | null
  error: string | null
  steps: number
  toolCalls: number
  /**
   * The run was stopped, or the app quit, while this sample ran, and that
   * ended its agent before it finished. What it left, nothing or half a file,
   * says nothing of the skill, so grading leaves it out.
   */
  stopped?: boolean
  /**
   * Its agent did not run to its end by itself, and no stop ended it: the time
   * limit did (`ran out of time`), it never began (`could not start`: the CLI
   * was missing, or refused the model), or the CLI ended with an error (`ended
   * with an error`: signed out, a usage limit, a refusal). The words open with
   * "It" in a sentence; `error` holds the CLI's own. What it left, nothing or
   * a file, is no whole answer, so grading leaves it out as a stopped one.
   */
  failed?: SampleFailure
  /**
   * The files under `outputs/` when the agent ended, by sample-relative path:
   * what it wrote. A file put there later, such as one a check command builds,
   * is not an output. Absent for a sample of a run that kept no list.
   */
  outputs?: string[]
}

/** `run.json`. */
export interface RunMeta {
  name: string
  skillPath: string
  skillVersion: string
  skillName: string
  skillHash: string
  note: string
  writer: Writer
  configuration: Configuration
  /** The snapshot an `old_skill` run was generated against. */
  baselineDir: string | null
  cases: string[]
  samplesPerCase: number
  createdAt: string
  finishedAt: string | null
  samples: SampleMeta[]
  /** Legacy runs from the reference tool carry a flat file list instead of sample dirs. */
  legacy?: boolean
}

export interface Artifact {
  /** Path relative to the sample dir (or the run dir for a legacy flat file). */
  file: string
  kind: ArtifactKind
}

export interface Scores {
  [layer: string]: number | null
  total: number | null
}

/** One graded sample. `packs` holds each pack's raw answers; scores are derived in core. */
export interface ReportResult {
  /** Sample dir name, or the legacy file name. */
  sample: string
  case: string | null
  /** Anchor label (good, bad) when grading anchors. */
  label: string | null
  /** Layers a bad anchor was written to fail. */
  tests: string[]
  artifacts: Artifact[]
  /** The artifact the packs judged. */
  primary: Artifact | null
  words: number
  /**
   * The file judged holds no character but whitespace, so the output scores 0
   * (`noOutput` in pack.ts). A report written before grading kept this has
   * none, and there only a missing file reads as no output.
   */
  blank?: boolean
  range: [number, number] | null
  /** The pixel size of the picture judged, when the output is a picture whose size could be read. */
  pixels?: [number, number] | null
  /** The size the case asked for (`bench.size`), as it stood at grading. */
  size?: [number, number] | null
  /**
   * A fingerprint of what the output was held to: its case's checks and
   * settings as they stood at grading (`RunCase.yardstick`). A grading whose
   * fingerprint is no longer the case's is behind it, and its total does not
   * stand. A report written before gradings kept one has none.
   */
  yardstick?: string
  /**
   * What graded the output (`GradedWith`). A grading made with other questions,
   * another Jev model or without the page drawn is behind one made now, and
   * its total does not stand. A report written before gradings kept it has
   * none, and stands.
   */
  graded?: GradedWith
  /** Raw pack answers keyed by pack id. Thresholds apply later, in core. */
  packs: Record<string, unknown>
  scores: Scores
  flags: string[]
  /** Mean certainty of the judge's Nouls, 0 to 1. */
  confidence: number | null
}

/** What graded an output, or what a grading made now would grade it with. */
export interface GradedWith {
  /** The Jev model asked; null without Jev. */
  model: string | null
  /** The version of the questions of each pack that judged it, by pack id. */
  packs: Record<string, number>
  /**
   * The page or picture Jev looked at was drawn by the host. Absent when
   * nothing of the output was for drawing, so it was judged the same anywhere.
   */
  drawn?: boolean
  /**
   * A fingerprint of the settings of `bench.json` each pack read as it judged,
   * by pack id: the rules `bench.json` lists, the transcript lines the
   * workflow pack reads, the code pack's check settings. Only a pack that has
   * such settings is named. Absent in a report written before gradings kept it.
   */
  settings?: Record<string, string>
}

export interface Report {
  createdAt: string
  model: string | null
  /**
   * The input tokens of Jev's answers the report holds, in all: those this
   * grading asked for and those kept from an earlier one, each answer once.
   * An answer kept by Skill Studio 0.14.0 or earlier counts none.
   */
  inputTokens: number
  /** How long this grading took, in seconds. */
  seconds: number
  /**
   * What this grading asked Jev: how many questions, and the input tokens
   * they cost. Absent in a report written before reports said it.
   */
  asked?: { questions: number; inputTokens: number }
  /**
   * What the gradings of these outputs that wrote a report cost: every model
   * call each made, this one's added to what the report it replaced kept, so
   * a grading again that asks nothing new still counts what was spent before.
   * Not whole (`whole: false`) where that report kept none. Absent in a report
   * written before reports kept it.
   */
  gradingCost?: GradingCost
  /**
   * What the grading was told to lay over `bench.json`: the packs `st grade
   * --packs` named, and the file `--bench` gave. Absent for a grading made
   * under `bench.json` alone.
   */
  overrides?: { packs?: string[]; bench?: Partial<BenchConfig> }
  config: BenchConfig
  packs: string[]
  results: ReportResult[]
}

/** What the reader said about one output: their own answers where Jev's verdict was wrong. */
export interface Review {
  /** By verdict id: true when the output meets the rule or check, false when it does not. */
  corrections: Record<string, boolean>
  updatedAt: string
}

/** `evals/reviews.json`, as the app reads it. */
export interface Reviews {
  reviews: Record<string, Review>
}
