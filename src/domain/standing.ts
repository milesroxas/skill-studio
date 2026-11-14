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
  /** The mean total of the case's graded outputs in the run, out of 100; null when none is graded. */
  score: number | null
}

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
   * The scored run `latest` moved from: the one before it by the same writer,
   * so the move read is the skill's and not the model's; with none, the one
   * before it by anyone.
   */
  previous: T | null
  /** The first scored run with the skill: where the case started. */
  first: T | null
  /** The newest scored run without the skill: the score the skill has to beat on this case. */
  floor: T | null
  /** How far `latest` moved from `previous`, in the whole points shown; null with nothing to move from. */
  change: number | null
  /** `latest` is on the version asked about: the case is checked on the skill as it is now. */
  current: boolean
}

const scored = <T extends Try>(tries: readonly T[]): T[] => tries.filter((t) => t.score !== null)

/** By version, then by when the run started: a run on a kept copy of v1 stands with v1, whenever it ran. */
const inOrder = <T extends Try>(a: T, b: T): number =>
  (versionNumber(a.version) as number) - (versionNumber(b.version) as number) ||
  a.createdAt.localeCompare(b.createdAt)

/** Where one case stands on `version`, from every run that answered it. */
export function standingOf<T extends Try>(all: readonly T[], version: string): Standing<T> {
  const tries = all.filter(testedVersion).sort(inOrder)
  const marks = scored(tries)
  const here = marks.filter((t) => t.version === version)
  const latest = here.at(-1) ?? marks.at(-1) ?? null
  const before = latest ? marks.slice(0, marks.indexOf(latest)) : []
  const previous = before.findLast((t) => t.writer === latest?.writer) ?? before.at(-1) ?? null
  const floor =
    scored(all.filter((t) => t.configuration === 'without_skill'))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1) ?? null
  return {
    tries,
    latest,
    previous,
    first: marks[0] ?? null,
    floor,
    change:
      latest && previous ? pointsMoved(previous.score as number, latest.score as number) : null,
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
  /** The latest mean is higher than the first, by a whole point or more as the scores are shown. Only then is the lift drawn. */
  rises: boolean
  /** Some case's first and latest runs had different writers, so part of its move may be the model's. */
  mixed: boolean
}

/** The lift over `standings`; null until one case has two scored runs with the skill. */
export function caseLift(standings: readonly Standing[]): CaseLift | null {
  const twice = standings.filter(
    (s) => s.first !== null && s.latest !== null && s.previous !== null,
  )
  if (!twice.length) return null
  const first = mean(twice.map((s) => s.first?.score as number)) as number
  const latest = mean(twice.map((s) => s.latest?.score as number)) as number
  const floors = twice.flatMap((s) => (s.floor ? [s.floor.score as number] : []))
  return {
    first,
    latest,
    floor: mean(floors),
    floorCases: floors.length,
    cases: twice.length,
    rises: pointsMoved(first, latest) > 0,
    mixed: twice.some((s) => s.first?.writer !== s.latest?.writer),
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
