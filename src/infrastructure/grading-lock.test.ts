import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCK_FILE, STAMP_LOCK_FILE, takeGradingLock, takeStampLock } from './grading-lock.ts'

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

  it('takes over a lock older than any grading, though a process has its pid', () => {
    const dir = folder()
    // A copy that ended long ago, whose pid the system gave to a program that is running.
    const at = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
    writeFileSync(join(dir, LOCK_FILE), JSON.stringify({ pid: process.ppid, at, by: 'st serve' }))
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

describe('takeStampLock', () => {
  const holding = (dir: string, pid: number): void =>
    writeFileSync(
      join(dir, STAMP_LOCK_FILE),
      JSON.stringify({ pid, at: new Date().toISOString(), by: 'st serve' }),
    )

  it('takes over at once a lock left by a process that was killed', async () => {
    const dir = folder()
    holding(dir, deadPid())
    const release = await takeStampLock(dir)
    expect(JSON.parse(readFileSync(join(dir, STAMP_LOCK_FILE), 'utf8')).pid).toBe(process.pid)
    release()
    expect(existsSync(join(dir, STAMP_LOCK_FILE))).toBe(false)
  })

  it('waits while a running process holds it, and takes it once it is given back', async () => {
    const dir = folder()
    holding(dir, process.ppid)
    let taken = false
    const taking = takeStampLock(dir).then((release) => {
      taken = true
      return release
    })
    await new Promise((done) => setTimeout(done, 100))
    expect(taken).toBe(false)
    rmSync(join(dir, STAMP_LOCK_FILE))
    const release = await taking
    expect(JSON.parse(readFileSync(join(dir, STAMP_LOCK_FILE), 'utf8')).pid).toBe(process.pid)
    release()
  })

  it('refuses with who holds it once a running process has held it for a minute', async () => {
    const dir = folder()
    holding(dir, process.ppid)
    vi.useFakeTimers()
    try {
      const refused = expect(takeStampLock(dir)).rejects.toThrow(
        'Another run of this skill is still starting (st serve). Try again once it has started.',
      )
      await vi.advanceTimersByTimeAsync(61_000)
      await refused
    } finally {
      vi.useRealTimers()
    }
    // The holder's lock is left as it was.
    expect(JSON.parse(readFileSync(join(dir, STAMP_LOCK_FILE), 'utf8')).pid).toBe(process.ppid)
  })
})
