/**
 * Where a case stands on the skill as it is now, and how far the cases have
 * come: the lift. A case is run when its writer chooses, on whatever version
 * and model, so each case is read against its own runs and never against a
 * run that did not answer it. Pure functions over plain facts about runs, so
 * they are tested without a page.
 */
import { pointsMoved, testedVersion, versionNumber } from './lift.ts'
import type { Configuration } from './schemas.ts'
import { mean } from './stats.ts'

/** One run's answer to one case. */
export interface Try {
  /** The skill version its run was made on, "v2"; empty when the run recorded none. */
  version: string
  configuration: Configuration
  /** Who wrote it: an engine and model, as one key. */
  writer: string
  /** When its run started. */
  createdAt: string
  /**
   * How its run was graded, as one key: with Jev, or without. A grading without
   * Jev counts a score from other parts, so two scores are set against each
   * other only when their runs were graded the same way.
   */
  graded: string
  /**
   * The mean total of the case's outputs in the run, out of 100. Null when
   * none is graded, and when any that ran to its end has no total: a mean over
   * the rest is not the run's score on the case.
   */
  score: number | null
}

/** The two scores a change is read between, each end read as a change reads it. */
export interface Move {
  from: number
  to: number
}

/**
 * How a change is read between two scored runs of one case: the two scores
 * it is read between, or null when there is no change to read between them.
 * A change counts the reader's answers only where both runs hold one on the
 * same fact (`changeAnswers` in `change.ts`), so the caller reads each end
 * again. Without one, the two scores as shown.
 */
export type ReadMove<T extends Try = Try> = (from: T, to: T) => Move | null

const asShown = (from: Try, to: Try): Move => ({
  from: from.score as number,
  to: to.score as number,
})

export interface Standing<T extends Try = Try> {
  /** The runs that tested a version of the skill on the case: by version, then by when they ran. */
  tries: T[]
  /**
   * The score the case stands on: its newest on the version asked about, else
   * its newest on the latest version it ran. Null when no run with the skill
   * has a score.
   */
  latest: T | null
  /**
   * The scored run `latest` moved from, among the ones graded as it was: the
   * one before it by the same writer, so the move read is the skill's and not
   * the model's; with none, the one before it by anyone.
   */
  previous: T | null
  /** The first scored run with the skill that was graded as `latest` was: where the case started. */
  first: T | null
  /**
   * The newest scored run without the skill, graded as `latest` was: the score
   * the skill has to beat on this case. Before any run with the skill has a
   * score, the newest scored run without it.
   */
  floor: T | null
  /** How far `latest` moved from `previous`, in the whole points shown, read as `moved`; null with nothing to move from. */
  change: number | null
  /** The two scores the change from `previous` to `latest` is read between; null with nothing to move from. */
  moved: Move | null
  /** The two scores the move from `first` to `latest` is read between, which the lift is counted from; null with nothing to move from. */
  since: Move | null
  /**
   * A run before `latest` has a score, and none of them was graded as it was:
   * `latest` is not the case's first run, and there is still no move to read.
   */
  apart: boolean
  /** `latest` is on the version asked about: the case is checked on the skill as it is now. */
  current: boolean
}

const scored = <T extends Try>(tries: readonly T[]): T[] => tries.filter((t) => t.score !== null)

/** By version, then by when the run started: a run on a kept copy of v1 stands with v1, whenever it ran. */
const inOrder = <T extends Try>(a: T, b: T): number =>
  (versionNumber(a.version) as number) - (versionNumber(b.version) as number) ||
  a.createdAt.localeCompare(b.createdAt)

/**
 * Where one case stands on `version`, from every run that answered it. The
 * runs are answers to one request: the caller hands in only the ones asked
 * the same prompt with the same files. `read` gives the two scores a change
 * between two of them is read between (`ReadMove`).
 */
