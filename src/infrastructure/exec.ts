import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { join } from 'node:path'

const WIN32 = process.platform === 'win32'

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

/** What Windows runs without an extension being typed, when `PATHEXT` is not set. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/** A file that can be run: on Windows any file, elsewhere one with the execute bit. */
function runnable(path: string, win: boolean): boolean {
  try {
    if (!statSync(path).isFile()) return false
    if (!win) accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The names a command may be filed under. On Windows a bare name stands for
 * `name.exe`, `name.cmd` and the other `PATHEXT` extensions; a name that
 * already carries one of them stands for itself.
 */
function spellings(name: string, env: NodeJS.ProcessEnv, win: boolean): string[] {
  if (!win) return [name]
  const extensions = (env.PATHEXT ?? DEFAULT_PATHEXT).split(';').filter(Boolean)
  const lower = name.toLowerCase()
  if (extensions.some((ext) => lower.endsWith(ext.toLowerCase()))) return [name]
  return extensions.map((ext) => `${name}${ext}`)
}

/**
 * Where a command is on the PATH: its full path, or null when no folder holds
 * it. This is what `which` does, done here because Windows has no `which` and
 * because npm installs a CLI there as `name.cmd`, which `spawn` only finds by
 * its full name. A name with a folder in it is checked as given.
 */
export function resolveCommand(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const win = platform === 'win32'
  const has = (path: string) => spellings(path, env, win).find((p) => runnable(p, win)) ?? null
  if (name.includes('/') || (win && name.includes('\\'))) return has(name)
  for (const dir of (env.PATH ?? '').split(win ? ';' : ':').filter(Boolean)) {
    const found = has(join(dir, name))
    if (found) return found
  }
  return null
}

export const hasCommand = (command: string): boolean => resolveCommand(command) !== null

/** A `.cmd` or `.bat` file: cmd.exe has to run it, so it goes through a shell. */
const isScript = (path: string): boolean => WIN32 && /\.(cmd|bat)$/i.test(path)

/**
 * One argument as cmd.exe passes it on whole: in double quotes, with the
 * quotes inside escaped for the program that reads them. A line break cannot
 * cross a cmd.exe command line at all, so long or multi-line text goes to a
 * CLI on stdin, never as an argument.
 */
const quoteForCmd = (arg: string): string => `"${arg.replace(/(\\*)"/g, '$1$1\\"')}"`

/** Start a command: by its full path, and through cmd.exe when it is a `.cmd` script. */
function spawnCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): ChildProcess {
  const resolved = resolveCommand(command, options.env ?? process.env) ?? command
  if (isScript(resolved))
    return spawn(quoteForCmd(resolved), args.map(quoteForCmd), { ...options, shell: true })
  // Its own process group on POSIX, so ending it ends what it started (a Bash tool's shell).
  return spawn(resolved, args, { ...options, detached: !WIN32 })
}

/**
 * Signal a process and everything it started. On POSIX the child leads its own
 * group, so the signal goes to the group; on Windows `taskkill /T` ends the tree.
 */
function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  if (WIN32) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    // Not a group leader after all, or already gone: the process itself is the fallback.
    child.kill(signal)
  }
}

/** Told when an agent process starts and ends, so a record of it can outlive this process. */
export interface ChildWatcher {
  started(pid: number, command: string): void
  ended(pid: number): void
}

let watcher: ChildWatcher | null = null

/** Have `exec` report the processes it starts; null stops the reports. */
export function watchChildren(next: ChildWatcher | null): void {
  watcher = next
}

/** Every process started here that has not ended yet. */
const running = new Set<ChildProcess>()

/** Ask a process to end, and end it for good if it has not within `graceMs`. */
function end(child: ChildProcess, graceMs: number): void {
  const kill = setTimeout(() => signalTree(child, 'SIGKILL'), graceMs)
  kill.unref()
  child.once('exit', () => clearTimeout(kill))
  signalTree(child, 'SIGTERM')
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
    const child = spawnCommand(command, args, { cwd: options.cwd, env: options.env })
    running.add(child)
    if (child.pid !== undefined) watcher?.started(child.pid, command)
    child.once('exit', () => {
      running.delete(child)
      if (child.pid !== undefined) watcher?.ended(child.pid)
    })
    let buffer = ''
    const stop = () => end(child, 5000)
    const timer = setTimeout(() => {
      result.timedOut = true
      stop()
    }, options.timeoutMs)
    options.signal?.addEventListener('abort', stop, { once: true })
    child.stdout?.on('data', (chunk: Buffer) => {
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
    child.stderr?.on('data', (chunk: Buffer) => {
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
    child.stdin?.on('error', () => {})
    child.stdin?.end(options.input)
  })
}

/** Run a command and return its stdout, or null when it fails or exceeds the timeout. */
export function tryCommand(command: string, args: string[], timeoutMs = 8000): string | null {
  const resolved = resolveCommand(command) ?? command
  const result = isScript(resolved)
    ? spawnSync(quoteForCmd(resolved), args.map(quoteForCmd), {
        encoding: 'utf8',
        timeout: timeoutMs,
        shell: true,
      })
    : spawnSync(resolved, args, { encoding: 'utf8', timeout: timeoutMs })
  return result.status === 0 ? result.stdout : null
}
