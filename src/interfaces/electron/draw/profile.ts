/**
 * The drawing host's profile: a new folder in the system's temp folder,
 * named for the host's process, that `index.ts` makes before the host's code
 * loads and removes as the host ends, however it ends.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROFILE_PREFIX } from '@domain/drawing-host.ts'
import { app } from 'electron'

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
 * What removes a profile folder once every process that used it is gone: run
 * by Electron as plain Node, apart from the host, with the folder and the
 * process ids of the host and the browser's own processes. Those outlive the
 * host by a moment, and on Linux the network service writes its state and its
 * cache back into the folder as it ends, so only a process that outlives them
 * all removes it for good. It gives up waiting after 10 seconds.
 */
const REMOVER = `
const { readFileSync, rmSync } = require('node:fs')
const [folder, ...pids] = process.argv.slice(1)
// On Linux a process that has ended and is not yet reaped answers a signal: its state says it is done.
const ended = (pid) => { try { return / [ZX] /.test(readFileSync('/proc/' + pid + '/stat', 'utf8').split(')').at(-1)) } catch { return false } }
const running = (pid) => { try { process.kill(Number(pid), 0); return !ended(pid) } catch (error) { return error.code === 'EPERM' } }
const until = Date.now() + 10000
const remove = () => { try { rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch {} }
const wait = () => (pids.some(running) && Date.now() < until ? setTimeout(wait, 25) : remove())
wait()
`

/** The process ids of the browser's own processes, the GPU's, the network service's, each page's; none before `ready`. */
function helpers(): number[] {
  try {
    return app.isReady()
      ? app
          .getAppMetrics()
          .map((metric) => metric.pid)
          .filter((pid) => pid !== process.pid)
      : []
  } catch {
    return []
  }
}

/**
 * Make the host's profile folder and point the app at it, before `ready`, and
 * sweep the folders of hosts that have gone. Gives what removes it as the host
 * ends: it ends the browser's own processes, removes the folder at once, and
 * removes it again from a process of its own once they and the host are gone.
 */
export function makeProfile(): () => void {
  const profile = mkdtempSync(join(tmpdir(), `${PROFILE_PREFIX}${process.pid}-`))
  sweepProfiles()
  app.setPath('userData', profile)
  app.setPath('sessionData', profile)
  app.setPath('crashDumps', join(profile, 'crashes'))
  return () => {
    const others = helpers()
    // Ended outright: nothing of theirs is wanted, and what they would write as they shut down is not.
    for (const pid of others)
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Gone already.
      }
    try {
      spawn(
        process.execPath,
        ['-e', REMOVER, profile, String(process.pid), ...others.map(String)],
        {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          detached: true,
          stdio: 'ignore',
        },
      ).unref()
    } catch {
      // The command removes it once the host is gone, and the next host sweeps it.
    }
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // A file a process still writes is left for the remover.
    }
  }
}
