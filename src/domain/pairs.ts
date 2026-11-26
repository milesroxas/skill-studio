/**
 * Pairs: the two outputs of one case that Results sets side by side first.
 * Pure functions over plain facts about outputs, so they are tested without a
 * page.
 */
import { testedVersion, versionNumber } from './lift.ts'
import type { Configuration } from './schemas.ts'
import type { RunView, Sample } from './views.ts'

/**
 * Why grading leaves out one sample of `run`, as Results reads an output's
 * `cut`: `stopped` by a stop, or with no end of its own in a run that has
 * ended; `failed` with no stop; `unfinished` while the run, with no end of
 * its own, may still be writing it. Null for a sample whose agent ran to its end.
 */
export const sampleCut = (
  run: Pick<RunView, 'meta'>,
  sample: Pick<Sample, 'cut'>,
): 'stopped' | 'failed' | 'unfinished' | null =>
  sample.cut === 'stopped' || (sample.cut === 'unlisted' && run.meta?.finishedAt)
    ? 'stopped'
    : sample.cut === 'failed'
      ? 'failed'
      : sample.cut === 'unlisted'
        ? 'unfinished'
        : null

/** What pairing reads of a sample of `run`: whether it is written whole, and whether its agent was stopped (`PairOutput`). */
export function sampleShown(
  run: Pick<RunView, 'meta'>,
  sample: Pick<Sample, 'cut' | 'artifacts'>,
): { written: boolean; stopped: boolean } {
  const cut = sampleCut(run, sample)
  return {
    written: sample.artifacts.length > 0 && cut === null,
    stopped: cut === 'stopped' || cut === 'failed',
  }
}

/** One output as pairing reads it. */
export interface PairOutput {
  /** `<run>/<sample>` */
  key: string
  caseId: string
  /** The skill version its run was made on, "v2"; empty when the run recorded none. */
  version: string
  configuration: Configuration
  /** Who wrote it: an agent and model, as one key. */
  writer: string
  /** When its run started. */
  createdAt: string
  /** Which sample of its case it is, from 1. */
  index: number
  /** The agent wrote an output and was not stopped on the way. One stopped or failed leaves nothing whole to read. */
  written: boolean
  /** Its agent was stopped before it finished. A stop says nothing of the skill, so it is no answer to compare while the case has another. */
  stopped: boolean
}

export interface Pair<T extends PairOutput = PairOutput> {
  /** The older side: the version before, or the answer written without the skill. */
  a: T | null
  /** The newer side: the latest version's answer. */
  b: T | null
}

/** The outputs whose agents were not stopped, when any was not; else all of them. */
function endedOf<T extends Pick<PairOutput, 'stopped'>>(all: readonly T[]): readonly T[] {
  const ended = all.filter((o) => !o.stopped)
  return ended.length ? ended : all
}

/**
 * The newest run's first sample, among the outputs that were written when any
 * was. Outputs that say no `createdAt` are read as of one run.
 */
const newestFirstSample = <
  T extends Pick<PairOutput, 'index' | 'written'> & { createdAt?: string },
>(
  outputs: readonly T[],
): T | null =>
  (outputs.some((o) => o.written) ? outputs.filter((o) => o.written) : outputs).reduce<T | null>(
    (best, o) =>
      !best ||
      (o.createdAt ?? '') > (best.createdAt ?? '') ||
      (o.createdAt === best.createdAt && o.index < best.index)
        ? o
        : best,
    null,
  )

/**
 * Of one run's attempts at a case, the one Results opens the run on, as
 * `defaultPair` picks within a run: the first written whole, else the first
 * whose agent was not stopped, else the first. `st open` names it.
 */
export const firstAttempt = <T extends Pick<PairOutput, 'index' | 'written' | 'stopped'>>(
  attempts: readonly T[],
): T | null => newestFirstSample(endedOf(attempts))

/**
 * The two outputs of one case a reader compares first: the latest version's
 * answer beside the answer of the version before it, or beside the answer
 * written without the skill when there is no earlier version. It compares
 * like with like where it can: when one agent and model wrote on both sides,
 * that pair is the one, so the difference read is the skill's and not the
 * model's. With one version and no baseline there is only the one answer.
 * A stopped output is passed over while the case has any other, so a version
 * whose run was stopped is not the latest: the pair stays on the answers
 * there are.
 */
export function defaultPair<T extends PairOutput>(all: readonly T[]): Pair<T> {
  const outputs = endedOf(all)
  const skilled = outputs.filter(testedVersion)
  const bare = outputs.filter((o) => o.configuration === 'without_skill')
  if (!skilled.length)
    return { a: null, b: newestFirstSample(bare) ?? newestFirstSample([...outputs]) }
  const numbers = skilled.map((o) => versionNumber(o.version) as number)
  const latest = Math.max(...numbers)
  const before = Math.max(...numbers.filter((n) => n < latest))
  const of = (n: number) => skilled.filter((o) => versionNumber(o.version) === n)
  const earlier = Number.isFinite(before) ? of(before) : bare
  const later = of(latest)
  const matched = later.filter((o) => earlier.some((e) => e.writer === o.writer))
  const b = newestFirstSample(matched.length ? matched : later)
  return {
    a:
      newestFirstSample(earlier.filter((e) => e.writer === b?.writer)) ??
      newestFirstSample(earlier),
    b,
  }
}
