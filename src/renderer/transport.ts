/**
 * How the renderer reaches the operations table. Inside the desktop app the
 * preload's bridge carries calls over IPC and pushes job changes; in a browser
 * (`st serve`) the same calls go over HTTP and jobs are polled.
 */
import type {
  ARTIFACT_OPERATION,
  Input,
  OperationName,
  Output,
  Reply,
  StudioBridge,
} from '@application/api/contract.ts'
import type { Job } from '@domain/views.ts'

declare global {
  interface Window {
    /** Present only inside the desktop app; the preload defines it. */
    studio?: StudioBridge
  }
}

export interface Transport {
  call<K extends OperationName>(name: K, input: Input<K>): Promise<Output<K>>
  /** A URL an `<img>` or `<iframe>` can load the artifact from. */
  artifactUrl(input: Input<typeof ARTIFACT_OPERATION>): string
  /** Show an artifact full size; the app opens a sandboxed window, the browser a tab. */
  openArtifact(url: string): void
  /** Follow an outside link. */
  openExternal(url: string): void
  /** Push job changes when the transport has them; otherwise undefined and the shell polls. */
  watchJobs?: (listener: (jobs: Job[]) => void) => () => void
  platform: string
}

const unwrap = <T>(reply: Reply<T>): T => {
  if (reply.ok) return reply.value
  throw new Error(reply.error)
}

const encode = (params: object): string =>
  new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()

function desktop(bridge: StudioBridge): Transport {
  return {
    call: (name, input) => bridge.call(name, input).then(unwrap),
    artifactUrl: (input) => `artifact://sample?${encode(input)}`,
    openArtifact: (url) => void bridge.openArtifact(url).then(unwrap),
    openExternal: (url) => void bridge.openExternal(url).then(unwrap),
    watchJobs: (listener) => bridge.onJobs(listener),
    platform: bridge.platform,
  }
}

/** The server's `{ error }`; a proxy error while the server is down has no JSON body. */
async function errorOf(response: Response): Promise<string> {
  try {
    return (await response.json()).error ?? response.statusText
  } catch {
    return response.statusText
  }
}

function browser(): Transport {
  return {
    call: async (name, input) => {
      // Bytes do not survive JSON: the artifact comes raw from its GET route instead.
      if (name === 'skill.artifact') {
        const response = await fetch(`/api/artifact?${encode(input as Input<typeof name>)}`)
        if (!response.ok) throw new Error(await errorOf(response))
        const file: Output<'skill.artifact'> = {
          bytes: new Uint8Array(await response.arrayBuffer()),
          type: response.headers.get('content-type') ?? '',
        }
        return file as Output<typeof name>
      }
      const response = await fetch(`/api/${name}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw new Error(await errorOf(response))
      return response.json()
    },
    artifactUrl: (input) => `/api/artifact?${encode(input)}`,
    openArtifact: (url) => void window.open(url, '_blank', 'noopener,noreferrer'),
    openExternal: (url) => void window.open(url, '_blank', 'noopener,noreferrer'),
    platform: 'web',
  }
}

export const transport: Transport = window.studio ? desktop(window.studio) : browser()
