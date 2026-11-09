/**
 * The one list of operations every interface speaks: the desktop app over
 * IPC, `st serve` over HTTP, and tests directly. An operation has a name, an
 * input and an output. The table in operations.ts implements each; the
 * renderer's client types each call from here, so a change lands in both.
 */
import type { AiRun, AiStatus, ChatThread, UsageSummary } from '@domain/ai.ts'
import type { AssistInput, ChatScene } from '@domain/assist.ts'
import type { SlashCommand } from '@domain/commands.ts'
import type { ImageRef, ImageUpload } from '@domain/image.ts'
import type { ImproveThread, RefineResult } from '@domain/improve.ts'
import type { AgentId, Library } from '@domain/library.ts'
import type { RuleScene } from '@domain/lint.ts'
import type { LookStep } from '@domain/practice.ts'
import type { Preferences } from '@domain/preferences.ts'
import type {
  BenchConfig,
  CaseDraft,
  Configuration,
  SkillDrafts,
  TranscriptEvent,
  Vote,
} from '@domain/schemas.ts'
import type { SecretId, Settings } from '@domain/secrets.ts'
import type { TemplateId } from '@domain/templates.ts'
import type { UpdateRequest, UpdateState } from '@domain/update.ts'
import type { Job, RunView, SkillInfo, SkillVersion, State } from '@domain/views.ts'

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
  /** Open the practice skill, writing it and its cases the first time. */
  'library.practice': { input: Record<string, never>; output: SkillInfo }
  /** Put the practice skill back as it was first written: its runs, picks, edits and drafts go. */
  'library.restartPractice': { input: Record<string, never>; output: SkillInfo }
  /** Mark a walkthrough step that only asks the reader to look at a screen. */
  'library.practiceSeen': { input: { step: LookStep }; output: { seen: LookStep[] } }
  'library.link': { input: LinkInput; output: { linked: string } }
  'library.unlink': { input: LinkInput; output: { unlinked: true } }
  'library.workspaces': { input: { workspaces: string[] }; output: { workspaces: string[] } }
  'library.mark': { input: { path: string; theirs: boolean }; output: { marked: true } }
  'jobs.list': { input: Record<string, never>; output: Job[] }
  /** Stop a running job: its agents are ended and it finishes with "Stopped." in its log. */
  'jobs.stop': { input: { id: number }; output: Job }
  'settings.read': { input: Record<string, never>; output: Settings }
  /** Store a key, or remove the stored one with an empty value. */
  'settings.key': { input: { id: SecretId; value: string }; output: Settings }
  /** The ways to reach a model, which are connected, and the models each offers. */
  'ai.status': { input: Record<string, never>; output: AiStatus }
  'ai.usage': { input: Record<string, never>; output: UsageSummary }
  /** The commands a chat message may start with on the model in use; empty when it takes none. */
  'ai.commands': { input: Record<string, never>; output: SlashCommand[] }
  /** Start writing one field's text. The run it returns grows until it ends. `skill` may be empty. */
  'ai.assist': { input: Scoped & AssistInput; output: AiRun }
  'ai.run': { input: { id: string }; output: AiRun }
  'ai.stop': { input: { id: string }; output: AiRun }
  'chat.read': { input: Record<string, never>; output: ChatThread }
  /** Add a message to the conversation and start the reply. `skill` may be empty: none open. */
  'chat.send': {
    input: Scoped & { text: string; images: ImageRef[]; screen: string; open: ChatScene['open'] }
    output: ChatThread
  }
  'chat.clear': { input: Record<string, never>; output: ChatThread }
  /** Check a selected rule and, when anything drifts, start its revision. */
  'ai.refine': { input: RuleScene; output: RefineResult }
  /** Start the three rewrites of a selected rule. The finished run's text is a `RewritesResult` as JSON. */
  'ai.rewrites': { input: RuleScene; output: AiRun }
  /** The side panel's improve conversation; null when none is open. */
  'improve.read': { input: Record<string, never>; output: ImproveThread | null }
  /** Open an improve conversation on a selected rule and ask its first question. */
  'improve.start': { input: RuleScene; output: ImproveThread }
  'improve.send': { input: { text: string }; output: ImproveThread }
  'improve.clear': { input: Record<string, never>; output: { cleared: true } }
  /** Keep a picture until a case or a message saves it. The reference it returns names the upload. */
  'image.upload': { input: ImageUpload; output: ImageRef }
  /** A picture's bytes: an upload, or a file in the skill. An empty `file` or `upload` means the other. */
  'image.read': { input: Scoped & { file: string; upload: string }; output: ArtifactFile }
  'preferences.read': { input: Record<string, never>; output: Preferences }
  'preferences.write': { input: { preferences: Preferences }; output: Preferences }
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
  /**
   * Delete a version: its saved copy, its runs, and the corrections and picks on their outputs.
   * The files stay as they are. Refused while a job runs. `undo` names the way back.
   */
  'skill.deleteVersion': {
    input: Scoped & { version: string }
    output: { deleted: string; runs: number; reviews: number; undo: string }
  }
  /** Take back the latest delete, named by the `undo` it returned. */
  'skill.undeleteVersion': { input: Scoped & { undo: string }; output: { restored: string } }
  'skill.drafts': { input: Scoped; output: SkillDrafts }
  'skill.saveDrafts': {
    input: Scoped & { drafts: SkillDrafts }
    output: { updatedAt: string | null }
  }
  /**
   * The reader's own answer on one verdict of one output, which stands over Jev's:
   * `met` true or false, or null to take it back.
   */
  'skill.correct': {
    input: Scoped & { key: string; verdict: string; met: boolean | null }
    output: { saved: string }
  }
  /** The reader's pick of the better of two outputs. A new pick on the pair replaces the old. */
  'skill.pick': {
    input: Scoped & { a: string; b: string; vote: Vote }
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
  'skill.generate': { input: GenerateInput; output: Started }
  'skill.grade': { input: Scoped & { run: string; jev: boolean }; output: Started }
}

