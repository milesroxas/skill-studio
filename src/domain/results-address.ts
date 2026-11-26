/**
 * The address that opens Results on one case and two outputs:
 * `?skill=<path>#/results?case=&a=&b=`. Pure: `st open` builds it, and the
 * renderer reads it back with `placeOf` (`src/renderer/route.ts`) and
 * `resultsShown` (`src/renderer/model.ts`).
 */
import { sampleOf } from './run-name.ts'

/** One sample of a run as the address reads it. */
export interface AddressSample {
  /** Its folder's name, or an old run's file name. */
  name: string
  /**
   * The case a grading of it names; null when none does, or when grading
   * leaves the sample out (`Output.cut` in `src/renderer/model.ts`).
   */
  graded: string | null
}

/** A run as the address names it: its name and its samples. */
export interface AddressRun {
  name: string
  samples: readonly AddressSample[]
}

export interface ResultsPlace {
  /** The skill's path. */
  skill: string
  /** The skill's case ids, in the order `loadCases` reads them, as Results and `st cases` list them. */
  cases: readonly string[]
  /** The case to open; null for the first case each run named answered. */
  case: string | null
  a: AddressRun | null
  b: AddressRun | null
}

/**
 * The cases answered, in the order Results lists them: the skill's cases in
 * their order, then any case since deleted, by id.
 */
export function casesInOrder(cases: readonly string[], answered: Iterable<string>): string[] {
  const ran = new Set(answered)
  const known = cases.filter((id) => ran.has(id))
  return [...known, ...[...ran].filter((id) => !known.includes(id)).sort()]
}

/** A sample's case and attempt, read as Results reads them (`outputOf`). */
const attemptOf = (sample: AddressSample): { case: string; index: number } =>
  sampleOf(sample.name, sample.graded)

/** The run's first attempt at the case, as `<run>/<sample>`; null when the run did not answer it. */
function firstAttempt(run: AddressRun, caseId: string): string | null {
  let first: { sample: string; index: number } | null = null
  for (const sample of run.samples) {
    const attempt = attemptOf(sample)
    if (attempt.case === caseId && (first === null || attempt.index < first.index))
      first = { sample: sample.name, index: attempt.index }
  }
  return first ? `${run.name}/${first.sample}` : null
}

/** The first case, in the order Results lists them, that every run answered; null when they share none. */
function sharedCase(cases: readonly string[], runs: readonly AddressRun[]): string | null {
  const [head, ...others] = runs
  const answered = casesInOrder(
    cases,
    head.samples.map((s) => attemptOf(s).case),
  )
  return (
    answered.find((id) =>
      others.every((run) => run.samples.some((s) => attemptOf(s).case === id)),
    ) ?? null
  )
}

/**
 * The address of Results on `place`: each run named names its first attempt
 * at the case. With no case named, the case is the first one each run named
 * answered; with no run named either, the address names none. Throws when a
 * run did not answer the case, or the runs share none.
 */
export function resultsAddress(place: ResultsPlace): string {
  const runs = [place.a, place.b].filter((run): run is AddressRun => run !== null)
  const caseId = place.case ?? (runs.length ? sharedCase(place.cases, runs) : null)
  if (caseId === null && runs.length)
    throw new Error(
      runs.length === 1
        ? `${runs[0].name} answered no case.`
        : `${runs[0].name} and ${runs[1].name} answered no case in common.`,
    )
  const output = (run: AddressRun | null): string | null => {
    if (!run || caseId === null) return null
    const key = firstAttempt(run, caseId)
    if (key === null) throw new Error(`${run.name} did not answer ${caseId}.`)
    return key
  }
  const params = new URLSearchParams()
  if (caseId !== null) params.set('case', caseId)
  const a = output(place.a)
  const b = output(place.b)
  if (a !== null) params.set('a', a)
  if (b !== null) params.set('b', b)
  const query = params.toString()
  return `?${new URLSearchParams({ skill: place.skill })}#/results${query ? `?${query}` : ''}`
}
