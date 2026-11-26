/**
 * Read models: the shapes the application hands to every interface (the
 * desktop app, the HTTP API, the CLI). Pure types, so the renderer imports
 * them without touching Node.
 */
import type { Rule } from './rules.ts'
import type {
  Artifact,
  BenchConfig,
  Case,
  GradedWith,
  Report,
  Reviews,
  RunMeta,
} from './schemas.ts'

export interface SkillInfo {
  path: string
  name: string
  description: string
}

/** One output as the grader and the UI see it. */
export interface Sample {
  /** Sample dir name, or the legacy file name. */
  name: string
  /** Absolute dir holding the artifacts: the sample dir, or the run dir for a legacy file. */
  path: string
  artifacts: Artifact[]
  hasTranscript: boolean
  legacy: boolean
  /**
   * The sample's agent did not run to its end, in a run that lists its
   * samples: the run recorded that a stop ended it (`stopped`), or that it
   * failed with no stop (`failed`: the time limit, an error, never begun), or never
   * recorded it at all (`unlisted`), which is a sample still being written or
   * one whose agent was cut off when the app quit or crashed. Grading leaves
   * out all three. Absent for a sample whose agent ended by itself.
   */
  cut?: 'stopped' | 'failed' | 'unlisted'
}

/**
 * A case as one run takes it: what its agents were asked, and what a grading
 * of the run now holds their outputs to.
 */
export interface RunCase {
  /**
   * A fingerprint of what the run's agents were asked: the prompt and the
   * files that came with it. Two runs with the same one answered the same
   * thing, so only their scores are set against each other.
   */
  ask: string
  /** A fingerprint of what a grading now holds an output to: the case's checks and its settings. */
  yardstick: string
  /**
   * The run's own copy of the case, when the skill no longer asks what the run
   * was asked: its prompt or its files changed since, or the case is gone.
   * The run is graded on this copy. Null while the skill's case is the one
   * the run answered.
   */
  earlier: Case | null
}

export interface RunView {
  name: string
  meta: RunMeta | null
  report: Report | null
  samples: Sample[]
  hasSkill: boolean
  /**
   * Each case the run takes, by id (`RunCase`). A case since deleted is absent
   * for a run that kept no copy of its cases.
   */
  cases: Record<string, RunCase>
  /**
   * The run kept its cases and that file does not read whole (`readKept`), so
   * a case it lost is read as it is now. Absent for a run whose file reads,
   * and for one made before runs kept their cases.
   */
  casesDamaged?: boolean
}

export interface SkillVersion {
  version: string
  name: string
  hash: string
  note: string
  date: string | undefined
  /** Saved by hand with its files, so it can be restored; otherwise known only from its runs. */
  saved: boolean
  /**
   * No copy kept of it holds all it was stamped with: SKILL.md and references
   * are kept, its scripts and other files are not, so a run of it gets none.
   * Absent for a version kept whole.
   */
  partial?: boolean
}

export interface SkillVersions {
  versions: SkillVersion[]
  current: SkillVersion & { changed: boolean }
}

/** Front matter fields of a legacy output or an anchor. */
export interface FileHead {
  case: string | null
  label: string | null
  tests: string[]
}

/** What the UI and CLI show about an engine. */
export interface EngineInfo {
  id: string
  label: string
  harness: 'agent' | 'api'
  efforts: string[]
  models: string[]
  defaultModel: string
  available: boolean
  hint: string
  /** The agent keeps to the tools a case allows (`allowed_tools`). */
  limitsTools: boolean
}

/** A run, a grading, or the assistant reading a case's answers to suggest checks. */
export type JobKind = 'generate' | 'grade' | 'read'
/** `stopped`: the reader ended it before it finished; it did not fail, and it did not do what it set out to. */
export type JobStatus = 'running' | 'done' | 'failed' | 'stopped'

/** How far a job has come, in the units it counts: outputs written, for a run. */
export interface JobProgress {
  done: number
  total: number
}

export interface Job {
  id: number
  kind: JobKind
  title: string
  status: JobStatus
  log: string[]
  startedAt: number
  finishedAt: number | null
  /** The skill folder the job works on, so a list of skills can show it running. */
  skillPath: string | null
  /** Set by a job that knows its size before it starts; null for one that does not. */
  progress: JobProgress | null
  /** The runs of `skillPath` this job is grading now, so a Regrade of one can show it busy. */
  grading: string[]
  /** The runs of `skillPath` this job is writing now: those cannot be graded until it is done. */
  writing: string[]
}

/** Everything a skill's workspace shows, loaded in one call. */
export interface State {
  skill: SkillInfo
  /** This is the practice skill, so the shell walks the reader round the loop. */
  practice: boolean
  /** The walkthrough's look steps the reader has opened; empty for any other skill. */
  practiceSeen: string[]
  /** The lock file's source when a tool installed this skill: an update from there replaces its folder. */
  source: string | null
  skills: SkillInfo[]
  cases: Case[]
  runs: RunView[]
  versions: SkillVersions
  engines: EngineInfo[]
  reviews: Reviews
  config: BenchConfig
  savedConfig: Partial<BenchConfig>
  rules: Rule[]
  jevKey: boolean
  /**
   * What a grading made here now grades with: the version of every pack's
   * questions, by id, the Jev model, and whether this host draws pages
   * (`drawn`: the desktop app does, and `st serve` does when it can start
   * the drawing host).
   */
  grading: GradedWith
  paths: { bench: string; reviews: string }
}

/** A delete the trash can still undo, as the app lists it, the newest first. */
export interface TrashedDelete {
  /** Names the entry, for `undeleteVersion` or `undeleteRun`. */
  undo: string
  kind: 'run' | 'version'
  /** The version, or the run's name. */
  name: string
  /** The version a run was made with; the version itself for a version's delete. */
  version: string
  deletedAt: string
}
