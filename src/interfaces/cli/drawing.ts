/**
 * How `st run`, `st grade` and `st serve` draw a page as the desktop app
 * does: they start Electron with no window, the drawing host
 * (`src/interfaces/electron/draw/index.ts`, built to `out/main/draw.js`), at
 * the first page a grading asks for, and keep it for the command's life. One
 * JSON line goes to it for each page and one comes back, matched by `id`
 * (`@domain/drawing-host.ts`). `st sheet` draws a page of its own with it, by
 * the page's `file:` address.
 *
 * The host ends when the command's lifecycle stops, and when the command
 * exits: its input closes then, and it is sent SIGTERM. While no page is being drawn it holds
 * nothing open, so a command that is done exits as it would without it.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import {
  type ArtifactAddress,
  type DrawnPage,
  type PageRenderer,
  RendererGone,
} from '@domain/artifact-address.ts'
import { type HostRequest, replyOf } from '@domain/drawing-host.ts'
import { readLayout } from '@domain/layout.ts'
import { realPath } from '@infrastructure/fs.ts'
import { CHECKOUT } from '../host.ts'

/** The host as `pnpm build` writes it. */
const HOST_FILE = join(CHECKOUT, 'out/main/draw.js')

/**
 * How long the host may go without a reply while a page waits for one. It
 * gives up on a page in 30 seconds itself (`render.ts`), so a host that says
 * nothing for longer than this has stopped answering.
 */
const QUIET_MS = 60_000
/** How long a host told to stop has to go before it is killed. */
const STOP_MS = 3000
/** The end of what the host wrote to stderr, kept to say why it stopped. */
const STDERR_KEPT = 4096

/** A command that starts the host. */
export interface HostStart {
  command: string
  args: readonly string[]
}

/**
 * The Electron binary the checkout installed, found as `require('electron')`
 * finds it, but never fetched: that module downloads one that is missing.
 */
function electronBinary(env: NodeJS.ProcessEnv): string | null {
  try {
    const dir = dirname(createRequire(import.meta.url).resolve('electron/package.json'))
    const name = readFileSync(join(dir, 'path.txt'), 'utf8')
    const binary = env.ELECTRON_OVERRIDE_DIST_PATH
      ? join(env.ELECTRON_OVERRIDE_DIST_PATH, name)
      : join(dir, 'dist', name)
    return existsSync(binary) ? binary : null
  } catch {
    return null
  }
}

/** How to start the host on this machine, or why it cannot start: each is said as it is. */
export function hostStart(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  file: string = HOST_FILE,
): HostStart | { reason: string } {
  if (!existsSync(file)) return { reason: 'Run pnpm build to draw pages.' }
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY)
    return { reason: 'There is no display to draw pages on: run the command under xvfb-run.' }
  const electron = electronBinary(env)
  if (!electron) return { reason: 'Electron is not installed: run pnpm install to draw pages.' }
  return { command: electron, args: [file] }
}

export interface DrawingOptions {
  /** Where the reason the host cannot start, or stopped, is said: once, at the first page that finds it. */
  warn: (line: string) => void
  /** The command's lifecycle's: the host ends as the stop begins. */
  signal?: AbortSignal
  /**
   * What is said after the reason a host that had started stopped: what
   * becomes of the pages after it. A grading's when left out.
   */
  after?: string
  /** How to start the host; this checkout's when left out. A test hands it a stand-in. */
  start?: HostStart | { reason: string }
}

interface Waiting {
  resolve: (page: DrawnPage) => void
  reject: (error: Error) => void
}

/** The renderer `drawingHost` gives, which draws a page of the command's own too. */
export type DrawingHost = PageRenderer & {
  /** Draw a page the command wrote, by its `file:` address: the host serves it only the files beside it. */
  file: (address: string, size: { width: number; height: number }) => Promise<DrawnPage>
}

/** A handle a process holds open, or lets go of. */
type Held = { ref?: () => unknown; unref?: () => unknown } | null

/**
 * A renderer that draws with the host, started at the first page asked for:
 * a command that draws no page starts nothing and says nothing. A host that
 * cannot start, or stops after it has started, is said through `warn` once,
 * at the page that found it, and never asked again: that page and every one
 * to come rejects with `RendererGone`, and a grading goes on as with no
 * renderer.
 */
