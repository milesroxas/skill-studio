/**
 * Where the desktop app stands with its own updates. There is one state at a
 * time. The updater reports what happens, `nextUpdateState` moves the state
 * on, and every window shows the same one. Nothing here knows Electron, so
 * the whole path from "checking" to "restarting" can be tested.
 */

/** A release newer than the one running. */
export interface Update {
  version: string
  /** When it was published, as an ISO date; null when the release does not say. */
  date: string | null
  /** What changed, as the Markdown of its changelog entry; null when the release carries none. */
  notes: string | null
}

export type UpdateState =
  /** This copy cannot update itself: a development build, or an install the updater does not manage. */
  | { status: 'unsupported' }
  /** Nothing newer is known. `checkedAt` is when a check last said so. */
  | { status: 'idle'; checkedAt: number | null }
  | { status: 'checking' }
  /** Found, and waiting for a go-ahead to download. */
  | { status: 'available'; update: Update }
  | { status: 'downloading'; update: Update; percent: number }
  /** Downloaded and verified: a restart installs it. */
  | { status: 'ready'; update: Update }
  | { status: 'installing'; update: Update }
  /** A step someone asked for failed. `update` is the release in hand, when one was found. */
  | { status: 'error'; message: string; update: Update | null }

/** What the updater reports, in the order a release travels: found, downloaded, installed. */
export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'found'; update: Update }
  /** A check came back with nothing newer, at `at`. */
  | { type: 'none'; at: number }
  | { type: 'downloading' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; update: Update }
  | { type: 'installing' }
  /** `quiet`: nobody asked for the step that failed, so nobody is told. */
  | { type: 'failed'; message: string; quiet: boolean }

/** What a window may ask of the updater. Each is answered with the state it leaves. */
const UPDATE_REQUESTS = ['state', 'check', 'download', 'install'] as const
export type UpdateRequest = (typeof UPDATE_REQUESTS)[number]

export const isUpdateRequest = (value: unknown): value is UpdateRequest =>
  UPDATE_REQUESTS.includes(value as UpdateRequest)

/** A step someone can take. Reading the state is not one. */
export type UpdateStep = Exclude<UpdateRequest, 'state'>

/**
 * The one step a state offers: what a single click does next. Null while a
 * step is under way, or when this copy cannot update itself. A window offers
 * no other, and the updater refuses a download or a restart the state does
 * not offer. A check is the exception: it can be asked for whenever nothing
 * is under way.
 */
export function stepFor(state: UpdateState): UpdateStep | null {
  switch (state.status) {
    case 'idle':
      return 'check'
    case 'available':
      return 'download'
    case 'ready':
      return 'install'
    case 'error':
      // With a release in hand the download is what failed, or the restart after it.
      return state.update ? 'download' : 'check'
    default:
      return null
  }
}

/** The release a state has in hand, if it has one. */
export const updateIn = (state: UpdateState): Update | null =>
  'update' in state ? state.update : null

/**
 * How long a release has been out, in as few characters as say it: "24m ago",
 * "5h ago", "3d ago", "6w ago", "2y ago". Null when the release names no day,
 * or one still to come: a clock set wrong should not read "in 2h".
 */
