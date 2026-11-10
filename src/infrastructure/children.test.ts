import { spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

/** Run before each `ps` the module runs, as another copy writing the file meanwhile would. */
const meanwhile = vi.hoisted(() => ({ hook: null as (() => void) | null }))
vi.mock('node:child_process', async (actual) => {
  const real = await actual<typeof import('node:child_process')>()
  return {
    ...real,
    spawnSync: ((...args: Parameters<typeof real.spawnSync>) => {
      if (args[0] === 'ps') meanwhile.hook?.()
      return real.spawnSync(...args)
    }) as typeof real.spawnSync,
  }
})

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-children-home-'))
process.env.SKILL_STUDIO_HOME = home
afterAll(() => rmSync(home, { recursive: true, force: true }))
const { agentWatcher, endOrphans } = await import('./children.ts')
const { readJson } = await import('./fs.ts')

const file = join(home, '.skill-studio', 'agents.json')
const records = () => readJson<Array<{ pid: number; command: string }>>(file, [])

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * A process that stays up until ended, leading its own group as `exec` starts
 * them, and named `claude` on its command line as an agent is.
 */
function stayer(): number {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    argv0: 'claude',
  })
  child.unref()
  return child.pid as number
}

const started: number[] = []
afterEach(() => {
  for (const pid of started)
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  started.length = 0
  meanwhile.hook = null
  writeFileSync(file, '[]')
})

/** Wait until `met` holds, asking every few milliseconds, five seconds at most. Says whether it did. */
async function until(met: () => boolean, withinMs = 5000): Promise<boolean> {
  const deadline = Date.now() + withinMs
  while (!met()) {
    if (Date.now() > deadline) return false
    await new Promise((wait) => setTimeout(wait, 10))
  }
  return true
}

describe('agentWatcher', () => {
  it('records the agent CLIs only, and drops a record when the process ends', () => {
    agentWatcher.started(101, '/Users/a/.local/bin/claude')
    agentWatcher.started(102, 'C:\\tools\\codex.cmd')
    agentWatcher.started(103, process.execPath)
    expect(records().map((c) => `${c.pid}:${c.command}`)).toEqual(['101:claude', '102:codex'])
    agentWatcher.ended(101)
    agentWatcher.ended(103)
    expect(records().map((c) => c.pid)).toEqual([102])
  })
})

const now = () => new Date().toISOString()
/** No process has this pid: a backend that is gone. */
const GONE = 2 ** 22 - 1
/** This process as a record's owner, as `agentWatcher` writes it. */
function self(): { pid: number; startedAt: string } {
  agentWatcher.started(GONE - 1, 'claude')
  const [{ owner }] = readJson<Array<{ owner: { pid: number; startedAt: string } }>>(file, [])
  writeFileSync(file, '[]')
  return owner
}

