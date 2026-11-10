/**
 * The agent processes this backend has started, kept in a file so that a
 * backend that dies can have them ended by the next one. A `claude` run left
 * behind keeps working, and billing, for up to twenty minutes with nothing to
 * read it. The file is shared by every copy of the app that is running (the
 * installed app, `pnpm dev`, `st`), so each record names the backend that owns
 * it, and only a record whose owner is gone is acted on. Only a pid that still
 * names the recorded command, started at the recorded time, is ended: a pid
 * the system has given to something else since is left alone.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { agentEnv } from './env.ts'
import type { ChildWatcher } from './exec.ts'
import { readJson, writeJson } from './fs.ts'
import { STUDIO_DIR } from './library.ts'

const FILE = join(STUDIO_DIR, 'agents.json')

/** The CLIs that keep working after the process that started them is gone. */
const AGENT_COMMANDS = new Set(['claude', 'cursor-agent', 'codex'])

/** How far the process's own start time may sit from the recorded one and still be the same process. */
const SAME_START_MS = 30_000

/** A process as the record names it: a pid alone can be handed to another process later. */
interface Process {
  pid: number
  startedAt: string
}

interface Child extends Process {
  command: string
  /** The backend that started it. A record without one is from a backend that is gone. */
  owner?: Process
}

/** This backend, as the owner of what it starts. */
const SELF: Process = {
  pid: process.pid,
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
}

/** The command's name without its folder or Windows extension: `claude` for `C:\...\claude.cmd`. */
const nameOf = (command: string): string =>
  (command.split(/[\\/]/).pop() ?? command).replace(/\.(exe|cmd|bat|com)$/i, '')

function asProcess(value: unknown): Process | null {
  if (!value || typeof value !== 'object') return null
  const { pid, startedAt } = value as Record<string, unknown>
  // Pid 0 and 1 are never an agent, and a signal to minus one of them reaches far more.
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 1) return null
  return typeof startedAt === 'string' ? { pid, startedAt } : null
}

/**
 * One record, when it is one. The file is anyone's to write, and what it holds
 * goes into a signal and a pattern: a pid that is not a process id, or a
 * command that is not one of the agents', is dropped.
 */
function asChild(value: unknown): Child | null {
  const named = asProcess(value)
  if (!named) return null
  const { command, owner } = value as Record<string, unknown>
  if (typeof command !== 'string' || !AGENT_COMMANDS.has(command)) return null
  return { ...named, command, owner: asProcess(owner) ?? undefined }
}

function readChildren(): Child[] {
  try {
    const value = readJson<unknown>(FILE, [])
    return Array.isArray(value) ? value.flatMap((entry) => asChild(entry) ?? []) : []
  } catch {
    return []
  }
}

/** Records every agent process `exec` starts, and drops it when it ends. */
export const agentWatcher: ChildWatcher = {
  started: (pid, command) => {
    if (!AGENT_COMMANDS.has(nameOf(command))) return
    writeJson(FILE, [
      ...readChildren().filter((c) => c.pid !== pid),
      { pid, command: nameOf(command), startedAt: new Date().toISOString(), owner: SELF },
    ])
  },
  ended: (pid) => {
    const children = readChildren()
    if (children.some((c) => c.pid === pid))
      writeJson(
        FILE,
        children.filter((c) => c.pid !== pid),
      )
  },
}

