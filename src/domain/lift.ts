/**
 * The version lift: how much the skill's edits raised its score, read from the
 * runs. It compares like with like: one writer's run on the first version
 * against the same writer's run on the latest, with that writer's latest run
 * without the skill as the floor. Of the writers that ran on two versions, the
 * one whose latest run is newest is chosen. A run against an old skill is
 * neither: it measures something else.
 */
import type { Configuration, Writer } from './schemas.ts'

/** A run as the lift reads it. */
export interface LiftRun {
  name: string
  /** The skill version it ran on, "v0", "v1". */
  version: string
  /** Who wrote its outputs: an engine and model, as one key. */
  writer: string
  configuration: Configuration
  createdAt: string
  /** The mean of its outputs' totals, out of 100; null when none is graded. */
  mean: number | null
}

export interface Lift {
  first: LiftRun & { mean: number }
  latest: LiftRun & { mean: number }
  /** The same writer without the skill, when it ran so. */
  baseline: (LiftRun & { mean: number }) | null
  /** The latest version scores higher than the first. Only then is the lift drawn. */
  rises: boolean
}

type Scored = LiftRun & { mean: number }

/** One key per writer, whatever else a run recorded about it. */
export const writerKey = (writer: Writer | null | undefined): string =>
  writer ? `${writer.engine}/${writer.model ?? ''}/${writer.effort ?? ''}` : 'unknown'

/** "v3" is 3; anything else is no version. */
const versionNumber = (version: string): number | null =>
  /^v\d+$/.test(version) ? Number(version.slice(1)) : null

const newest = (a: Scored, b: Scored): Scored => (b.createdAt > a.createdAt ? b : a)
const oldest = (a: Scored, b: Scored): Scored => (b.createdAt < a.createdAt ? b : a)

export function versionLift(runs: readonly LiftRun[]): Lift | null {
  const scored = runs.filter((r): r is Scored => r.mean !== null)
  const writers = new Map<string, Scored[]>()
  for (const run of scored)
    if (run.configuration === 'with_skill' && versionNumber(run.version) !== null)
      writers.set(run.writer, [...(writers.get(run.writer) ?? []), run])

  let pick: { first: Scored; latest: Scored } | null = null
  for (const list of writers.values()) {
    const numbers = list.map((r) => versionNumber(r.version) as number)
    const low = Math.min(...numbers)
    const high = Math.max(...numbers)
    if (low === high) continue
    const first = list.filter((r) => versionNumber(r.version) === low).reduce(oldest)
    const latest = list.filter((r) => versionNumber(r.version) === high).reduce(newest)
    if (!pick || latest.createdAt > pick.latest.createdAt) pick = { first, latest }
  }
  if (!pick) return null

  const floors = scored.filter(
    (r) => r.configuration === 'without_skill' && r.writer === pick.latest.writer,
  )
  return {
    ...pick,
    baseline: floors.length ? floors.reduce(newest) : null,
    rises: pick.latest.mean > pick.first.mean,
  }
}
