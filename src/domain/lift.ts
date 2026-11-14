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
  /**
   * The mean total of each case's outputs, out of 100, by the case as it was
   * asked and graded: the caller keys each by its id, what the agent was asked
   * and whether Jev graded it, so a run that answered an earlier prompt, or
   * was graded another way, shares no case with one that did not. A case is
   * absent when any of its outputs has no total.
   */
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

/** The run has a score on case `id`. Its own key only: `constructor` is a name every object answers to. */
const has = (run: VersionRun, id: string): boolean => Object.hasOwn(run.cases, id)

/** The cases both runs have a score on. */
const shared = (a: VersionRun, b: VersionRun): string[] =>
  Object.keys(a.cases).filter((id) => has(b, id))

/**
 * One writer's newest run on its highest version, and its oldest run on the
 * lowest version that has a case in common with that one, for the writer whose
 * newest run is the newest of all. A run on an earlier version that shares no
 * case with the latest, because it answered other cases or the same ones
 * before they changed, is no measure of it, and does not stand in the way of a
 * later one that is. Null until a writer has run two versions with a case in
 * common.
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
    const number = (run: VersionRun) => versionNumber(run.version) as number
    const high = Math.max(...list.map(number))
    const latest = list.filter((r) => number(r) === high).reduce(newest)
    const before = list.filter((r) => number(r) < high && shared(r, latest).length)
    if (!before.length) continue
    const low = Math.min(...before.map(number))
    const first = before.filter((r) => number(r) === low).reduce(oldest)
    if (!pick || latest.createdAt > pick.latest.createdAt) pick = { first, latest }
  }
  return pick
}

/** The writer whose runs a version's score is read from; null until one has run two versions. */
export const versionWriter = (runs: readonly VersionRun[]): string | null =>
  versionPair(runs)?.latest.writer ?? null
