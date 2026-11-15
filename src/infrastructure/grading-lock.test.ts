import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LOCK_FILE, takeGradingLock } from './grading-lock.ts'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const folder = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'st-lock-'))
  made.push(dir)
  return dir
}

/** The pid of a process that has ended. */
const deadPid = (): number => {
  const { pid } = spawnSync(process.execPath, ['-e', ''])
  if (!pid) throw new Error('no process')
  return pid
}

describe('takeGradingLock', () => {
  it('refuses a second grading while the first holds the lock, and gives it back', () => {
    const dir = folder()
    const release = takeGradingLock(dir)
    const holder = JSON.parse(readFileSync(join(dir, LOCK_FILE), 'utf8'))
    expect(holder.pid).toBe(process.pid)
    expect(() => takeGradingLock(dir)).toThrow(
      /^This run is already being graded by st in a terminal, since .+\. Try again once that grading is done\.$/,
    )
    release()
    expect(existsSync(join(dir, LOCK_FILE))).toBe(false)
    takeGradingLock(dir)()
  })

  it('refuses while another process that is running holds it, and names it', () => {
    const dir = folder()
    const at = new Date().toISOString()
    writeFileSync(join(dir, LOCK_FILE), JSON.stringify({ pid: process.ppid, at, by: 'st serve' }))
    expect(() => takeGradingLock(dir)).toThrow('already being graded by st serve')
    // The holder's lock is left as it was.
    expect(JSON.parse(readFileSync(join(dir, LOCK_FILE), 'utf8')).pid).toBe(process.ppid)
  })

  it('takes over a lock whose process has ended', () => {
    const dir = folder()
    writeFileSync(
      join(dir, LOCK_FILE),
      JSON.stringify({ pid: deadPid(), at: new Date().toISOString(), by: 'st in a terminal' }),
    )
    const release = takeGradingLock(dir)
    expect(JSON.parse(readFileSync(join(dir, LOCK_FILE), 'utf8')).pid).toBe(process.pid)
    release()
  })

  it('waits on a lock still being written, and takes over one never written whole', () => {
    const dir = folder()
    const path = join(dir, LOCK_FILE)
    writeFileSync(path, '')
    expect(() => takeGradingLock(dir)).toThrow('This run is already being graded.')
    const old = new Date(Date.now() - 60_000)
    utimesSync(path, old, old)
    takeGradingLock(dir)()
  })

  it('gives back only a lock it holds', () => {
    const dir = folder()
    const release = takeGradingLock(dir)
    // Another took the lock over meanwhile: giving back leaves theirs.
    writeFileSync(
      join(dir, LOCK_FILE),
      JSON.stringify({ pid: process.ppid, at: new Date().toISOString(), by: 'st serve' }),
    )
    release()
    expect(existsSync(join(dir, LOCK_FILE))).toBe(true)
  })
})
