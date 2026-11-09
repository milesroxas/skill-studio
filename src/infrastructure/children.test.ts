import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-children-home-'))
process.env.SKILL_STUDIO_HOME = home
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

/** A process that stays up until ended, leading its own group as `exec` starts them. */
function stayer(): number {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
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
  writeFileSync(file, '[]')
})

const settle = () => new Promise((wait) => setTimeout(wait, 150))

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

describe('endOrphans', () => {
  it.skipIf(process.platform === 'win32')(
    'ends a recorded process that is still the one recorded, and clears the record',
    async () => {
      const pid = stayer()
      started.push(pid)
      await settle()
      writeFileSync(
        file,
        JSON.stringify([{ pid, command: 'node', startedAt: new Date().toISOString() }]),
      )

      expect(endOrphans()).toEqual([pid])
      await settle()

      expect(alive(pid)).toBe(false)
      expect(records()).toEqual([])
    },
  )

  it.skipIf(process.platform === 'win32')(
    'leaves a pid alone when it is not the recorded process any more',
    async () => {
      const pid = stayer()
      started.push(pid)
      await settle()
      const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
      writeFileSync(
        file,
        JSON.stringify([
          // Started long before the record says: the pid was given out again.
          { pid, command: 'node', startedAt: hourAgo },
          // Named for a program this one is not.
          { pid, command: 'claude', startedAt: new Date().toISOString() },
          // No such process.
          { pid: 2 ** 22 - 1, command: 'node', startedAt: new Date().toISOString() },
        ]),
      )

      expect(endOrphans()).toEqual([])

      expect(alive(pid)).toBe(true)
      expect(records()).toEqual([])
    },
  )

  it('does nothing with no record', () => {
    expect(endOrphans()).toEqual([])
  })
})
