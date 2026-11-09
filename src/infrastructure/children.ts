/**
 * The agent processes this backend has started, kept in a file so that a
 * backend that dies can have them ended by the next one. A `claude` run left
 * behind keeps working, and billing, for up to twenty minutes with nothing to
 * read it. Only a pid that still names the recorded command, started at the
 * recorded time, is ended: a pid the system has given to something else since
 * is left alone.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import type { ChildWatcher } from './exec.ts'
import { readJson, writeJson } from './fs.ts'
import { STUDIO_DIR } from './library.ts'

const FILE = join(STUDIO_DIR, 'agents.json')

/** The CLIs that keep working after the process that started them is gone. */
const AGENT_COMMANDS = new Set(['claude', 'cursor-agent', 'codex'])

/** How far the process's own start time may sit from the recorded one and still be the same process. */
const SAME_START_MS = 30_000

interface Child {
  pid: number
  command: string
  startedAt: string
}

/** The command's name without its folder or Windows extension: `claude` for `C:\...\claude.cmd`. */
const nameOf = (command: string): string =>
  (command.split(/[\\/]/).pop() ?? command).replace(/\.(exe|cmd|bat|com)$/i, '')

function readChildren(): Child[] {
  try {
    const value = readJson<unknown>(FILE, [])
    return Array.isArray(value) ? (value as Child[]) : []
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
      { pid, command: nameOf(command), startedAt: new Date().toISOString() },
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
    })
    const image = /^"([^"]+)"/.exec(out.stdout?.trim() ?? '')?.[1]
    return image !== undefined && nameOf(image) === child.command
  }
  const out = spawnSync('ps', ['-o', 'etime=,command=', '-p', String(child.pid)], {
    encoding: 'utf8',
  })
  if (out.status !== 0) return false
  const line = out.stdout.trim()
  const space = line.indexOf(' ')
  if (space < 0) return false
  const elapsed = elapsedMs(line.slice(0, space))
  const commandLine = line.slice(space + 1).trim()
  const started = Date.parse(child.startedAt)
  if (elapsed === null || Number.isNaN(started)) return false
  const named = new RegExp(`(^|[/\\s])${child.command}(\\s|$)`).test(commandLine)
  return named && Math.abs(now - elapsed - started) <= SAME_START_MS
}

function endProcess(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
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

/**
 * End the agent processes an earlier backend recorded and did not see end,
 * and clear the record. Returns the pids ended. For the start of a backend.
 */
export function endOrphans(now = Date.now()): number[] {
  const children = readChildren()
  if (!children.length) return []
  const ended: number[] = []
  for (const child of children) {
    if (!isStillOurs(child, now)) continue
    endProcess(child.pid)
    ended.push(child.pid)
  }
  writeJson(FILE, [])
  return ended
}