describe('endOrphans', () => {
  it.skipIf(process.platform === 'win32')(
    'ends a recorded process whose backend is gone, and drops the record',
    async () => {
      const pids = [stayer(), stayer()]
      started.push(...pids)
      expect(await until(() => pids.every(alive))).toBe(true)
      writeFileSync(
        file,
        JSON.stringify([
          {
            pid: pids[0],
            command: 'claude',
            startedAt: now(),
            owner: { pid: GONE, startedAt: now() },
          },
          // A record from before owners were written.
          { pid: pids[1], command: 'claude', startedAt: now() },
        ]),
      )

      expect(endOrphans()).toEqual(pids)

      // Gone once this process has collected it, which takes a turn of the loop.
      expect(await until(() => !pids.some(alive))).toBe(true)
      expect(records()).toEqual([])
    },
  )

  it.skipIf(process.platform === 'win32')(
    "leaves another running copy's agents alone, and their records in the file",
    async () => {
      const pid = stayer()
      started.push(pid)
      expect(await until(() => alive(pid))).toBe(true)
      const owner = self()
      writeFileSync(file, JSON.stringify([{ pid, command: 'claude', startedAt: now(), owner }]))

      expect(endOrphans()).toEqual([])

      expect(alive(pid)).toBe(true)
      expect(records()).toMatchObject([{ pid, command: 'claude', owner }])
    },
  )

  it.skipIf(process.platform === 'win32')(
    'takes an owner whose pid now belongs to a later process as gone',
    async () => {
      const pid = stayer()
      started.push(pid)
      expect(await until(() => alive(pid))).toBe(true)
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
      const owner = { pid: process.pid, startedAt: hourAgo }
      writeFileSync(file, JSON.stringify([{ pid, command: 'claude', startedAt: now(), owner }]))

      expect(endOrphans()).toEqual([pid])
      expect(await until(() => !alive(pid))).toBe(true)
    },
  )

  it.skipIf(process.platform === 'win32')(
    'leaves a pid alone when it is not the recorded process any more',
    async () => {
      const pid = stayer()
      started.push(pid)
      expect(await until(() => alive(pid))).toBe(true)
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
      writeFileSync(
        file,
        JSON.stringify([
          // Started long before the record says: the pid was given out again.
          { pid, command: 'claude', startedAt: hourAgo },
          // Named for a program this one is not.
          { pid, command: 'codex', startedAt: now() },
          // No such process.
          { pid: GONE, command: 'claude', startedAt: now() },
        ]),
      )

      expect(endOrphans()).toEqual([])

      expect(alive(pid)).toBe(true)
      expect(records()).toEqual([])
    },
  )

  it.skipIf(process.platform === 'win32')(
    'acts on nothing in the file that is not a record of an agent',
    async () => {
      const pid = stayer()
      started.push(pid)
      expect(await until(() => alive(pid))).toBe(true)
      writeFileSync(
        file,
        JSON.stringify([
          // A command that would be a pattern of its own, matching any process.
          { pid, command: '.*', startedAt: now() },
          { pid, command: 'node', startedAt: now() },
          // Pids that are not one process: a signal to minus these reaches every process there is.
          { pid: 1, command: 'claude', startedAt: now() },
          { pid: 0, command: 'claude', startedAt: now() },
          { pid: -pid, command: 'claude', startedAt: now() },
          { pid: String(pid), command: 'claude', startedAt: now() },
          { pid: pid + 0.5, command: 'claude', startedAt: now() },
          { pid, command: 'claude' },
          null,
          'claude',
        ]),
      )

      expect(endOrphans()).toEqual([])
      expect(alive(pid)).toBe(true)
    },
  )

  it('does nothing with no record', () => {
    expect(endOrphans()).toEqual([])
  })

  it.skipIf(process.platform === 'win32')(
    'keeps a record another copy wrote while it checked, and drops only the orphans',
    async () => {
      const pid = stayer()
      started.push(pid)
      expect(await until(() => alive(pid))).toBe(true)
      const orphan = {
        pid,
        command: 'claude',
        startedAt: now(),
        owner: { pid: GONE, startedAt: now() },
      }
      // A record of this process's own, standing in for another copy still running.
      const other = { pid: GONE - 2, command: 'codex', startedAt: now(), owner: self() }
      writeFileSync(file, JSON.stringify([orphan]))
      meanwhile.hook = () => {
        meanwhile.hook = null
        agentWatcher.started(other.pid, 'codex')
      }

      expect(endOrphans()).toEqual([pid])

      expect(records().map((c) => `${c.pid}:${c.command}`)).toEqual([`${other.pid}:codex`])
    },
  )

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'ends the orphans all the same when the record cannot be written, and warns',
    async () => {
      const pid = stayer()
      started.push(pid)
      expect(await until(() => alive(pid))).toBe(true)
      writeFileSync(file, JSON.stringify([{ pid, command: 'claude', startedAt: now() }]))
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const folder = join(file, '..')
      chmodSync(folder, 0o500)
      let warned: unknown[][] = []
      try {
        expect(endOrphans()).toEqual([pid])
        warned = [...warn.mock.calls]
      } finally {
        chmodSync(folder, 0o700)
        warn.mockRestore()
      }
      expect(warned).toHaveLength(1)
      expect(String(warned[0][0])).toMatch('Could not update the record of agent processes')
      expect(await until(() => !alive(pid))).toBe(true)
    },
  )
})
