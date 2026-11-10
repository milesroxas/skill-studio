import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { join } from 'node:path'
import type { CommandRunner } from '@judges/types.ts'
import { agentEnv } from './env.ts'

const WIN32 = process.platform === 'win32'

/** How long a process gets after it is asked to end before it is ended for good. */
const GRACE_MS = 5000
/** How long after that its exit is waited for, before the run is given up as it stands. */
const SETTLE_MS = 250
/**
 * How long the output may stay open, and quiet, once the process has exited.
 * Something it started (a server put in the background with `&`) can hold the
 * pipes open after it, and the run is over all the same.
 */
const EXIT_SETTLE_MS = 500
/** What a command run for a stopped grading rejects with. */
const STOPPED = 'Stopped.'
/** Output kept when nothing says otherwise, so a command that prints without end cannot fill memory. */
const MAX_OUTPUT = 16 * 1024 * 1024
/** Output kept of a stream that is only ever read for its last lines. */
const TAIL = 64 * 1024

export interface ExecOptions {
  cwd: string
  /** The backend's environment less the app's own keys (`agentEnv`) when not given. */
  env?: NodeJS.ProcessEnv
  /** Written to stdin, then stdin is closed. */
  input?: string
  timeoutMs: number
  /**
   * Called with each complete stdout line as it arrives. The lines are the
   * output then: `stdout` in the result keeps only its last 64 KB.
   */
  onLine?: (line: string) => void
  /** Ends the process when aborted, as a timeout would. */
  signal?: AbortSignal
  /** `command` is a whole command line for the system's shell, and `args` is not used. */
  shell?: boolean
  /** The characters of stdout kept, from its start; what follows is dropped. 16 MB when not given. */
  maxOutput?: number
}

export interface ExecResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  /** The last 64 KB of it. */
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
 * A variable of `env` by name. Windows names them without regard to case, and
 * a plain object copied from `process.env` keeps the spelling it was given
 * (`Path`), so there the name is matched whatever its case.
 */
function envValue(env: NodeJS.ProcessEnv, name: string, win: boolean): string | undefined {
  if (!win || env[name] !== undefined) return env[name]
  const key = Object.keys(env).find((k) => k.toUpperCase() === name)
  return key === undefined ? undefined : env[key]
}

/**
 * The names a command may be filed under. On Windows a bare name stands for
 * `name.exe`, `name.cmd` and the other `PATHEXT` extensions; a name that
 * already carries one of them stands for itself.
 */
function spellings(name: string, env: NodeJS.ProcessEnv, win: boolean): string[] {
  if (!win) return [name]
  const extensions = (envValue(env, 'PATHEXT', win) ?? DEFAULT_PATHEXT).split(';').filter(Boolean)
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
  for (const dir of (envValue(env, 'PATH', win) ?? '').split(win ? ';' : ':').filter(Boolean)) {
    const found = has(join(dir, name))
    if (found) return found
  }
  return null
}

export const hasCommand = (command: string): boolean => resolveCommand(command) !== null

/** A `.cmd` or `.bat` file: cmd.exe has to run it, so it goes through a shell. */
const isScript = (path: string): boolean => WIN32 && /\.(cmd|bat)$/i.test(path)

