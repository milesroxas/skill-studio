/**
 * Versions as runs test them: which version a run tested, how far a score
 * moved, and the writer a version's score is read from. One version's score is
 * read against the next only when one writer made both, so of the writers that
 * ran on two versions with a case in common, the one whose latest run is
 * newest is chosen. A run against an old skill's copy counts as the version it
 * copied. How far the cases themselves have come is in `standing.ts`.
 */

import type { Configuration, Writer } from './schemas.ts'

/** A run as a version's score reads it. */
export interface VersionRun {
  name: string
  /** The skill version it ran on, "v0", "v1". */
  version: string
  /** Who wrote its outputs: an engine and model, as one key. */
  writer: string
  configuration: Configuration
  createdAt: string
  /** The mean total of each case's graded outputs, out of 100, by case id. A case with none graded is absent. */
  cases: Readonly<Record<string, number>>
}

/** One key per writer, whatever else a run recorded about it. */
export const writerKey = (writer: Writer | null | undefined): string =>
  writer ? `${writer.engine}/${writer.model ?? ''}/${writer.effort ?? ''}` : 'unknown'

/** "v3" is 3; anything else is no version. */
export const versionNumber = (version: string): number | null =>
  /^v\d+$/.test(version) ? Number(version.slice(1)) : null

/**
 * The run tested a version of the skill: made with the skill as it stood, or
 * against an earlier version's copy (`old_skill`), which counts as a run of
 * the version it copied. A run without the skill tested none. The one reading
 * of it for a version's score, the lift and the pair a case opens with.
 */
export const testedVersion = (run: { configuration: Configuration; version: string }): boolean =>
  run.configuration !== 'without_skill' && versionNumber(run.version) !== null

/** How far a score moved, in the whole points it is shown in: 66.7 to 67.0 is no move. */
export const pointsMoved = (from: number, to: number): number => Math.round(to) - Math.round(from)

const newest = (a: VersionRun, b: VersionRun): VersionRun => (b.createdAt > a.createdAt ? b : a)
const oldest = (a: VersionRun, b: VersionRun): VersionRun => (b.createdAt < a.createdAt ? b : a)

const graded = (run: VersionRun): boolean => Object.keys(run.cases).length > 0

/** The run answered case `id`. Its own key only: `constructor` is a name every object answers to. */
const has = (run: VersionRun, id: string): boolean => Object.hasOwn(run.cases, id)

/** The case ids both runs answered. */
const shared = (a: VersionRun, b: VersionRun): string[] =>
  Object.keys(a.cases).filter((id) => has(b, id))

/**
 * One writer's oldest run on its lowest version and its newest run on its
 * highest, for the writer whose newest run is the newest of all. Null until a
 * writer has run two versions with a case in common.
 */
function versionPair(
  runs: readonly VersionRun[],
): { first: VersionRun; latest: VersionRun } | null {
  const writers = new Map<string, VersionRun[]>()
  for (const run of runs)
    if (graded(run) && testedVersion(run))
      writers.set(run.writer, [...(writers.get(run.writer) ?? []), run])

  let pick: { first: VersionRun; latest: VersionRun } | null = null
  for (const list of writers.values()) {
    const numbers = list.map((r) => versionNumber(r.version) as number)
    const low = Math.min(...numbers)
    const high = Math.max(...numbers)
    if (low === high) continue
    const first = list.filter((r) => versionNumber(r.version) === low).reduce(oldest)
    const latest = list.filter((r) => versionNumber(r.version) === high).reduce(newest)
    if (!shared(first, latest).length) continue
    if (!pick || latest.createdAt > pick.latest.createdAt) pick = { first, latest }
  }
  return pick
}

/** The writer whose runs a version's score is read from; null until one has run two versions. */
export const versionWriter = (runs: readonly VersionRun[]): string | null =>
  versionPair(runs)?.latest.writer ?? null
