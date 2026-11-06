/**
 * Names shared by the main process, the preload and the backend: IPC channels,
 * the URL schemes, and the messages that cross the backend's port.
 */
import type { Reply } from '@application/api/contract.ts'
import type { AiRun } from '@domain/ai.ts'
import type { Job } from '@domain/views.ts'

export const CHANNELS = {
  call: 'studio:call',
  jobs: 'studio:jobs',
  ai: 'studio:ai',
  go: 'studio:go',
  open: 'studio:open',
  openWelcome: 'studio:open-welcome',
  enterApp: 'studio:enter-app',
  openArtifact: 'studio:open-artifact',
  openExternal: 'studio:open-external',
  /** A window asks for a skill's folder in the file manager. */
  revealSkill: 'studio:reveal-skill',
  /** A window asks for a folder, picked in the system's own dialog. */
  chooseFolder: 'studio:choose-folder',
  /** A window asks the updater for its state or its next step. */
  update: 'studio:update',
  /** The updater tells every window its state. */
  updateState: 'studio:update-state',
  openChangelog: 'studio:open-changelog',
  /** A window asks the app to start over. Refused in a copy that does not offer it. */
  reset: 'studio:reset',
} as const

/**
 * How a window's preload learns the app's version: an argument the main
 * process adds to every page it opens. The preload runs sandboxed and cannot
 * ask Electron itself.
 */
export const VERSION_ARGUMENT = '--studio-version='
/** Added the same way when this copy can start over: a development build, or a prerelease. */
export const RESET_ARGUMENT = '--studio-can-reset'

/** The renderer's own pages. A custom scheme, so `file:` never loads. */
export const APP_SCHEME = 'studio'
export const APP_HOST = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

/** Files a sample wrote, each response sandboxed so agent HTML cannot script the app. */
export const ARTIFACT_SCHEME = 'artifact'
export const ARTIFACT_HOST = 'sample'
/** Pictures the writer added, on the same scheme and under the same sandbox. */
export const IMAGE_HOST = 'image'

export type ToBackend =
  | { type: 'call'; id: number; name: string; input: unknown }
  /** Set or clear environment variables; `undefined` clears. */
  | { type: 'env'; env: Record<string, string | undefined> }
  /** End the agent processes it started, then exit. */
  | { type: 'stop' }

/** What the backend tells the page without being asked, by topic. */
export interface Pushes {
  /** The job list, after any change to it. */
  jobs: Job[]
  /** An assistant reply, as it grows and when it ends. */
  ai: AiRun
}
export type PushTopic = keyof Pushes
export const PUSH_TOPICS = ['jobs', 'ai'] as const satisfies readonly PushTopic[]

type Push = { [K in PushTopic]: { type: 'push'; topic: K; value: Pushes[K] } }[PushTopic]

export type FromBackend =
  | { type: 'ready' }
  | { type: 'reply'; id: number; reply: Reply<unknown> }
  | Push
