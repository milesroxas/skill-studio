import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exec, resolveCommand, stopAll, watchChildren } from './exec.ts'

const node = process.execPath
/** Prints its pid, then stays up; `deaf` also ignores the request to end. */
const stay = (deaf: boolean): string[] => [
  '-e',
  `${deaf ? "process.on('SIGTERM', () => {});" : ''}console.log(process.pid);setInterval(() => {}, 1000)`,
]

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Start a process that stays up; gives its pid once it has printed it, and its end. */
async function start(deaf = false) {
  let ready: (pid: number) => void = () => {}
  const pid = new Promise<number>((resolve) => {
    ready = resolve
  })
  const done = exec(node, stay(deaf), {
    cwd: process.cwd(),
    timeoutMs: 30_000,
    onLine: (line) => ready(Number(line)),
  })
  return { pid: await pid, done }
}

describe('stopAll', () => {
  it('ends every process still running and waits until each is gone', async () => {
    const first = await start()
    const second = await start()

    await stopAll()

    expect(alive(first.pid)).toBe(false)
    expect(alive(second.pid)).toBe(false)
    expect((await first.done).timedOut).toBe(false)
  })

  it('ends a process that ignores the request, once the wait is over', async () => {
    const deaf = await start(true)

    await stopAll(100)

    expect(alive(deaf.pid)).toBe(false)
    // SIGKILL, where the platform says which signal ended it.
    if (process.platform !== 'win32') expect((await deaf.done).signal).toBe('SIGKILL')
  })

  it('has nothing to wait for when nothing is running', async () => {
    const finished = await exec(node, ['-e', ''], { cwd: process.cwd(), timeoutMs: 30_000 })
    expect(finished.code).toBe(0)

    await expect(stopAll()).resolves.toBeUndefined()
  })
})

describe('exec', () => {
  it('ends what the process started too, when it is ended', async () => {
    // A parent that starts a child of its own and prints both pids, as an agent's Bash tool does.
    const script = `
      const { spawn } = require('node:child_process')
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
      console.log(process.pid + ' ' + child.pid)
      setInterval(() => {}, 1000)
    `
    let ready: (pids: number[]) => void = () => {}
    const pids = new Promise<number[]>((resolve) => {
      ready = resolve
    })
    const controller = new AbortController()
    const done = exec(node, ['-e', script], {
      cwd: process.cwd(),
      timeoutMs: 30_000,
      signal: controller.signal,
      onLine: (line) => ready(line.split(' ').map(Number)),
    })
    const [parent, grandchild] = await pids
    expect(alive(grandchild)).toBe(true)

    controller.abort()
    await done
    // The grandchild hears the same signal; give it a moment to go.
    await new Promise((wait) => setTimeout(wait, 200))

    expect(alive(parent)).toBe(false)
    expect(alive(grandchild)).toBe(false)
  })

  it('reports each process to the watcher as it starts and ends', async () => {
    const started: string[] = []
    const ended: number[] = []
    watchChildren({
      started: (pid, command) => started.push(`${pid}:${command}`),
      ended: (pid) => ended.push(pid),
    })
    try {
      const result = await exec(node, ['-e', 'console.log(process.pid)'], {
        cwd: process.cwd(),
        timeoutMs: 30_000,
      })
      const pid = Number(result.stdout.trim())
      expect(started).toEqual([`${pid}:${node}`])
      expect(ended).toEqual([pid])
    } finally {
      watchChildren(null)
    }
  })

  it('says when the command cannot be started', async () => {
    const result = await exec('no-such-command-here', [], { cwd: process.cwd(), timeoutMs: 1000 })
    expect(result.spawnError).toMatch(/ENOENT/)
  })
})

describe('resolveCommand', () => {
  let bin: string
  beforeEach(() => {
    bin = mkdtempSync(join(tmpdir(), 'st-bin-'))
  })
  afterEach(() => rmSync(bin, { recursive: true, force: true }))

  it('finds a command in a PATH folder and gives its full path', () => {
    const tool = join(bin, 'st-tool')
    writeFileSync(tool, '#!/bin/sh\n')
    chmodSync(tool, 0o755)
    expect(resolveCommand('st-tool', { PATH: `/nowhere:${bin}` }, 'linux')).toBe(tool)
  })

  it('finds nothing for a name no folder holds, or with no PATH at all', () => {
    expect(resolveCommand('st-tool', { PATH: bin }, 'linux')).toBeNull()
    expect(resolveCommand('st-tool', {}, 'linux')).toBeNull()
  })

  it('skips a file that cannot be run, and a folder of that name', () => {
    writeFileSync(join(bin, 'st-plain'), 'text')
    chmodSync(join(bin, 'st-plain'), 0o644)
    mkdirSync(join(bin, 'st-dir'))
    const env = { PATH: bin }
    if (process.platform !== 'win32') expect(resolveCommand('st-plain', env, 'linux')).toBeNull()
    expect(resolveCommand('st-dir', env, 'linux')).toBeNull()
  })

  it('checks a name with a folder in it as given', () => {
    const tool = join(bin, 'st-tool')
    writeFileSync(tool, '#!/bin/sh\n')
    chmodSync(tool, 0o755)
    expect(resolveCommand(tool, { PATH: '' }, 'linux')).toBe(tool)
    expect(resolveCommand(join(bin, 'missing'), { PATH: '' }, 'linux')).toBeNull()
  })

  it('tries each PATHEXT extension on Windows, so an npm-installed CLI is found as its .CMD', () => {
    writeFileSync(join(bin, 'claude.CMD'), '@echo off\n')
    const env = { PATH: `C:\\nowhere;${bin}`, PATHEXT: '.COM;.EXE;.BAT;.CMD' }
    expect(resolveCommand('claude', env, 'win32')).toBe(join(bin, 'claude.CMD'))
    // A name that already carries an extension stands for itself.
    expect(resolveCommand('claude.CMD', env, 'win32')).toBe(join(bin, 'claude.CMD'))
    expect(resolveCommand('claude.EXE', env, 'win32')).toBeNull()
  })

  it('falls back to the usual extensions when PATHEXT is not set', () => {
    writeFileSync(join(bin, 'codex.EXE'), '')
    expect(resolveCommand('codex', { PATH: bin }, 'win32')).toBe(join(bin, 'codex.EXE'))
  })
})