export function drawingHost(options: DrawingOptions): DrawingHost {
  const waiting = new Map<string, Waiting>()
  let host: ChildProcess | null = null
  /** Why the host can draw no more, once it has stopped of itself. */
  let gone: RendererGone | null = null
  /** The command asked it to go: its lifecycle stopped. */
  let ended = false
  let quiet: NodeJS.Timeout | undefined
  let sent = 0

  /** Keep the command running while a page is being drawn, and only then. */
  const hold = (child: ChildProcess, on: boolean): void => {
    for (const handle of [child, child.stdin, child.stdout, child.stderr] as Held[])
      on ? handle?.ref?.() : handle?.unref?.()
  }

  /** Fail every page waiting with `error`. */
  const fail = (error: Error): void => {
    clearTimeout(quiet)
    for (const page of waiting.values()) page.reject(error)
    waiting.clear()
  }

  /** The host cannot draw, not asked to stop: say why once, and fail every page waiting and to come. */
  const lost = (
    reason: string,
    said = `${reason} ${options.after ?? 'The pages after it are graded without being drawn.'}`,
  ): void => {
    if (!gone && !ended) {
      gone = new RendererGone(reason)
      options.warn(said)
    }
    fail(gone ?? new Error('Stopped.'))
  }

  /** Ask the host to go: its input closes, then it is killed if it is still there. */
  const end = (child: ChildProcess): void => {
    ended = true
    child.stdin?.end()
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }, STOP_MS).unref()
  }

  /** Give up on a host that stops answering while a page waits. */
  const watch = (child: ChildProcess): void => {
    clearTimeout(quiet)
    if (!waiting.size) return
    quiet = setTimeout(() => {
      lost(`The drawing host did not answer in ${QUIET_MS / 1000} seconds.`)
      end(child)
    }, QUIET_MS)
  }

  const launch = (start: HostStart): ChildProcess => {
    // Set by an editor that runs Node in Electron, it would start Electron as plain Node.
    const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env
    const child = spawn(start.command, [...start.args], { stdio: 'pipe', env })
    let said = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      said = (said + chunk.toString()).slice(-STDERR_KEPT)
    })
    child.stdin?.on('error', () => {})
    // A command that exits, on Ctrl-C too, takes the host with it, whatever the host is doing.
    const going = (): void => void child.kill()
    process.once('exit', going)
    child.on('error', (error) => lost(`The drawing host could not start: ${error.message}`))
    child.on('exit', (code, signal) => {
      process.off('exit', going)
      const last = said.trim().split('\n').at(-1)?.trim()
      lost(`The drawing host stopped (${code ?? signal})${last ? `: ${last}` : '.'}`)
    })
    createInterface({ input: child.stdout as NodeJS.ReadableStream }).on('line', (line) => {
      const reply = replyOf(line)
      const page = reply && waiting.get(reply.id)
      if (!reply || !page) return
      waiting.delete(reply.id)
      if ('error' in reply) page.reject(new Error(reply.error))
      else
        page.resolve({
          png: new Uint8Array(Buffer.from(reply.png, 'base64')),
          layout: readLayout(reply.layout),
        })
      if (!waiting.size) hold(child, false)
      watch(child)
    })
    options.signal?.addEventListener('abort', () => end(child), { once: true })
    return child
  }

  /** Send the host one page to draw: a sample's, or one of the command's own. */
  const ask = (
    what: { page: ArtifactAddress } | { file: string },
    size: { width: number; height: number },
  ): Promise<DrawnPage> => {
    if (gone) return Promise.reject(gone)
    if (ended || options.signal?.aborted) return Promise.reject(new Error('Stopped.'))
    if (!host) {
      const start = options.start ?? hostStart()
      if ('reason' in start) {
        // Said as it is: nothing was drawn before it.
        lost(start.reason, start.reason)
        return Promise.reject(gone)
      }
      host = launch(start)
    }
    const child = host
    const id = String(++sent)
    const request: HostRequest = { id, ...what, width: size.width, height: size.height }
    return new Promise<DrawnPage>((resolve, reject) => {
      waiting.set(id, { resolve, reject })
      hold(child, true)
      watch(child)
      child.stdin?.write(`${JSON.stringify(request)}\n`)
    })
  }

  // The host opens the skill by its folder: by its real path, as it serves it.
  const render: PageRenderer = (page, size) =>
    ask({ page: { ...page, skill: realPath(page.skill) } }, size)
  return Object.assign(render, {
    file: (file: string, size: { width: number; height: number }) => ask({ file }, size),
  })
}
