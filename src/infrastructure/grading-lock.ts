/**
 * One grading of a folder at a time, across every copy of the app on this
 * machine: the desktop app, `st serve` and `st` each keep their jobs in their
 * own memory, so a grading takes a lock file in the folder it grades. The file
 * is made only when there is none (`wx`), so of two gradings that start at
 * once one makes it. It holds the pid and the time of the one that holds it.
 * A lock whose process has ended is taken over, so a copy that crashed or was
 * killed holds nothing, and so is one taken more than twelve hours ago.
 */
import { linkSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The lock file, hidden, so no list of a run's files holds it. */
export const LOCK_FILE = '.grading.lock'

/** A lock just made may not have its text yet: one this young that does not read is still being written. */
const WRITING_MS = 10_000

/**
 * No grading takes this long. A lock older than this is left over from a copy
 * that ended, whose pid the system has since given to another program: it
 * would read as alive, and hold the run for good.
 */
const STALE_MS = 12 * 60 * 60 * 1000

interface Holder {
  pid: number
  /** When it was taken, as an ISO time. */
  at: string
  /** What holds it, as a reader would name it. */
  by: string
}

/** What this process is, as the line that refuses a second grading names it. */
function thisCopy(): string {
  if (process.versions.electron) return 'the Skill Studio app'
  return process.argv.includes('serve') ? 'st serve' : 'st in a terminal'
}

/** The locks this process holds, taken out when it exits however it exits. */
const held = new Set<string>()
let exitHooked = false

function releaseAllOnExit(): void {
  if (exitHooked) return
  exitHooked = true
  process.on('exit', () => {
    for (const path of held) removeIfMine(path)
  })
}

function readHolder(path: string): Holder | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<Holder>
    return typeof value.pid === 'number' && typeof value.at === 'string'
      ? { pid: value.pid, at: value.at, by: typeof value.by === 'string' ? value.by : 'st' }
      : null
  } catch {
    return null
  }
}

/** Whether `pid` is a process on this machine. One that is there but not ours to signal (EPERM) is. */
function alive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Whether the lock was taken longer ago than any grading runs; one with no time that reads has not. */
function outlived(holder: Holder): boolean {
  const at = Date.parse(holder.at)
  return !Number.isNaN(at) && Date.now() - at > STALE_MS
}

const same = (a: Holder | null, b: Holder | null): boolean =>
  a !== null && b !== null && a.pid === b.pid && a.at === b.at

function removeIfMine(path: string): void {
  const holder = readHolder(path)
  if (holder?.pid === process.pid) rmSync(path, { force: true })
  held.delete(path)
}

/** The line a second grading is refused with, naming who holds the lock and since when. */
function refusal(holder: Holder | null): Error {
  if (!holder)
    return new Error('This run is already being graded. Try again once that grading is done.')
  const since = new Date(holder.at)
  const time = Number.isNaN(since.getTime())
    ? ''
    : `, since ${since.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return new Error(
    `This run is already being graded by ${holder.by}${time}. Try again once that grading is done.`,
  )
}

/**
 * Take the lock of `dir` for one grading, or refuse with who holds it. The
 * function it returns gives it back; it is given back when the process exits
 * too. A lock left by a process that has ended is taken over.
 */
export function takeGradingLock(dir: string): () => void {
  const path = join(dir, LOCK_FILE)
  const mine: Holder = { pid: process.pid, at: new Date().toISOString(), by: thisCopy() }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      writeFileSync(path, JSON.stringify(mine), { flag: 'wx' })
      held.add(path)
      releaseAllOnExit()
      return () => removeIfMine(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const holder = readHolder(path)
    if (holder === null) {
      // Not yet written, or never written whole: young, it is a grading starting; old, nothing holds it.
      let age = Number.POSITIVE_INFINITY
      try {
        age = Date.now() - statSync(path).mtimeMs
      } catch {
        continue
      }
      if (age < WRITING_MS) throw refusal(null)
    } else if (alive(holder.pid) && !outlived(holder)) throw refusal(holder)
    // Taken over by moving it aside: of two that find it stale, one moves it, and the other finds the lock again.
    const aside = `${path}.${process.pid}.stale`
    try {
      renameSync(path, aside)
    } catch {
      continue
    }
    const moved = readHolder(aside)
    if (holder !== null && !same(moved, holder)) {
      // Another took it over first and holds it now: it goes back.
      try {
        linkSync(aside, path)
      } catch {}
      rmSync(aside, { force: true })
      throw refusal(moved)
    }
    rmSync(aside, { force: true })
  }
  throw refusal(readHolder(path))
}
