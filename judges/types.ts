import type { PackScoring } from '@core/pack.ts'
import type { Rule } from '@core/rules.ts'
import type {
  Artifact,
  ArtifactKind,
  BenchConfig,
  Case,
  TranscriptEvent,
  Vote,
} from '@core/schemas.ts'
import type { Unit } from '@core/text.ts'
import type { Jev } from '@server/jev.ts'

/** One output as a pack sees it. */
export interface JudgeInput {
  /** The copy judged: front matter and comments removed. Empty for a non-text artifact. */
  text: string
  units: Unit[]
  title: string | null
  case: Case | null
  rules: Rule[]
  /** Evidence file texts by skill-relative path. */
  evidence: Record<string, string>
  artifacts: Artifact[]
  primary: Artifact | null
  transcript: TranscriptEvent[] | null
  /** Absolute path of the sample dir (or the run dir for a legacy file), for code checks. */
  dir: string
}

export interface JudgeContext {
  jev: Jev
  /** False when grading without TypeSafe: packs run their code checks and leave judged layers null. */
  useJev: boolean
  config: BenchConfig
  /** Absolute path of the skill being graded; lint and check commands run from here. */
  skillDir: string
  log: (line: string) => void
}

export interface PairwiseVote {
  vote: Vote
  confidence: number
}

/**
 * A judge pack: the pure scorer plus the questions and code checks that
 * produce its raw answers. `judge` returns null when the pack has nothing to
 * say about this artifact; the scorer then leaves its layers out.
 */
export interface JudgePack<Raw = unknown> extends PackScoring<Raw> {
  label: string
  /** Artifact kinds this pack can judge; empty means any sample, with or without an artifact. */
  artifacts: ArtifactKind[]
  judge(input: JudgeInput, ctx: JudgeContext): Promise<Raw | null>
  /** One Choice per criterion over two outputs; fed to Bradley-Terry in core. */
  pairwise?(
    a: JudgeInput,
    b: JudgeInput,
    criteria: string[],
    ctx: JudgeContext,
  ): Promise<Record<string, PairwiseVote>>
  /** Front matter and body a new anchors file starts from. */
  anchorsTemplate?: string
}