export function releasedAgo(date: string | null, now: number): string | null {
  if (!date) return null
  const minutes = Math.floor((now - Date.parse(date)) / 60_000)
  if (Number.isNaN(minutes) || minutes < 0) return null
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 365)}y ago`
}

const clampPercent = (percent: number): number =>
  Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0

/** A release found and at rest: waiting for a go-ahead, or for another try after a failure. */
const holdsRelease = (state: UpdateState): boolean =>
  state.status === 'available' || (state.status === 'error' && state.update !== null)

/**
 * The state after `event`. An event that does not fit the state changes
 * nothing and returns the same object, so a caller can tell by identity.
 *
 * Three rules keep the state honest. A release in hand is never taken back
 * by a check that is only starting: the state moves when the check comes
 * back, with a newer release or with word that there is none. A failure
 * nobody asked about is never shown: the state falls back to the last sure
 * footing, and the next check or click tries again. And a downloaded release
 * can still fail: macOS verifies it only after the updater calls it
 * downloaded, so `ready` listens for a failure like any step under way.
 */
export function nextUpdateState(state: UpdateState, event: UpdateEvent): UpdateState {
  if (state.status === 'unsupported') return state
  switch (event.type) {
    case 'checking':
      return state.status === 'idle' || (state.status === 'error' && !state.update)
        ? { status: 'checking' }
        : state
    case 'none':
      return state.status === 'checking' || holdsRelease(state)
        ? { status: 'idle', checkedAt: event.at }
        : state
    case 'found':
      return state.status === 'checking' || holdsRelease(state)
        ? { status: 'available', update: event.update }
        : state
    case 'downloading': {
      const update = updateIn(state)
      return update && (state.status === 'available' || state.status === 'error')
        ? { status: 'downloading', update, percent: 0 }
        : state
    }
    case 'progress': {
      if (state.status !== 'downloading') return state
      // A resumed or differential download can report less than it did; the bar never runs back.
      const percent = Math.max(state.percent, clampPercent(event.percent))
      return percent === state.percent ? state : { ...state, percent }
    }
    case 'downloaded':
      return state.status === 'installing' ? state : { status: 'ready', update: event.update }
    case 'installing':
      return state.status === 'ready' ? { status: 'installing', update: state.update } : state
    case 'failed':
      if (event.quiet) {
        if (state.status === 'checking') return { status: 'idle', checkedAt: null }
        if (state.status === 'downloading' || state.status === 'ready')
          return { status: 'available', update: state.update }
        return state
      }
      return state.status === 'checking' ||
        state.status === 'downloading' ||
        state.status === 'ready' ||
        state.status === 'installing'
        ? { status: 'error', message: event.message, update: updateIn(state) }
        : state
  }
}

/** What a release says about itself, as the updater hands it over. */
export interface ReleaseInfo {
  version: string
  releaseDate?: unknown
  releaseNotes?: unknown
}

/**
 * The notes a release carries, when they are the Markdown this project wrote
 * into it. A release with none of its own gets GitHub's HTML from the updater
 * instead, which the app does not show: it renders only its own Markdown.
 */
const notesOf = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.trim() && !raw.trimStart().startsWith('<') ? raw.trim() : null

export const updateOf = (info: ReleaseInfo): Update => ({
  version: info.version,
  date:
    typeof info.releaseDate === 'string' && !Number.isNaN(Date.parse(info.releaseDate))
      ? info.releaseDate
      : null,
  notes: notesOf(info.releaseNotes),
})

const PROBLEM_MAX = 160

/** Failures with a known cause and a next step, by what the updater's message holds. */
const KNOWN_PROBLEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /read-only volume/i,
    'Skill Studio cannot update from where it is. Move it to the Applications folder, open it from there and try again.',
  ],
  [
    /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_|ERR_CONNECTION_|ERR_TIMED_OUT|ENOTFOUND|ECONNRE|ETIMEDOUT|EAI_AGAIN/,
    'Could not reach GitHub. Check the connection and try again.',
  ],
  [
    /checksum mismatch|code signature|did not pass validation/i,
    'The download did not pass its check, so it was not installed. Try again.',
  ],
]

/**
 * A failure in words for the person. The updater's messages run to a stack
 * trace and a feed's XML: a known cause gets its own sentence, anything else
 * its first line, cut to fit a line of the interface.
 */
export function updateProblem(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const known = KNOWN_PROBLEMS.find(([pattern]) => pattern.test(message))
  if (known) return known[1]
  const line = message.split('\n')[0].trim()
  if (!line) return 'The update could not be finished. Try again.'
  return line.length > PROBLEM_MAX ? `${line.slice(0, PROBLEM_MAX - 1)}…` : line
}
