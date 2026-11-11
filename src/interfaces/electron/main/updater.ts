/**
 * The app's own updates. electron-updater finds a newer release on GitHub,
 * downloads it and checks it against the hash the release publishes; on macOS
 * the system then checks its signature against the running app's. This module
 * turns what electron-updater reports into the one state every window shows,
 * and decides when to look.
 *
 * It takes the updater as `source` and never imports Electron, so its wiring
 * is tested with a stand-in.
 */
import type { UpdateMode } from '@domain/preferences.ts'
import {
  nextUpdateState,
  type ReleaseInfo,
  stepFor,
  type UpdateEvent,
  type UpdateState,
  updateOf,
  updateProblem,
} from '@domain/update.ts'

/** The first look comes once the app has settled, so a launch never waits on the network. */
const FIRST_CHECK_MS = 15_000
/** Often enough that a copy left open for days still hears of a release the day it lands. */
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
/**
 * A look of its own that failed tries again this soon, not at the next
 * scheduled look: a launch on a connection still waking up would otherwise
 * miss a release for hours.
 */
const RETRY_MS = 10 * 60 * 1000

/** The part of electron-updater's `autoUpdater` this module uses. */
export interface UpdateSource {
  /** Download a release as soon as a check finds it. */
  autoDownload: boolean
  /** False for a copy the updater cannot replace: a development build, a Linux install that is no AppImage. */
  isUpdaterActive(): boolean
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  /** Close every window, install the downloaded release and start it. */
  quitAndInstall(): void
  on(event: 'checking-for-update', listener: () => void): unknown
  on(event: 'update-available', listener: (info: ReleaseInfo) => void): unknown
  on(event: 'update-not-available', listener: (info: ReleaseInfo) => void): unknown
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown
  on(event: 'update-downloaded', listener: (info: ReleaseInfo) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

export interface UpdaterOptions {
  source: UpdateSource
  /** Told the state after every change to it. */
  onState: (state: UpdateState) => void
  now?: () => number
}

export interface Updater {
  state(): UpdateState
  /** Look for a newer release. `attended`: someone asked, so a failure is shown to them. */
  check(attended: boolean): void
  /** Download the release that was found. */
  download(): void
  /** Restart into the downloaded release. */
  install(): void
  /** Look on a schedule and download what is found, or wait to be asked. */
  follow(mode: UpdateMode): void
}

export function createUpdater({ source, onState, now = Date.now }: UpdaterOptions): Updater {
  let state: UpdateState = source.isUpdaterActive()
    ? { status: 'idle', checkedAt: null }
    : { status: 'unsupported' }
  /** Someone is waiting on the step in flight. A failure is theirs to see; any other passes in silence. */
  let attended = false
  let following: UpdateMode | null = null
  let first: ReturnType<typeof setTimeout> | undefined
  let every: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined

  /** Several events land as one change, so no window paints a state that lasts no time. */
  const report = (...events: UpdateEvent[]): void => {
    const next = events.reduce(nextUpdateState, state)
    if (next === state) return
    state = next
    onState(state)
  }

  source.on('checking-for-update', () => report({ type: 'checking' }))
  source.on('update-available', (info) => {
    const found: UpdateEvent = { type: 'found', update: updateOf(info) }
    if (source.autoDownload) report(found, { type: 'downloading' })
    else report(found)
  })
  source.on('update-not-available', () => report({ type: 'none', at: now() }))
  source.on('download-progress', ({ percent }) => report({ type: 'progress', percent }))
  source.on('update-downloaded', (info) => report({ type: 'downloaded', update: updateOf(info) }))
  source.on('error', (error) => {
    const quiet = !attended
    report({ type: 'failed', message: updateProblem(error), quiet })
    // Nobody saw it fail, so nobody will ask again: in auto, the app does.
    if (quiet && following === 'auto') {
      clearTimeout(retry)
      retry = setTimeout(() => check(false), RETRY_MS)
    }
  })

  /** The source reports every failure as an `error` event as well; the event is what moves the state. */
  const settled = (step: Promise<unknown>): void => void step.catch(() => {})

  const check = (byRequest: boolean): void => {
    if (state.status === 'unsupported') return
    const inFlight =
      state.status === 'checking' || state.status === 'downloading' || state.status === 'installing'
    if (inFlight) {
      // Someone now waits on a step that started on its own.
      attended ||= byRequest
      return
    }
    // A downloaded release is installed first; the copy it starts looks again.
    if (state.status === 'ready') return
    clearTimeout(retry)
    attended = byRequest
    settled(source.checkForUpdates())
  }

  return {
    state: () => state,
    check,
    download: () => {
      if (stepFor(state) !== 'download') return
      attended = true
      report({ type: 'downloading' })
      settled(source.downloadUpdate())
    },
    install: () => {
      if (stepFor(state) !== 'install') return
      attended = true
      report({ type: 'installing' })
      try {
        source.quitAndInstall()
      } catch (error) {
        report({ type: 'failed', message: updateProblem(error), quiet: false })
      }
    },
    follow: (mode) => {
      // Told again on every change to any preference: only a change of mode starts the clock anew.
      if (mode === following) return
      following = mode
      clearTimeout(first)
      clearInterval(every)
      clearTimeout(retry)
      source.autoDownload = mode === 'auto'
      if (mode !== 'auto' || state.status === 'unsupported') return
      first = setTimeout(() => check(false), FIRST_CHECK_MS)
      every = setInterval(() => check(false), CHECK_EVERY_MS)
    },
  }
}
