/**
 * Whether the reader has had Results open since the newest run of a skill
 * finished, so the top bar asks them to read a run once, and only until they
 * have. Kept per skill in this window's storage: a convenience, not a record,
 * so a store that is cleared or cannot be written asks once more.
 */
import type { RunView } from '@domain/views.ts'
import { createStore, useStore } from './store.ts'

const KEY = 'skill-studio.results-seen'

/** By skill path, when the newest run seen on Results was started. */
type Seen = Record<string, string>

function stored(): Seen {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string'
      }),
    )
  } catch {
    return {}
  }
}

const seen = createStore<Seen>(stored())

/**
 * When the newest finished run started; null when none has finished. A run
 * still writing is not there to read yet. Runs are told apart by when they
 * started, as ISO times, so a later run always reads as newer.
 */
export function newestRun(runs: readonly RunView[]): string | null {
  let newest: string | null = null
  for (const run of runs) {
    const meta = run.meta
    // A run with no start time cannot be told from another, and is never newer.
    if (!meta?.finishedAt || !meta.createdAt) continue
    if (newest === null || meta.createdAt > newest) newest = meta.createdAt
  }
  return newest
}

/** A finished run is newer than the newest one seen on Results. */
export const resultsUnread = (newest: string | null, seenAt: string | null | undefined): boolean =>
  newest !== null && (!seenAt || newest > seenAt)

/** `all` with `skill` read up to the run started at `at`: the same object when it already was. */
export const withSeen = (all: Seen, skill: string, at: string): Seen => {
  const before = all[skill]
  return before && before >= at ? all : { ...all, [skill]: at }
}

/** Note that Results showed `skill`'s runs up to the one started at `at`. */
export function markResultsSeen(skill: string, at: string): void {
  const all = seen.get()
  const next = withSeen(all, skill, at)
  if (next === all) return
  seen.set(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Kept for this session only.
  }
}

/** When the newest run seen on Results of `skill` was started; undefined before any was. */
export const useResultsSeen = (skill: string | null): string | undefined => {
  const all = useStore(seen)
  return skill ? all[skill] : undefined
}
