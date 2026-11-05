/**
 * Read models: the shapes the application hands to every interface (the
 * desktop app, the HTTP API, the CLI). Pure types, so the renderer imports
 * them without touching Node.
 */
import type { Rating } from './bradley-terry.ts'
import type { Rule } from './rules.ts'
import type { Artifact, BenchConfig, Case, Report, Reviews, RunMeta } from './schemas.ts'

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
}

export interface RunView {
  name: string
  meta: RunMeta | null
  report: Report | null
  samples: Sample[]
  hasSkill: boolean
}

export interface SkillVersion {
  version: string
  name: string
  hash: string
  note: string
  date: string | undefined
  /** Saved by hand with its files, so it can be restored; otherwise known only from its runs. */
  saved: boolean
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

export interface AnchorInfo extends FileHead {
  file: string
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
}

export type JobKind = 'generate' | 'grade' | 'pairwise'
export type JobStatus = 'running' | 'done' | 'failed'

export interface Job {
  id: number
  kind: JobKind
  title: string
  status: JobStatus
  log: string[]
  startedAt: number
  finishedAt: number | null
}

export interface Leaderboard {
  boards: Record<string, { jev: Rating[]; human: Rating[] }>
  agreement: { agreed: number; compared: number; share: number | null }
}

/** Everything a skill's workspace shows, loaded in one call. */
export interface State {
  skill: SkillInfo
  /** This is the practice skill, so the shell walks the reader round the loop. */
  practice: boolean
  skills: SkillInfo[]
  cases: Case[]
  runs: RunView[]
  versions: SkillVersions
  engines: EngineInfo[]
  reviews: Reviews
  config: BenchConfig
  savedConfig: Partial<BenchConfig>
  rules: Rule[]
  anchors: AnchorInfo[]
  jevKey: boolean
  paths: { bench: string; reviews: string }
}
