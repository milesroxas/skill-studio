/**
 * What every host that starts agents does around them: the desktop app's
 * backend, `st run`, `st grade` and `st serve`. In one function, so no host can
 * leave a step out.
 *
 * At the start, the agents an earlier copy left running are ended, and the
 * ones this copy starts are recorded so a later copy can do the same. At the
 * end, every job and assistant reply is stopped and its agents ended before
 * the process goes: an agent left behind keeps working, and spending, with
 * nothing to read it.
 */
import { shutdown } from '@application/shutdown.ts'
import { agentWatcher, endOrphans } from '@infrastructure/children.ts'
import { watchChildren } from '@infrastructure/exec.ts'

/**
 * The signals that end a command in a terminal, and the exit code a shell
 * expects of each: 128 plus the signal's number. SIGHUP comes when the
 * terminal itself is closed.
 */
const SIGNAL_EXITS = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 } as const

/** The part of `process` this module uses, so a test can stand in for it. */
export interface Host {
  once(event: string, listener: () => void): unknown
  on(event: string, listener: (reason: unknown) => void): unknown
  exit(code: number): void
}

export interface LifecycleOptions {
  /**
   * End on Ctrl-C, on a request to stop and when the terminal closes, after
   * the agents have ended. For a command in a terminal; the desktop backend is
   * told to stop by the app.
   */
  signals?: boolean
  /** Where a line about what was done goes. */
  log?: (line: string) => void
  host?: Host
}

export interface Lifecycle {
  /** Stop every job and assistant reply and end their agents. Resolves when they are gone. */
  stop(): Promise<void>
  /**
   * Fires as the stop begins, for work a host runs outside a job: `st run` and
   * `st grade` hand it on as a job hands on its own, so Ctrl-C stops them the
   * way Stop does in the app.
   */
  signal: AbortSignal
  /**
   * Run `work` that is handed `signal`, and resolve as it does. A stop that
   * comes while it runs waits for it before the process exits, `HELD_MS` at
   * most, so what the work writes as it stops (a run's record, the answers a
   * grading already has) is written.
   */
  during<T>(work: Promise<T>): Promise<T>
}

/** How long a stop waits for the host's own work to end once its agents are gone. */
const HELD_MS = 3000

export function agentLifecycle({
  signals = false,
  log = (line) => console.error(line),
  host = process,
}: LifecycleOptions = {}): Lifecycle {
  // An earlier copy that died left its agents running: end them before starting any more.
  try {
    const orphans = endOrphans()
    if (orphans.length) log(`Ended ${orphans.length} agent process(es) left by an earlier session.`)
  } catch (error) {
    // The record is a convenience: a host that cannot read it still starts.
    log(`Could not end the agents an earlier session left: ${messageOf(error)}`)
  }
  watchChildren(agentWatcher)

  const stopped = new AbortController()
  /** The host's own work still running, each as a promise that never rejects. */
  const held = new Set<Promise<unknown>>()
  const during = <T>(work: Promise<T>): Promise<T> => {
    const ended = work.then(
      () => {},
      () => {},
    )
    held.add(ended)
    void ended.then(() => held.delete(ended))
    return work
  }
  /** Every piece of held work has ended, or `HELD_MS` has passed. */
  const heldEnded = (): Promise<unknown> =>
    Promise.race([Promise.all(held), new Promise((done) => setTimeout(done, HELD_MS).unref())])
  let stopping: Promise<void> | null = null
  /** A second request joins the first: the agents are ended once. */
  const stop = (): Promise<void> => {
    // Before any process is ended, so what that process was working for knows it was stopped.
    stopped.abort()
    const going = stopping ?? shutdown()
    stopping = going
    return going
  }

  if (signals)
    // Once: a second Ctrl-C finds no listener and ends the process at once.
    for (const [signal, code] of Object.entries(SIGNAL_EXITS))
      host.once(signal, () => {
        log('Stopping: ending the agents still running.')
        void stop()
          .catch((error: unknown) => log(`Could not stop cleanly: ${messageOf(error)}`))
          .then(heldEnded)
          .finally(() => host.exit(code))
      })
  return { stop, signal: stopped.signal, during }
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error)

/**
 * Keep a long-lived process up when something in it throws with nothing to
 * catch it. One failed reply or one bad file must not take down every job in
 * flight with it; the failure is logged and the process goes on.
 */
export function keepRunning(
  log: (line: string) => void = (line) => console.error(line),
  host: Pick<Host, 'on'> = process,
): void {
  host.on('uncaughtException', (error) => log(`Uncaught error: ${messageOf(error)}`))
  host.on('unhandledRejection', (reason) => log(`Unhandled rejection: ${messageOf(reason)}`))
}
