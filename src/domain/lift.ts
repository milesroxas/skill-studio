/**
 * The version lift: how much the skill's edits raised its score, read from the
 * runs. It compares like with like: one writer's run on the first version
 * against the same writer's run on the latest, with that writer's latest run
 * without the skill as the floor. Of the writers that ran on two versions, the
 * one whose latest run is newest is chosen. A run against an old skill's copy
 * counts as the version it copied.
 *
 * Two runs are compared on the cases both answered. Each case counts once,
 * whatever the number of samples, so a run of more samples or more cases is
 * not read as a better or worse skill.
 */

import type { Configuration, Writer } from './schemas.ts'
import { mean } from './stats.ts'

/** A run as the lift reads it. */
export interface LiftRun {
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

/** A run with its mean over the cases the lift compares. */
export type LiftSide = LiftRun & { mean: number }

export interface Lift {
  first: LiftSide
  latest: LiftSide
  /**
   * The same writer without the skill, when it ran so: its newest such run
   * that answered every shared case, read over those cases. When none
   * answered them all, the run that answered the most of them, the newest
   * of those, read over the ones it answered. Null when none answered any.
   */
  baseline: LiftSide | null
  /** How many of the shared cases the floor's mean is over; 0 with no floor. */
  baselineCases: number
  /** The latest version scores higher than the first, by a whole point or more as the scores are shown. Only then is the lift drawn. */
  rises: boolean
  /** How many cases both runs answered: the ones the means are over. */
  sharedCases: number
  /**
   * The means are not all over one set of cases: one run answered cases the
   * other did not, or the floor answered fewer of the shared cases than they did.
   */
  casesDiffer: boolean
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

const newest = (a: LiftRun, b: LiftRun): LiftRun => (b.createdAt > a.createdAt ? b : a)
const oldest = (a: LiftRun, b: LiftRun): LiftRun => (b.createdAt < a.createdAt ? b : a)

const graded = (run: LiftRun): boolean => Object.keys(run.cases).length > 0

/** The run answered case `id`. Its own key only: `constructor` is a name every object answers to. */
const has = (run: LiftRun, id: string): boolean => Object.hasOwn(run.cases, id)

/** The case ids both runs answered. */
const shared = (a: LiftRun, b: LiftRun): string[] => Object.keys(a.cases).filter((id) => has(b, id))

/** The run's mean over `ids`, each case once; null when it answered none of them. */
const meanOver = (run: LiftRun, ids: readonly string[]): number | null =>
  mean(ids.filter((id) => has(run, id)).map((id) => run.cases[id]))

const over = (run: LiftRun, ids: readonly string[]): LiftSide | null => {
  const value = meanOver(run, ids)
  return value === null ? null : { ...run, mean: value }
}

/** How many of `ids` the run answered. */
const answered = (run: LiftRun, ids: readonly string[]): number =>
  ids.filter((id) => has(run, id)).length

/** Of the runs without the skill, the one that answered the most of `ids`, the newest of those; null when none answered any. */
function floorOf(floors: readonly LiftRun[], ids: readonly string[]): LiftRun | null {
  let best: LiftRun | null = null
  for (const run of floors) {
    const count = answered(run, ids)
    if (!count) continue
    const most = best ? answered(best, ids) : 0
    if (!best || count > most || (count === most && run.createdAt > best.createdAt)) best = run
  }
  return best
}

/**
 * The two runs the lift compares: one writer's oldest run on its lowest version
 * and its newest run on its highest, for the writer whose newest run is the
 * newest of all. Null until a writer has run two versions with a case in common.
 */
function liftPair(runs: readonly LiftRun[]): { first: LiftRun; latest: LiftRun } | null {
  const writers = new Map<string, LiftRun[]>()
  for (const run of runs)
    if (graded(run) && testedVersion(run))
      writers.set(run.writer, [...(writers.get(run.writer) ?? []), run])

  let pick: { first: LiftRun; latest: LiftRun } | null = null
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

/** The writer the lift compares with itself; null until one has run two versions. */
export const liftWriter = (runs: readonly LiftRun[]): string | null =>
  liftPair(runs)?.latest.writer ?? null

export function versionLift(runs: readonly LiftRun[]): Lift | null {
  const pick = liftPair(runs)
  if (!pick) return null
  const ids = shared(pick.first, pick.latest)
  const first = over(pick.first, ids) as LiftSide
  const latest = over(pick.latest, ids) as LiftSide
  const floors = runs.filter(
    (r) => graded(r) && r.configuration === 'without_skill' && r.writer === pick.latest.writer,
  )
  const floor = floorOf(floors, ids)
  const baselineCases = floor ? answered(floor, ids) : 0
  return {
    first,
    latest,
    baseline: floor ? over(floor, ids) : null,
    baselineCases,
    rises: pointsMoved(first.mean, latest.mean) > 0,
    sharedCases: ids.length,
    casesDiffer:
      ids.length < Object.keys(pick.first.cases).length ||
      ids.length < Object.keys(pick.latest.cases).length ||
      (floor !== null && baselineCases < ids.length),
  }
}