export type OperationName = keyof Contract
export type Input<K extends OperationName> = Contract[K]['input']
export type Output<K extends OperationName> = Contract[K]['output']

/**
 * The operations whose output is bytes, served raw over HTTP and by the
 * artifact scheme: a file a sample wrote, and a picture the writer added.
 */
export const ARTIFACT_OPERATION = 'skill.artifact' satisfies OperationName
export const IMAGE_OPERATION = 'image.read' satisfies OperationName
/** Every artifact response carries this policy: agent-written HTML must never script the app. */
export const ARTIFACT_POLICY = "sandbox; script-src 'none'"

/** Operations the desktop shell answers itself: they touch the keychain, which lives in the main process. */
export const SHELL_OPERATIONS = [
  'settings.read',
  'settings.key',
] as const satisfies readonly OperationName[]
export type ShellOperation = (typeof SHELL_OPERATIONS)[number]

/** How a call came back over a process boundary. Errors travel as text, never as thrown objects. */
export type Reply<T> = { ok: true; value: T } | { ok: false; error: string }

/** The desktop bridge the preload exposes as `window.studio`; typed once for both sides. */
export interface StudioBridge {
  /** `process.platform` of the host, for platform-specific chrome. */
  platform: string
  /** The version running, as Electron reports it: the one every release is measured against. */
  version: string
  call<K extends OperationName>(name: K, input: Input<K>): Promise<Reply<Output<K>>>
  /** Job changes pushed from the backend; returns the unsubscribe. */
  onJobs(listener: (jobs: Job[]) => void): () => void
  /** An assistant reply as it grows and when it ends; returns the unsubscribe. */
  onAi(listener: (run: AiRun) => void): () => void
  /** A screen the application menu asks for, such as the guide; returns the unsubscribe. */
  onGo(listener: (screen: string) => void): () => void
  /** A skill the welcome hands this window to open, by path; returns the unsubscribe. */
  onOpen(listener: (skill: string) => void): () => void
  /** Show the welcome in its own small window. */
  openWelcome(): Promise<Reply<null>>
  /** Leave the welcome for the app itself, on a skill when one is named. */
  enterApp(skill: string | null): Promise<Reply<null>>
  /** Show an `artifact:` URL in its own sandboxed window. */
  openArtifact(url: string): Promise<Reply<null>>
  /** Open an https link in the default browser. */
  openExternal(url: string): Promise<Reply<null>>
  /** Show a skill's folder in the file manager: Finder, File Explorer or the desktop's own. */
  revealSkill(path: string): Promise<Reply<null>>
  /** Ask for a folder in the system's own dialog; null when it is cancelled. */
  chooseFolder(): Promise<Reply<string | null>>
  /** Ask where the app's own updates stand, or for their next step; answered with the state after. */
  update(request: UpdateRequest): Promise<Reply<UpdateState>>
  /** The update state after every change to it; returns the unsubscribe. */
  onUpdate(listener: (state: UpdateState) => void): () => void
  /** Show what changed in each release, in a window of its own. */
  openChangelog(): Promise<Reply<null>>
  /** True in a copy that can start over: a development build, or a prerelease. */
  canReset: boolean
  /**
   * Start over: delete what the app keeps of its own and open as on a first
   * launch. Skills and stored keys stay. The asking window closes with the rest.
   */
  reset(): Promise<Reply<null>>
}
