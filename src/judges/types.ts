import type { RenderSize } from '@domain/artifact-address.ts'
import type { PageLayout } from '@domain/layout.ts'
import type { PackScoring } from '@domain/pack.ts'
import type { Rule } from '@domain/rules.ts'
import type { Artifact, BenchConfig, Case, TranscriptEvent } from '@domain/schemas.ts'
import type { Unit } from '@domain/text.ts'
import type { Readable, RequestImage } from './images.ts'
import type { Jev } from './jev.ts'

/** One output as a pack sees it. */
export interface JudgeInput {
  /** The copy judged: front matter and comments removed. Empty for a non-text artifact. */
  text: string
  /** The copy's prose and list units, for a Markdown output: what a word range counts. */
  units: Unit[]
  case: Case | null
  /** The pictures the case's request came with, which Jev sees beside it. */
  images: RequestImage[]
  rules: Rule[]
  /**
   * The SKILL.md the rules were read from, whole: a rule is asked under its
   * heading, beside the skill that says what its words mean. Null when the
   * rules are a list in `bench.json`, or there is no SKILL.md.
   */
  skill: string | null
  artifacts: Artifact[]
  primary: Artifact | null
  /**
   * The start of every other text file the agent wrote, by its path: a test
   * beside the code, a script beside a page. A rule or a check may be about
   * any of them. A file that says what the primary one says is left out.
   */
  others: Array<{ file: string; text: string }>
  /**
   * What the agent told the user beside its files (`notes.md`): the choices it
   * made, what needs checking, what it could not do. Null when it wrote none.
   */
  notes: string | null
  transcript: TranscriptEvent[] | null
  /** Absolute path of the sample dir (or the run dir for a legacy file), for code checks. */
  dir: string
  /**
   * The primary page as a browser draws it, at each of `RENDER_SIZES`: given
   * to a pack that asks for them (`JudgePack.renders`), when the primary
   * artifact is HTML and the host has a browser to draw with. Empty otherwise.
   */
  renders: PageShot[]
  /**
   * A picture the agent made whose sides Jev does not read, drawn again inside
   * them: the copy Jev looks at in place of `file`. Absent when the picture
   * fits as it is, or the host has no browser to draw with.
   */
  fitted?: FittedPicture
  /**
   * The page beside a picture that is the work, when the page draws that same
   * picture: what was measured on the page then holds for the picture. Absent
   * when there is no such page, the two differ, or the host has no browser.
   */
  source?: SourcePage
}

/** The page a picture was made from, as the app drew and measured it. */
export interface SourcePage {
  /** The sample-relative path of the page. */
  file: string
  /** The window the page was drawn in to make the same picture. */
  window: [number, number]
  /** How many times larger the picture is than that window: 2 for an export at 2x. */
  times: number
  /** The elements the page drew there; null when it could not be measured. */
  layout: PageLayout | null
}

/** A picture drawn again at a size Jev reads. */
export interface FittedPicture {
  /** The sample-relative path of the picture it is a copy of. */
  file: string
  /** The size of the picture itself, which the copy does not have. */
  pixels: [number, number]
  read: Readable
}

/** The page drawn at one size, read for Jev, or why it could not be. */
export interface PageShot {
  size: RenderSize
  read: Readable
  /** The elements the page drew at this size, as the window measured them; null when it was not measured. */
  layout: PageLayout | null
}

/** How a check command ended. */
export interface CommandResult {
  exit: number | null
  /** What it printed, from the start; a command that prints without end is cut off. */
  stdout: string
  /** The last part of stdout and stderr, for a flag. */
  tail: string
  timedOut: boolean
}

/**
 * Runs one shell command line to its end, with `input` on its stdin, for
 * `timeoutMs` at most. Whoever grades supplies it: a judge starts no process
 * itself.
 */
export type CommandRunner = (
  command: string,
  options: { cwd: string; timeoutMs: number; input?: string },
) => Promise<CommandResult>

export interface JudgeContext {
  jev: Jev
  /** False when grading without TypeSafe: packs run their code checks and leave judged layers null. */
  useJev: boolean
  config: BenchConfig
  /** Absolute path of the skill being graded; a check's picture is read from here. */
  skillDir: string
  log: (line: string) => void
  /** The grading was stopped: a request on its way to Jev is ended, so it is not waited for or paid for. */
  signal?: AbortSignal
  /** Runs a case's check command; the code pack fails without it. */
  run?: CommandRunner
}

/**
 * A judge pack: the pure scorer plus the questions and code checks that
 * produce its raw answers. `judge` returns null when the pack has nothing to
 * say about this artifact; the scorer then leaves its layers out.
 */
export interface JudgePack<Raw = unknown> extends PackScoring<Raw> {
  /**
   * Which reading of the output this is. The judge cache keeps the whole of
   * what `judge` returns under it, Jev's answers and what code measured alike.
   * Raise it when a question's wording, the pack's reading of an answer, or
   * any code-measured part the cache stores changes (a count, a path read
   * from a transcript), so a reading kept from before is not taken for one of
   * this.
   */
  version: number
  label: string
  /** The pack looks at an HTML page as drawn: grading draws it first, when it can (`JudgeInput.renders`). */
  renders?: boolean
  /**
   * Whether the pack has a question for this output. Without it the pack
   * always has. Grading draws no page for a pack that has none.
   */
  asks?(input: JudgeInput): boolean
  /**
   * The pack reads its answer off the machine: a command's exit code, which
   * rests on tools and files no hash of the output covers and costs nothing to
   * read again. Every grading runs such a pack, and the judge cache keeps none
   * of its answers.
   */
  live?: boolean
  /**
   * The pack judges the sample's folder, not one file of it. It runs on every
   * sample that has a folder, whatever its primary artifact, and its
   * `artifacts` say only which file is the work. Without this, a pack with
   * `artifacts` runs when the primary artifact is one of them.
   */
  wholeSample?: boolean
  judge(input: JudgeInput, ctx: JudgeContext): Promise<Raw | null>
  /** Front matter and body a new anchors file starts from. */
  anchorsTemplate?: string
}
