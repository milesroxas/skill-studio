/**
 * The server `st open` starts: one for each checkout, since two worktrees each
 * have their own build of the app. It is an `st serve` started as a detached
 * copy of the command line, on a port the system picks. It writes a file in
 * the studio folder, readable by the user alone, that holds its pid, port and
 * token, and removes it as it stops. `st open` reads the token there to ask the
 * server for a one-use ticket, and prints only the ticket's address: the token
 * is never printed, never in a process's arguments and never in an address.
 *
 * What the server writes to stderr goes to a log beside its file, made anew,
 * readable by the user alone, at each start, and kept after it stops: it is
 * what explains a server that died. Its stdout, where `st serve` prints the
 * address that carries the token, goes nowhere.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'
import { anyRunning } from '@application/jobs.ts'
import { realPath } from '@infrastructure/fs.ts'
import { STUDIO_DIR } from '@infrastructure/library.ts'
import { CHECKOUT } from '../host.ts'
import { TICKET_PARAM, TICKET_PATH, TOKEN_HEADER } from '../http/guard.ts'
import type { Server } from '../http/server.ts'

export interface OpenServer {
  pid: number
  port: number
  token: string
  /** The checkout it serves from, by its real path. */
  checkout: string
}

/** Set on the `st serve` that `st open` starts, so it serves as below. */
const OPENED = 'ST_OPEN_SERVER'
/** How long `st open` waits for the server it started, and for one it stops. */
const WAIT_MS = 10_000
/** How long the server goes with no request before it stops itself. */
const IDLE_MS = 60 * 60_000
/** How often the server asks itself whether to stop. */
const CHECK_MS = 60_000

/** The checkout this copy of `st` runs from, by its real path. */
const thisCheckout = (): string => realPath(CHECKOUT)

/** How a checkout's server's files are named in the studio folder: `open-<hash>`. */
const stemOf = (checkout: string): string =>
  join(STUDIO_DIR, `open-${createHash('sha256').update(checkout).digest('hex').slice(0, 8)}`)

/** The file of the server for `checkout`, in the studio folder and never in the checkout. */
const serverFile = (checkout: string): string => `${stemOf(checkout)}.json`

/** Where the server for `checkout` writes its stderr, beside its file. */
const serverLog = (checkout: string): string => `${stemOf(checkout)}.log`

/** The most the log holds: past it, its oldest half goes (`logCap`). */
const LOG_MAX = 1024 * 1024

/**
 * The log for a server about to start, made anew and readable by the user
 * alone from its first byte, open for appending: what the server wrote before
 * is gone. Its descriptor, for the server's stderr.
 */
function freshLog(checkout: string): number {
  const log = serverLog(checkout)
  mkdirSync(STUDIO_DIR, { recursive: true })
  for (let tries = 0; ; tries++) {
    rmSync(log, { force: true })
    try {
      // Made here, never one that was there: a file another account put in its place is not written to.
      const fd = openSync(log, 'ax', 0o600)
      // A new file's mode is otherwise cut down by the umask.
      if (process.platform !== 'win32') fchmodSync(fd, 0o600)
      return fd
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Windows keeps the name of a removed file while a process still has it open: start it over in place.
      if (process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY')) {
        const fd = openSync(log, 'a')
        ftruncateSync(fd, 0)
        return fd
      }
      // Another `st open` made it between the two steps: make it again, once.
      if (code !== 'EEXIST' || tries > 0) throw error
    }
  }
}

/**
 * Keep the log at `path`, which `fd` appends to, under `max` bytes: once it
 * passes that, its newest half stays, after a line that says the rest went.
 * Nothing is done where `fd` is not that file.
 */
export function logCap(path: string, fd: number, max = LOG_MAX): () => void {
  return () => {
    let size: number
    try {
      const own = fstatSync(fd)
      const named = statSync(path)
      if (!own.isFile() || own.ino !== named.ino || own.dev !== named.dev) return
      size = own.size
    } catch {
      return
    }
    if (size <= max) return
    const keep = Buffer.alloc(Math.floor(max / 2))
    const read = openSync(path, 'r')
    try {
      readSync(read, keep, 0, keep.length, size - keep.length)
    } finally {
      closeSync(read)
    }
    // Appending, the descriptor writes at the new end.
    truncateSync(path, 0)
    writeSync(
      fd,
      `[${new Date().toISOString()}: the log passed ${max} bytes; its oldest lines went]\n`,
    )
    writeSync(fd, keep)
  }
}