/** `ps` elapsed time, `[[dd-]hh:]mm:ss`, in milliseconds. */
function elapsedMs(etime: string): number | null {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(etime.trim())
  if (!match) return null
  const [, days = '0', hours = '0', minutes, seconds] = match
  return (
    ((Number(days) * 24 + Number(hours)) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000
  )
}

/** When a process started and its command line, as `ps` has them; null when there is no such process. */
function psOf(pid: number, now: number): { startedAt: number; commandLine: string } | null {
  const out = spawnSync('ps', ['-o', 'etime=,command=', '-p', String(pid)], {
    encoding: 'utf8',
    env: agentEnv(),
  })
  if (out.status !== 0) return null
  const line = out.stdout.trim()
  const space = line.indexOf(' ')
  if (space < 0) return null
  const elapsed = elapsedMs(line.slice(0, space))
  return elapsed === null
    ? null
    : { startedAt: now - elapsed, commandLine: line.slice(space + 1).trim() }
}

const sameStart = (recorded: string, startedAt: number): boolean =>
  Math.abs(startedAt - Date.parse(recorded)) <= SAME_START_MS

/**
 * Whether `pid` is still the recorded process: on POSIX its command line names
 * the command and it started when the record says; on Windows its image is the
 * command's own program (`claude.exe`). A CLI run by `node.exe` cannot be told
 * apart from any other Node program there, so it is left alone.
 */
function isStillOurs(child: Child, now: number): boolean {
  if (process.platform === 'win32') {
    const out = spawnSync('tasklist', ['/FI', `PID eq ${child.pid}`, '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      env: agentEnv(),
    })
    const image = /^"([^"]+)"/.exec(out.stdout?.trim() ?? '')?.[1]
    return image !== undefined && nameOf(image) === child.command
  }
  const found = psOf(child.pid, now)
  if (!found) return false
  // The command is one of the agents' names, checked as the record was read.
  const named = new RegExp(`(^|[/\\s])${child.command}(\\s|$)`).test(found.commandLine)
  return named && sameStart(child.startedAt, found.startedAt)
}

/**
 * Whether the backend that owns a record is still running: its pid is alive
 * and, on POSIX, started when the record says. On Windows a live pid counts,
 * so a pid handed to another program keeps a record a while longer; it never
 * ends a running copy's agents.
 */
function ownerAlive(owner: Process | undefined, now: number): boolean {
  if (!owner) return false
  if (owner.pid === SELF.pid) return owner.startedAt === SELF.startedAt
  try {
    process.kill(owner.pid, 0)
  } catch (error) {
    // No such process. One that is there but not ours to signal (EPERM) is alive.
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') return false
  }
  if (process.platform === 'win32') return true
  const found = psOf(owner.pid, now)
  return found !== null && sameStart(owner.startedAt, found.startedAt)
}

function endProcess(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', env: agentEnv() })
    return
  }
  // The process was started as a group leader, so its group goes with it.
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}

/** The same record: the same process, recorded by the same backend. */
const sameRecord = (a: Child, b: Child): boolean =>
  a.pid === b.pid &&
  a.startedAt === b.startedAt &&
  a.command === b.command &&
  a.owner?.pid === b.owner?.pid &&
  a.owner?.startedAt === b.owner?.startedAt

/**
 * End the agent processes that a backend now gone recorded and did not see
 * end, and drop their records. A record whose backend is still running, in
 * another copy of the app, is left as it is. Returns the pids ended. For the
 * start of a backend.
 *
 * Checking each record runs `ps`, and another copy may record an agent, or
 * drop one, meanwhile: the file is read again just before it is written, and
 * only the records found orphaned are taken out of it. A write that fails (a
 * full disk, a folder that cannot be written) is warned of and the start goes
 * on: the records stay for the next copy to act on.
 */
export function endOrphans(now = Date.now()): number[] {
  const children = readChildren()
  if (!children.length) return []
  const ended: number[] = []
  const dropped: Child[] = []
  for (const child of children) {
    if (ownerAlive(child.owner, now)) continue
    dropped.push(child)
    if (isStillOurs(child, now)) {
      endProcess(child.pid)
      ended.push(child.pid)
    }
  }
  if (!dropped.length) return ended
  try {
    writeJson(
      FILE,
      readChildren().filter((child) => !dropped.some((gone) => sameRecord(gone, child))),
    )
  } catch (error) {
    console.warn(`Could not update the record of agent processes: ${(error as Error).message}`)
  }
  return ended
}
