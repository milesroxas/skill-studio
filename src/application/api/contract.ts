/**
 * The one list of operations every interface speaks: the desktop app over
 * IPC, `st serve` over HTTP, and tests directly. An operation has a name, an
 * input and an output. The table in operations.ts implements each; the
 * renderer's client types each call from here, so a change lands in both.
 */
import type { AgentId, Library } from '@domain/library.ts'
import type { QueueItem } from '@domain/queue.ts'
import type {
  BenchConfig,
  CaseDraft,
  Configuration,
  Review,
  SkillDrafts,
  TranscriptEvent,
  Vote,
} from '@domain/schemas.ts'
import type { TemplateId } from '@domain/templates.ts'
import type {
  Job,
  Leaderboard,
  RunView,
  Settings,
  SkillInfo,
  SkillVersion,
  State,
} from '@domain/views.ts'

/** Operations on one skill name it by path. The client fills this in. */
export interface Scoped {
  skill: string
}

export interface CreateSkillInput {
  scope: string
  name: string
  description: string
  agents: AgentId[]
  /** The starting SKILL.md; `blank` is the bare scaffold. */
  template: TemplateId
  /** Also write the template's sample cases. */
  samples: boolean
}

export interface LinkInput {
  path: string
  agent: AgentId
  scope: string
}

export interface EngineChoice {
  engine: string
  model: string
  effort: string
}

export interface GenerateInput extends Scoped {
  cases: string[]
  configs: EngineChoice[]
  samples: number
  configuration: Configuration
  baselineRun: string | null
  skillName: string | null
  note: string
  grade: boolean
}

export interface AnchorInput extends Scoped {
  run: string
  sample: string
  file: string
  case: string
  label: 'good' | 'bad'
  tests: string[]
  about: string
}

export interface ArtifactFile {
  bytes: Uint8Array
  type: string
}

export interface Started {
  started: true
  job: number
}

/** Each operation's input and output. The key is the wire name. */
export interface Contract {
  'library.skills': { input: Record<string, never>; output: SkillInfo[] }
  'library.scan': { input: Record<string, never>; output: Library }
  'library.create': { input: CreateSkillInput; output: SkillInfo }
  'library.link': { input: LinkInput; output: { linked: string } }
  'library.unlink': { input: LinkInput; output: { unlinked: true } }
  'library.workspaces': { input: { workspaces: string[] }; output: { workspaces: string[] } }
  'library.mark': { input: { path: string; theirs: boolean }; output: { marked: true } }
  'jobs.list': { input: Record<string, never>; output: Job[] }
  'settings.read': { input: Record<string, never>; output: Settings }
  'settings.jevKey': { input: { value: string }; output: Settings }
  'skill.state': { input: Scoped; output: State }
  'skill.run': { input: Scoped & { run: string }; output: RunView }
  'skill.transcript': { input: Scoped & { run: string; sample: string }; output: TranscriptEvent[] }
  'skill.artifact': {
    input: Scoped & { run: string; sample: string; file: string }
    output: ArtifactFile
  }
  /** The skill's files from `source`: `current` (the working tree), a version (`v2`) or a run name. */
  'skill.files': {
    input: Scoped & { source: string }
    output: { files: Record<string, string>; label: string }
  }
  'skill.saveVersion': { input: Scoped & { name: string; note: string }; output: SkillVersion }
  /** Put a version's files back in the skill. `force` overwrites a working tree that is no version. */
  'skill.restoreVersion': {
    input: Scoped & { version: string; force: boolean }
    output: { restored: string }
  }
  'skill.drafts': { input: Scoped; output: SkillDrafts }
  'skill.saveDrafts': {
    input: Scoped & { drafts: SkillDrafts }
    output: { updatedAt: string | null }
  }
  'skill.queue': { input: Scoped; output: QueueItem[] }
  'skill.leaderboard': { input: Scoped; output: Leaderboard }
  'skill.review': {
    input: Scoped & { key: string; review: Omit<Review, 'updatedAt'> }
    output: { saved: string }
  }
  'skill.preference': {
    input: Scoped & { a: string; b: string; criterion: string; vote: Vote }
    output: { saved: string }
  }
  'skill.saveFile': {
    input: Scoped & { path: string; text: string; previous: string | null }
    output: { saved: string }
  }
  'skill.deleteFile': { input: Scoped & { path: string }; output: { deleted: string } }
  'skill.saveCase': {
    input: Scoped & { case: CaseDraft; isNew: boolean }
    output: { saved: string }
  }
  'skill.deleteCase': { input: Scoped & { id: string }; output: { deleted: true } }
  'skill.config': {
    input: Scoped & { config: BenchConfig }
    output: { saved: string; config: BenchConfig }
  }
  'skill.anchor': { input: AnchorInput; output: { saved: string } }
  'skill.generate': { input: GenerateInput; output: Started }
  'skill.grade': { input: Scoped & { run: string; jev: boolean }; output: Started }
  'skill.pairwise': {
    input: Scoped & { a: string; b: string; criteria: string[] }
    output: Started
  }
}

export type OperationName = keyof Contract
export type Input<K extends OperationName> = Contract[K]['input']
export type Output<K extends OperationName> = Contract[K]['output']

/** The one operation whose output is bytes, served raw over HTTP and by the artifact scheme. */
export const ARTIFACT_OPERATION = 'skill.artifact' satisfies OperationName
/** Every artifact response carries this policy: agent-written HTML must never script the app. */
export const ARTIFACT_POLICY = "sandbox; script-src 'none'"

/** Operations the desktop shell answers itself: they touch the keychain, which lives in the main process. */
export const SHELL_OPERATIONS = [
  'settings.read',
  'settings.jevKey',
] as const satisfies readonly OperationName[]
export type ShellOperation = (typeof SHELL_OPERATIONS)[number]

/** How a call came back over a process boundary. Errors travel as text, never as thrown objects. */
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string }

/** The desktop bridge the preload exposes as `window.studio`; typed once for both sides. */
export interface StudioBridge {
  /** `process.platform` of the host, for platform-specific chrome. */
  platform: string
  call<K extends OperationName>(name: K, input: Input<K>): Promise<Reply<Output<K>>>
  /** Job changes pushed from the backend; returns the unsubscribe. */
  onJobs(listener: (jobs: Job[]) => void): () => void
  /** Show an `artifact:` URL in its own sandboxed window. */
  openArtifact(url: string): Promise<Reply<null>>
  /** Open an https link in the default browser. */
  openExternal(url: string): Promise<Reply<null>>
}
