import type { PackScoring } from '@domain/pack.ts'
import type { Rule } from '@domain/rules.ts'
import type { Artifact, ArtifactKind, BenchConfig, Case, TranscriptEvent } from '@domain/schemas.ts'
import type { Unit } from '@domain/text.ts'
import type { RequestImage } from './images.ts'
import type { Jev } from './jev.ts'

/** One output as a pack sees it. */
export interface JudgeInput {
  /** The copy judged: front matter and comments removed. Empty for a non-text artifact. */
  text: string
  units: Unit[]
  title: string | null
  case: Case | null
  /** The pictures the case's request came with, which Jev sees beside it. */
  images: RequestImage[]
  rules: Rule[]
  /** Evidence file texts by skill-relative path. */
  evidence: Record<string, string>
  artifacts: Artifact[]
  primary: Artifact | null
  transcript: TranscriptEvent[] | null
  /** Absolute path of the sample dir (or the run dir for a legacy file), for code checks. */
  dir: string
}

/** How a check or lint command ended. */
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
  /** Absolute path of the skill being graded; lint and check commands run from here. */
  skillDir: string
  log: (line: string) => void
  /** Runs a pack's check or lint command; a pack that needs one fails without it. */
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
   * any code-measured part the cache stores changes (a markup check, a count,
   * a path read from a transcript), so a reading kept from before is not taken
   * for one of this.
   */
  version: number
  label: string
  /** Artifact kinds this pack can judge; empty means any sample, with or without an artifact. */
  artifacts: ArtifactKind[]
  judge(input: JudgeInput, ctx: JudgeContext): Promise<Raw | null>
  /** Front matter and body a new anchors file starts from. */
  anchorsTemplate?: string
}