/** True while a process has the pid: one of another user's answers EPERM. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

const isServer = (value: unknown): value is OpenServer => {
  const v = value as Partial<OpenServer> | null
  return (
    typeof v?.pid === 'number' &&
    typeof v.port === 'number' &&
    typeof v.token === 'string' &&
    typeof v.checkout === 'string'
  )
}

/** The file's server, when its file names one: whatever else the file holds is read as none. */
function fileServer(checkout: string): OpenServer | null {
  try {
    const value: unknown = JSON.parse(readFileSync(serverFile(checkout), 'utf8'))
    return isServer(value) ? value : null
  } catch {
    return null
  }
}

/** Remove the file for `checkout` when it is the one `pid` wrote, or holds no server. */
function removeFile(checkout: string, pid: number): void {
  const named = fileServer(checkout)
  if (!named || named.pid === pid) rmSync(serverFile(checkout), { force: true })
}

/** The server running for `checkout`. A file whose process is gone, or that names none, is removed. */
function runningServer(checkout: string): OpenServer | null {
  const named = fileServer(checkout)
  if (named && alive(named.pid)) return named
  removeFile(checkout, named?.pid ?? -1)
  return null
}

/**
 * A ticket from the server, asked for with its token; null when nothing there
 * answers to the token, as when the server is gone and the system has given
 * its pid or port to another program.
 */
async function ticketFrom(server: OpenServer): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}${TICKET_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TOKEN_HEADER]: server.token },
      body: '{}',
      signal: AbortSignal.timeout(WAIT_MS),
    })
    if (!response.ok) return null
    const { ticket } = (await response.json()) as { ticket?: unknown }
    return typeof ticket === 'string' ? ticket : null
  } catch {
    return null
  }
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

/**
 * Start `st serve` as a detached copy of this command line, in the checkout,
 * its stderr to the log (`freshLog`) and its stdout, which carries the token,
 * nowhere.
 */
function startCopy(checkout: string): ChildProcess {
  const log = freshLog(checkout)
  try {
    const child = spawn(process.execPath, [...process.execArgv, process.argv[1], 'serve'], {
      cwd: checkout,
      detached: true,
      stdio: ['ignore', 'ignore', log],
      windowsHide: true,
      env: { ...process.env, [OPENED]: '1' },
    })
    child.unref()
    return child
  } finally {
    // The server holds its own copy.
    closeSync(log)
  }
}

/** The server a copy just started wrote the file for, `WAIT_MS` at most. */
async function startedServer(checkout: string): Promise<OpenServer> {
  const child = startCopy(checkout)
  let ended = false
  child.on('exit', () => {
    ended = true
  })
  child.on('error', () => {
    ended = true
  })
  const until = Date.now() + WAIT_MS
  while (Date.now() < until) {
    // The one that wrote it may be another `st open`'s, started at the same time: it serves as well.
    const found = runningServer(checkout)
    if (found) return found
    if (ended)
      throw new Error(
        `The server stopped as it started. What it wrote is in ${serverLog(checkout)}.`,
      )
    await pause(100)
  }
  child.kill()
  throw new Error(
    `The server did not start within ${WAIT_MS / 1000} seconds. What it wrote is in ${serverLog(checkout)}.`,
  )
}

/**
 * The server for this checkout and a ticket from it, starting one when none
 * is running. `started` is true when this call started it.
 */
export async function openServer(): Promise<{
  server: OpenServer
  ticket: string
  started: boolean
}> {
  const checkout = thisCheckout()
  const found = runningServer(checkout)
  if (found) {
    const ticket = await ticketFrom(found)
    if (ticket) return { server: found, ticket, started: false }
    // Another program has its pid now, or holds its port: the server the file names is gone.
    removeFile(checkout, found.pid)
  }
  const server = await startedServer(checkout)
  const ticket = await ticketFrom(server)
  if (!ticket) throw new Error('The server started but gave no ticket. Run pnpm st open again.')
  return { server, ticket, started: true }
}

/**
 * The address that opens `address` (`resultsAddress`) on the server at
 * `port`, with the ticket its first load trades for the cookie.
 */