export function standingOf<T extends Try>(
  all: readonly T[],
  version: string,
  read: ReadMove<T> = asShown,
): Standing<T> {
  const tries = all.filter(testedVersion).sort(inOrder)
  const marks = scored(tries)
  const here = marks.filter((t) => t.version === version)
  const latest = here.at(-1) ?? marks.at(-1) ?? null
  /** Graded as `latest` was; every run while there is no `latest`. */
  const alike = (t: T): boolean => latest === null || t.graded === latest.graded
  const earlier = latest ? marks.slice(0, marks.indexOf(latest)) : []
  const before = earlier.filter(alike)
  const previous = before.findLast((t) => t.writer === latest?.writer) ?? before.at(-1) ?? null
  const floor =
    scored(all.filter((t) => t.configuration === 'without_skill' && alike(t)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1) ?? null
  const first = before[0] ?? latest
  const moved = latest && previous ? read(previous, latest) : null
  return {
    tries,
    latest,
    previous,
    first,
    floor,
    change: moved ? pointsMoved(moved.from, moved.to) : null,
    moved,
    since: latest && first && previous ? read(first, latest) : null,
    apart: earlier.length > 0 && before.length === 0,
    current: latest !== null && latest.version === version,
  }
}

/** How far the cases have come: each case's first score against its latest, over the cases with both. */
export interface CaseLift {
  /** The mean of the cases' first scores. */
  first: number
  /** The mean of the same cases' latest scores. */
  latest: number
  /** The mean of their scores without the skill, over the ones that have one; null when none has. */
  floor: number | null
  /** How many of the cases the floor's mean is over. */
  floorCases: number
  /** How many cases ran more than once with a score: the ones the means are over. */
  cases: number
  /**
   * The cases' scores as shown count an answer of the reader's that only one
   * of a case's two runs holds, so the means above, read without it, are not
   * the means of the scores shown in the whole points shown.
   */
  unshared: boolean
  /** The latest mean is higher than the first, by a whole point or more as the scores are shown. Only then is the lift drawn. */
  rises: boolean
  /** Some case's first and latest runs had different writers, so part of its move may be the model's. */
  mixed: boolean
  /**
   * Some case's floor ran on another version than its latest. A run without
   * the skill is graded on the rules of the version it is stamped with, so
   * that floor was held to other rules than the latest scores.
   */
  floorApart: boolean
}

/** The lift over `standings`; null until one case has two scored runs with the skill. */
export function caseLift(standings: readonly Standing[]): CaseLift | null {
  const twice = standings.filter(
    (s) => s.first !== null && s.latest !== null && s.previous !== null && s.since !== null,
  )
  if (!twice.length) return null
  // Read from Jev's answers, with the reader's only where both runs hold one (`ReadMove`).
  const first = mean(twice.map((s) => s.since?.from as number)) as number
  const latest = mean(twice.map((s) => s.since?.to as number)) as number
  const shown = {
    first: mean(twice.map((s) => s.first?.score as number)) as number,
    latest: mean(twice.map((s) => s.latest?.score as number)) as number,
  }
  const floors = twice.flatMap((s) => (s.floor ? [s.floor.score as number] : []))
  return {
    first,
    latest,
    floor: mean(floors),
    floorCases: floors.length,
    cases: twice.length,
    unshared:
      Math.round(shown.first) !== Math.round(first) ||
      Math.round(shown.latest) !== Math.round(latest),
    rises: pointsMoved(first, latest) > 0,
    mixed: twice.some((s) => s.first?.writer !== s.latest?.writer),
    floorApart: twice.some((s) => s.floor !== null && s.floor.version !== s.latest?.version),
  }
}

/**
 * Which standing needs a look first: the biggest drop, then the lowest score,
 * then one with no score at all last. Zero for two that need it alike, so the
 * caller's own order holds.
 */
export function byNeed(a: Standing, b: Standing): number {
  if ((a.latest === null) !== (b.latest === null)) return a.latest === null ? 1 : -1
  return (
    (a.change ?? 0) - (b.change ?? 0) ||
    ((a.latest?.score as number | undefined) ?? 0) - ((b.latest?.score as number | undefined) ?? 0)
  )
}
