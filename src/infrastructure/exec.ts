import { spawn, spawnSync } from 'node:child_process'

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
    let buffer = ''
    const stop = () => {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }, 5000).unref()
    }
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