export function ticketAddress(port: number, ticket: string, address: string): string {
  const at = address.indexOf('#')
  const search = new URLSearchParams(at < 0 ? address : address.slice(0, at))
  const query = new URLSearchParams({ [TICKET_PARAM]: ticket })
  for (const [name, value] of search) query.append(name, value)
  return `http://localhost:${port}/?${query}${at < 0 ? '' : address.slice(at)}`
}

/**
 * Stop this checkout's server and remove its file; the server stopped, or null
 * when none was running. A pid that no longer answers to the server's token is
 * another program's, and is left alone.
 */
export async function stopServer(): Promise<OpenServer | null> {
  const checkout = thisCheckout()
  const found = runningServer(checkout)
  if (!found) return null
  if (!(await ticketFrom(found))) {
    removeFile(checkout, found.pid)
    return null
  }
  process.kill(found.pid, 'SIGTERM')
  const until = Date.now() + WAIT_MS
  while (alive(found.pid)) {
    if (Date.now() >= until)
      throw new Error(
        `The server did not stop within ${WAIT_MS / 1000} seconds (pid ${found.pid}).`,
      )
    await pause(100)
  }
  removeFile(checkout, found.pid)
  return found
}

/**
 * Write the file for `server`, made only when there is none, so of two servers
 * started at once one serves and the other stops. A file whose process is gone
 * is taken over. False when another server holds it.
 */
function claim(server: OpenServer): boolean {
  const file = serverFile(server.checkout)
  mkdirSync(STUDIO_DIR, { recursive: true })
  const temp = `${file}.${server.pid}.tmp`
  try {
    writeFileSync(temp, `${JSON.stringify(server, null, 2)}\n`, { mode: 0o600 })
    // A new file's mode is otherwise cut down by the umask.
    chmodSync(temp, 0o600)
    for (let tries = 0; tries < 2; tries++) {
      try {
        // A link is made whole or not at all, so a reader never finds half the file.
        linkSync(temp, file)
        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (runningServer(server.checkout)) return false
      }
    }
    return false
  } finally {
    rmSync(temp, { force: true })
  }
}

/** Hold the log this process's stderr goes to under `LOG_MAX`, at every write to it. */
function capStderr(log: string): void {
  const cap = logCap(log, 2)
  const write = process.stderr.write.bind(process.stderr) as (...args: unknown[]) => boolean
  process.stderr.write = ((...args: unknown[]) => {
    const done = write(...args)
    cap()
    return done
  }) as typeof process.stderr.write
}

/** When the server asks itself whether to stop, and what it reads the time from. */
export interface IdleTiming {
  /** How long with no request before it stops. */
  idleMs: number
  /** How often it asks. */
  everyMs: number
  now: () => number
}

const TIMING: IdleTiming = { idleMs: IDLE_MS, everyMs: CHECK_MS, now: Date.now }

/**
 * What an `st serve` that `st open` started does to be found and to stop when
 * unused; null for any other `st serve`. `host` writes the server's file,
 * removed as the process exits, and calls `stop` once, when no job is running
 * and either an hour has gone with no request the access check let through
 * (`onRequest`, which the server calls for those alone) or its file is gone or names
 * another server: `st open` found it not answering and started another, so
 * nothing finds this one again. It is false when another server of this
 * checkout holds the file.
 */
export function openedServe(timing: IdleTiming = TIMING): {
  onRequest(): void
  host(server: Pick<Server, 'port' | 'token'>, stop: () => void): boolean
} | null {
  if (process.env[OPENED] !== '1') return null
  // Not handed on to the agents it starts, or to an `st` one of them runs.
  delete process.env[OPENED]
  capStderr(serverLog(thisCheckout()))
  let last = timing.now()
  return {
    onRequest: () => {
      last = timing.now()
    },
    host(server, stop) {
      const entry = {
        pid: process.pid,
        port: server.port,
        token: server.token,
        checkout: thisCheckout(),
      }
      if (!claim(entry)) return false
      process.on('exit', () => removeFile(entry.checkout, entry.pid))
      const check = setInterval(() => {
        // A run or a grading is never cut short: the server waits for every job to end.
        if (anyRunning()) return
        const lost = fileServer(entry.checkout)?.pid !== entry.pid
        if (!lost && timing.now() - last < timing.idleMs) return
        clearInterval(check)
        stop()
      }, timing.everyMs)
      // The server it serves keeps the process up; this alone does not.
      check.unref()
      return true
    },
  }
}
