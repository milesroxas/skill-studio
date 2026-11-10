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
  /** The same writer without the skill, when it ran so: its mean over the shared cases it answered. */
  baseline: LiftSide | null
  /** The latest version scores higher than the first. Only then is the lift drawn. */
  rises: boolean
  /** How many cases both runs answered: the ones the means are over. */
  sharedCases: number
  /** One run answered cases the other did not, so the means leave some out. */
  casesDiffer: boolean
}

/** A run with a graded case to its name. */
type Scored = LiftRun

/** One key per writer, whatever else a run recorded about it. */
export const writerKey = (writer: Writer | null | undefined): string =>
  writer ? `${writer.engine}/${writer.model ?? ''}/${writer.effort ?? ''}` : 'unknown'

/** "v3" is 3; anything else is no version. */
export const versionNumber = (version: string): number | null =>
  /^v\d+$/.test(version) ? Number(version.slice(1)) : null

const newest = (a: Scored, b: Scored): Scored => (b.createdAt > a.createdAt ? b : a)
const oldest = (a: Scored, b: Scored): Scored => (b.createdAt < a.createdAt ? b : a)

const graded = (run: LiftRun): boolean => Object.keys(run.cases).length > 0

/** The case ids both runs answered. */
const shared = (a: LiftRun, b: LiftRun): string[] =>
  Object.keys(a.cases).filter((id) => id in b.cases)

/** The run's mean over `ids`, each case once; null when it answered none of them. */
const meanOver = (run: LiftRun, ids: readonly string[]): number | null =>
  mean(ids.filter((id) => id in run.cases).map((id) => run.cases[id]))

const over = (run: LiftRun, ids: readonly string[]): LiftSide | null => {
  const value = meanOver(run, ids)
  return value === null ? null : { ...run, mean: value }
}

/**
 * The two runs the lift compares: one writer's oldest run on its lowest version
 * and its newest run on its highest, for the writer whose newest run is the
 * newest of all. Null until a writer has run two versions with a case in common.
 */
function liftPair(runs: readonly LiftRun[]): { first: Scored; latest: Scored } | null {
  const writers = new Map<string, Scored[]>()
  for (const run of runs)
    if (graded(run) && run.configuration !== 'without_skill' && versionNumber(run.version) !== null)
      writers.set(run.writer, [...(writers.get(run.writer) ?? []), run])

  let pick: { first: Scored; latest: Scored } | null = null
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
  return {
    first,
    latest,
    baseline: floors.length ? over(floors.reduce(newest), ids) : null,
    rises: latest.mean > first.mean,
    sharedCases: ids.length,
    casesDiffer:
      ids.length < Object.keys(pick.first.cases).length ||
      ids.length < Object.keys(pick.latest.cases).length,
  }
}
