/**
 * How the renderer reaches the operations table. Inside the desktop app the
 * preload's bridge carries calls over IPC and pushes job changes; in a browser
 * (`st serve`) the same calls go over HTTP and jobs are polled.
 */
import type {
  ARTIFACT_OPERATION,
  IMAGE_OPERATION,
  Input,
  OperationName,
  Output,
  Reply,
  StudioBridge,
} from '@application/api/contract.ts'
import type { AiRun } from '@domain/ai.ts'
import type { UpdateRequest, UpdateState } from '@domain/update.ts'
import type { Job } from '@domain/views.ts'

declare global {
  interface Window {
    /** Present only inside the desktop app; the preload defines it. */
    studio?: StudioBridge
  }
}

/** The desktop app's own updates, as a window reaches them. */
export interface UpdateHost {
  /** The version running, which every release is measured against. */
  version: string
  /** Ask where the updates stand, or for their next step; resolves to the state after. */
  request(request: UpdateRequest): Promise<UpdateState>
  /** Be told the state after every change; returns the unsubscribe. */
  watch(listener: (state: UpdateState) => void): () => void
  /** Show what changed in each release, in a window of its own. */
  openChangelog(): void
}

export interface Transport {
  call<K extends OperationName>(name: K, input: Input<K>): Promise<Output<K>>
  /** A URL an `<img>` or `<iframe>` can load the artifact from. */
  artifactUrl(input: Input<typeof ARTIFACT_OPERATION>): string
  /** The same for a picture the writer added. */
  imageUrl(input: Input<typeof IMAGE_OPERATION>): string
  /** Show an artifact or a picture full size; the app opens a sandboxed window, the browser a tab. */
  openArtifact(url: string): void
  /** Follow an outside link. */
  openExternal(url: string): void
  /** Show a skill's folder in the file manager. Undefined in a browser, which cannot reach one. */
  revealSkill?: (path: string) => Promise<void>
  /** Pick a folder in the system's dialog; null when cancelled. Undefined in a browser, which types one. */
  chooseFolder?: () => Promise<string | null>
  /** Push job changes when the transport has them; otherwise undefined and the shell polls. */
  watchJobs?: (listener: (jobs: Job[]) => void) => () => void
  /** Push assistant replies as they grow; otherwise undefined and the page polls a running one. */
  watchAi?: (listener: (run: AiRun) => void) => () => void
  /** Screens the desktop app's menu asks for; a browser has no such menu. */
  watchGo?: (listener: (screen: string) => void) => () => void
  /** A skill the welcome's window hands over to open; a browser shows the welcome in the page. */
  watchOpen?: (listener: (skill: string) => void) => () => void
  /** Show the welcome in its own small window. Undefined where the page shows it itself. */
  openWelcome?: () => void
  /** Leave the welcome's window for the app, on a skill when one is named. */
  enterApp?: (skill: string | null) => void
  /** Undefined in a browser: `st serve` is updated with the checkout it runs from. */
  updates?: UpdateHost
  /**
   * Start the app over as a newcomer meets it. Only a desktop copy made for
   * testing has it: a development build, or a prerelease.
   */
  reset?: () => Promise<void>
  platform: string
}

const unwrap = <T>(reply: Reply<T>): T => {
  if (reply.ok) return reply.value
  throw new Error(reply.error)
}

const logFailure = (error: Error): void => console.error(error)
/** Where a failure nobody awaits is said, such as a window that would not open. The console until the shell listens. */
let sayFailed: (error: Error) => void = logFailure

/** Say a failure that no caller awaits. The shell routes it to the status line. */
export const reportFailure = (error: Error): void => sayFailed(error)

/** Be told of every failure nobody awaits; returns the unsubscribe. One listener: the shell's status line. */
export function watchFailures(listener: (error: Error) => void): () => void {
  sayFailed = listener
  return () => {
    sayFailed = logFailure
  }
}

/** A window the browser would not open, which it says nothing about itself. */
const openTab = (url: string): void => {
  if (!window.open(url, '_blank', 'noopener,noreferrer'))
    reportFailure(new Error('The browser blocked the window. Allow pop-ups for this site.'))
}

const encode = (params: object): string =>
  new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()

function desktop(bridge: StudioBridge): Transport {
  return {
    call: (name, input) => bridge.call(name, input).then(unwrap),
    artifactUrl: (input) => `artifact://sample?${encode(input)}`,
    imageUrl: (input) => `artifact://image?${encode(input)}`,
    openArtifact: (url) => void bridge.openArtifact(url).then(unwrap).catch(reportFailure),
    openExternal: (url) => void bridge.openExternal(url).then(unwrap).catch(reportFailure),
    revealSkill: async (path) => void unwrap(await bridge.revealSkill(path)),
    chooseFolder: async () => unwrap(await bridge.chooseFolder()),
    watchJobs: (listener) => bridge.onJobs(listener),
    watchAi: (listener) => bridge.onAi(listener),
    watchGo: (listener) => bridge.onGo(listener),
    watchOpen: (listener) => bridge.onOpen(listener),
    openWelcome: () => void bridge.openWelcome().then(unwrap).catch(reportFailure),
    enterApp: (skill) => void bridge.enterApp(skill).then(unwrap).catch(reportFailure),
    updates: {
      version: bridge.version,
      request: (request) => bridge.update(request).then(unwrap),
      watch: (listener) => bridge.onUpdate(listener),
      openChangelog: () => void bridge.openChangelog().then(unwrap).catch(reportFailure),
    },
    reset: bridge.canReset ? async () => void unwrap(await bridge.reset()) : undefined,
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
      // Bytes do not survive JSON: the page loads a picture by URL, never through a call.
      if (name === 'image.read') throw new Error('Load a picture by its URL.')
      // The artifact comes raw from its GET route instead.
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
    imageUrl: (input) => `/api/image?${encode(input)}`,
    openArtifact: openTab,
    openExternal: openTab,
    platform: 'web',
  }
}

export const transport: Transport = window.studio ? desktop(window.studio) : browser()
