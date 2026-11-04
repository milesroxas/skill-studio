/**
 * Names shared by the main process, the preload and the backend: IPC channels,
 * the URL schemes, and the messages that cross the backend's port.
 */
import type { Reply } from '@application/api/contract.ts'
import type { Job } from '@domain/views.ts'

export const CHANNELS = {
  call: 'studio:call',
  jobs: 'studio:jobs',
  openArtifact: 'studio:open-artifact',
  openExternal: 'studio:open-external',
} as const

/** The renderer's own pages. A custom scheme, so `file:` never loads. */
export const APP_SCHEME = 'studio'
export const APP_HOST = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

/** Files a sample wrote, each response sandboxed so agent HTML cannot script the app. */
export const ARTIFACT_SCHEME = 'artifact'
export const ARTIFACT_HOST = 'sample'

export type ToBackend =
  | { type: 'call'; id: number; name: string; input: unknown }
  /** Set or clear environment variables; `undefined` clears. */
  | { type: 'env'; env: Record<string, string | undefined> }

export type FromBackend =
  | { type: 'ready' }
  | { type: 'reply'; id: number; reply: Reply<unknown> }
  | { type: 'jobs'; jobs: Job[] }
