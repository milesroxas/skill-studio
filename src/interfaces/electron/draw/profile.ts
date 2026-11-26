/**
 * The drawing host's profile: a new folder in the system's temp folder,
 * named for the host's process, that `index.ts` makes before the host's code
 * loads and removes as the host ends, however it ends.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

/** A host's profile folder in the system's temp folder: this, its process id, a dash. */
const PROFILE_PREFIX = 'skill-studio-draw-'

/** Whether a process is still running. One of another user's still is. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Remove the profile folders hosts that have gone left behind. A host removes
 * its own as it ends, but one killed outright cannot, and in the first moment
 * of a host's start the browser's own processes may make its folder again
 * after it has gone; so each host that starts removes those of hosts whose
 * process is gone.
 */
function sweepProfiles(): void {
  try {
    for (const name of readdirSync(tmpdir())) {
      const pid = Number(new RegExp(`^${PROFILE_PREFIX}(\\d+)-`).exec(name)?.[1])
      if (pid && pid !== process.pid && !running(pid))
        rmSync(join(tmpdir(), name), { recursive: true, force: true })
    }
  } catch {
    // A folder that cannot be read or removed is left for the system to clear.
  }
}

/**
 * Make the host's profile folder and point the app at it, before `ready`, and
 * sweep the folders of hosts that have gone. Gives what removes it, at once.
 */
export function makeProfile(): () => void {
  const profile = mkdtempSync(join(tmpdir(), `${PROFILE_PREFIX}${process.pid}-`))
  sweepProfiles()
  app.setPath('userData', profile)
  app.setPath('sessionData', profile)
  app.setPath('crashDumps', join(profile, 'crashes'))
  return () => {
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // A file the browser still holds open stays behind in the system's temp folder.
    }
  }
}
