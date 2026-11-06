import { type ChildProcess, spawn, spawnSync } from 'node:child_process'

export interface ExecOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  /** Written to stdin, then stdin is closed. */
  input?: string
  timeoutMs: number
  /** Called with each complete stdout line as it arrives. */
  onLine?: (line: string) => void
  /** Ends the process when aborted, as a timeout would. */
  signal?: AbortSignal
}

export interface ExecResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  timedOut: boolean
  /** The process could not be started at all. */
  spawnError: string | null
}

export const hasCommand = (command: string): boolean =>
  spawnSync('which', [command], { encoding: 'utf8' }).status === 0

/** Every process started here that has not ended yet. */
const running = new Set<ChildProcess>()

/** Ask a process to end, and end it for good if it has not within `graceMs`. */
function end(child: ChildProcess, graceMs: number): void {
  const kill = setTimeout(() => child.kill('SIGKILL'), graceMs)
  kill.unref()
  child.once('exit', () => clearTimeout(kill))
  child.kill('SIGTERM')
}

/**
 * End every process still running, and wait until each is gone. For when the
 * process that started them is going away itself: a process left behind keeps
 * working, and spending, with nothing left to read it.
 */
export async function stopAll(graceMs = 2000): Promise<void> {
  await Promise.all(
    [...running].map(
      (child) =>
        new Promise<void>((gone) => {
          child.once('exit', () => gone())
          end(child, graceMs)
        }),
    ),
  )
}

/**
 * Run a command to completion, streaming stdout lines to `onLine`. On timeout
 * the process gets SIGTERM, then SIGKILL five seconds later.
 */
export function exec(command: string, args: string[], options: ExecOptions): Promise<ExecResult> {
  return new Promise((done) => {
    const result: ExecResult = {
      code: null,
      signal: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      spawnError: null,
    }
    const child = spawn(command, args, { cwd: options.cwd, env: options.env })
    running.add(child)
    child.once('exit', () => running.delete(child))
    let buffer = ''
    const stop = () => end(child, 5000)
    const timer = setTimeout(() => {
      result.timedOut = true
      stop()
    }, options.timeoutMs)
    options.signal?.addEventListener('abort', stop, { once: true })
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      result.stdout += text
      if (!options.onLine) return
      buffer += text
      let at = buffer.indexOf('\n')
      while (at >= 0) {
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 1)
        if (line.trim()) options.onLine(line)
        at = buffer.indexOf('\n')
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      result.stderr += chunk.toString()
    })
    child.on('error', (error) => {
      // A process that could not start has no exit to wait for.
      if (child.pid === undefined) running.delete(child)
      result.spawnError = error.message
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', stop)
      if (buffer.trim() && options.onLine) options.onLine(buffer)
      result.code = code
      result.signal = signal
      done(result)
    })
    // EPIPE when the child exits before reading stdin; its exit code reports the failure.
    child.stdin.on('error', () => {})
    child.stdin.end(options.input)
  })
}

/** Run a command and return its stdout, or null when it fails or exceeds the timeout. */
export function tryCommand(command: string, args: string[], timeoutMs = 8000): string | null {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: timeoutMs })
  return result.status === 0 ? result.stdout : null
}