/** The characters cmd.exe reads as its own, wherever they stand. */
const CMD_META = /([()\][%!^"`<>&|;, *?])/g

/**
 * One argument as a `.cmd` script passes it on whole. It is quoted for the
 * program that reads it in the end (backslashes before a quote doubled, the
 * quote escaped), then every character cmd.exe acts on is escaped with a
 * caret, twice: cmd.exe reads the line once to start the script and once more
 * where the script hands its arguments on (`%*`), and each reading takes one
 * caret away. Quotes alone do not hold: cmd.exe does not read `\"` as an
 * escaped quote, so text after one would run as a command, and `%NAME%`
 * expands inside quotes.
 */
function cmdArgument(arg: string): string {
  const quoted = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`
  return quoted.replace(CMD_META, '^$1').replace(CMD_META, '^$1')
}

/**
 * The line cmd.exe runs for a `.cmd` or `.bat` script and its arguments.
 * Throws for an argument with a line break: a cmd.exe command line ends at
 * the first one, so the text after it would be lost. Long or multi-line text
 * goes to a CLI on stdin.
 */
export function cmdLine(script: string, args: string[]): string {
  if (args.some((arg) => /[\r\n]/.test(arg)))
    throw new Error(
      'Windows cannot pass text with a line break to this command. Put it on one line and try again.',
    )
  return [script.replace(CMD_META, '^$1'), ...args.map(cmdArgument)].join(' ')
}

/**
 * Start a command: by its full path, and through cmd.exe when it is a `.cmd`
 * script. With `shell`, the command is a line for the system's shell.
 */
function spawnCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean },
): ChildProcess {
  // The app's own keys stay out of everything started here, whoever asks.
  const { cwd, env = agentEnv() } = options
  // Its own process group on POSIX, so ending it ends what it started (a Bash tool's shell).
  const detached = !WIN32
  if (options.shell) return spawn(command, { cwd, env, shell: true, detached })
  const resolved = resolveCommand(command, env) ?? command
  if (isScript(resolved))
    // As `shell: true` starts cmd.exe, with the line escaped here and passed as it is.
    return spawn(
      envValue(env, 'COMSPEC', true) || 'cmd.exe',
      ['/d', '/s', '/c', `"${cmdLine(resolved, args)}"`],
      { cwd, env, windowsVerbatimArguments: true },
    )
  return spawn(resolved, args, { cwd, env, detached })
}

/**
 * Signal a process and everything it started. On POSIX the child leads its own
 * group, so the signal goes to the group; on Windows `taskkill /T` ends the tree.
 */
function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  if (WIN32) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      env: agentEnv(),
    })
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
let watcherFailed = false

/** Have `exec` report the processes it starts; null stops the reports. */
export function watchChildren(next: ChildWatcher | null): void {
  watcher = next
}

/**
 * Tell the watcher. Its record is a file, and a write that fails (a full
 * disk) must not reach the process's own run: the first failure is warned of
 * and the rest pass in silence.
 */
function report(tell: (to: ChildWatcher) => void): void {
  if (!watcher) return
  try {
    tell(watcher)
  } catch (error) {
    if (!watcherFailed)
      console.warn(`Could not record an agent process: ${(error as Error).message}`)
    watcherFailed = true
  }
}

interface Running {
  /** Ask the process to end, and end it for good if it has not within `graceMs`. */
  stop(graceMs: number): void
  /** Settles when the run has: the process is gone, or was given up on. */
  settled: Promise<void>
}

/** Every run started here that has not settled yet. */
const running = new Set<Running>()

/** Set once this process is going away: nothing more is started. */
let stopping = false

/** Whether `stopAll` has begun: a process that ended since was ended by it. */
export const isStopping = (): boolean => stopping

/**
 * End every process still running, and wait until each is gone. For when the
 * process that started them is going away itself: a process left behind keeps
 * working, and spending, with nothing left to read it. From here on `exec`
 * starts nothing, so a job that was between two agents cannot start the next.
 */
export async function stopAll(graceMs = 2000): Promise<void> {
  stopping = true
  await Promise.all(
    [...running].map((run) => {
      run.stop(graceMs)
      return run.settled
    }),
  )
}

/** The last `max` characters of what it is given. */
function tailOf(max: number) {
  let text = ''
  return {
    add(chunk: string): void {
      text += chunk
      if (text.length > max * 2) text = text.slice(-max)
    },
    text: (): string => text.slice(-max),
  }
}

/**
 * Run a command to completion, streaming stdout lines to `onLine`. On timeout
 * the process gets SIGTERM, then SIGKILL five seconds later. The run settles
 * a moment after that whatever the process does: one that left the group and
 * still holds the output open would otherwise keep it waiting for ever. A
 * process that exits while something it started still holds the output open
 * settles half a second after its last output, with its own exit code; a
 * shell line's leftover group is ended then, on POSIX. Rejects with
 * "Stopping." once `stopAll` has been called.
 */
export function exec(command: string, args: string[], options: ExecOptions): Promise<ExecResult> {
  if (stopping) return Promise.reject(new Error('Stopping.'))
  const result: ExecResult = {
    code: null,
    signal: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    spawnError: null,
  }
  if (options.signal?.aborted) return Promise.resolve(result)
  let child: ChildProcess
  try {
    child = spawnCommand(command, args, options)
  } catch (error) {
    // Too long a command line, a line break Windows cannot carry: nothing was started.
    result.spawnError = (error as Error).message
    return Promise.resolve(result)
  }
  return new Promise((done) => {
    const maxOutput = options.maxOutput ?? MAX_OUTPUT
    const lastOut = tailOf(TAIL)
    const lastErr = tailOf(TAIL)
    let buffer = ''
    let lineError: string | null = null
    let settled = false
    let exited = false
    let killing = false
    /** A stop was asked for: the group is ended, whoever is left in it. */
    let ending = false
    let kill: NodeJS.Timeout | undefined
    let giveUp: NodeJS.Timeout | undefined
    let linger: NodeJS.Timeout | undefined
    /** How the process itself exited, once it has: the output may still be open. */
    let exitedWith: { code: number | null; signal: NodeJS.Signals | null } | null = null

    // Recorded only for a command of its own: a shell line names no one program.
    const watched = child.pid !== undefined && !options.shell
    if (watched) report((to) => to.started(child.pid as number, command))
    const gone = () => {
      if (exited) return
      exited = true
      if (watched) report((to) => to.ended(child.pid as number))
    }

    /** A handler that throws would do so inside the stream's own event: keep the first, end the run. */
    const line = (text: string) => {
      if (lineError !== null) return
      try {
        options.onLine?.(text)
      } catch (error) {
        lineError = (error as Error).message
        stop(GRACE_MS)
      }
    }

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(kill)
      clearTimeout(giveUp)
      clearTimeout(linger)
      options.signal?.removeEventListener('abort', onAbort)
      running.delete(run)
      gone()
      if (buffer.trim() && options.onLine) line(buffer)
      result.code = code
      result.signal = signal
      if (options.onLine) result.stdout = lastOut.text()
      result.stderr = lastErr.text()
      if (lineError !== null) result.stderr = `${result.stderr}\n${lineError}`.trim()
      done(result)
      settle()
    }

    const stop = (graceMs: number) => {
      if (settled || killing) return
      ending = true
      clearTimeout(kill)
      kill = setTimeout(() => {
        killing = true
        signalTree(child, 'SIGKILL')
        giveUp = setTimeout(() => {
          // Whatever still holds the pipes is not ours to wait for.
          child.stdout?.destroy()
          child.stderr?.destroy()
          finish(child.exitCode, child.signalCode)
        }, SETTLE_MS)
        giveUp.unref()
      }, graceMs)
      kill.unref()
      signalTree(child, 'SIGTERM')
    }
    /**
     * After the exit, wait for the output to close, and go on without it once
     * it has been quiet a while: what still holds it is not the command.
     */
    const quiet = () => {
      if (!exitedWith || settled) return
      clearTimeout(linger)
      linger = setTimeout(() => {
        // A shell line's background job is the check's own leftover, and a stopped
        // run's group was being ended anyway: either goes with the run.
        if ((options.shell || ending) && !WIN32) signalTree(child, 'SIGKILL')
        child.stdout?.destroy()
        child.stderr?.destroy()
        finish(exitedWith?.code ?? null, exitedWith?.signal ?? null)
      }, EXIT_SETTLE_MS)
      linger.unref()
    }
    const onAbort = () => stop(GRACE_MS)
    const timer = setTimeout(() => {
      result.timedOut = true
      stop(GRACE_MS)
    }, options.timeoutMs)

    let settle: () => void = () => {}
    const run: Running = {
      stop,
      settled: new Promise<void>((resolve) => {
        settle = resolve
      }),
    }
    running.add(run)

    options.signal?.addEventListener('abort', onAbort, { once: true })
    // Decoded as a stream, so a character split across two chunks arrives whole.
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (text: string) => {
      quiet()
      if (!options.onLine) {
        if (result.stdout.length < maxOutput)
          result.stdout += text.slice(0, maxOutput - result.stdout.length)
        return
      }
      lastOut.add(text)
      buffer += text
      let at = buffer.indexOf('\n')
      while (at >= 0) {
        const whole = buffer.slice(0, at)
        buffer = buffer.slice(at + 1)
        if (whole.trim()) line(whole)
        at = buffer.indexOf('\n')
      }
      // One line longer than everything kept is not a line anyone reads.
      if (buffer.length > maxOutput) buffer = ''
    })
    child.stderr?.on('data', (text: string) => {
      quiet()
      lastErr.add(text)
    })
    child.once('exit', (code, signal) => {
      gone()
      exitedWith = { code, signal }
      quiet()
    })
    child.on('error', (error) => {
      result.spawnError = error.message
      // A process that could not start has no exit to wait for.
      if (child.pid === undefined) finish(null, null)
    })
    child.on('close', finish)
    // EPIPE when the child exits before reading stdin; its exit code reports the failure.
    child.stdin?.on('error', () => {})
    child.stdin?.end(options.input)
  })
}

/**
 * A runner of check and lint commands for the judge packs: a shell command
 * line, run by `exec` so it is ended as a group, stopped by `signal` and by
 * `stopAll`, and kept from the app's own keys. A check command runs what the
 * skill's author wrote. Stopped before it starts or while it runs, it rejects
 * with "Stopped.": a command ended part way says nothing of the output, so it
 * is never read as the check's answer.
 */
export const commandRunner =
  (signal?: AbortSignal): CommandRunner =>
  async (command, options) => {
    if (signal?.aborted) throw new Error(STOPPED)
    const run = await exec(command, [], { ...options, shell: true, signal })
    if (signal?.aborted) throw new Error(STOPPED)
    const combined = [run.stdout, run.stderr, run.spawnError ?? ''].join('\n').trim()
    return {
      exit: run.code,
      stdout: run.stdout,
      tail: combined.length > 600 ? `…${combined.slice(-600)}` : combined,
      timedOut: run.timedOut,
    }
  }
