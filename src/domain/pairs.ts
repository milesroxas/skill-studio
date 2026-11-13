/**
 * Pairs: the two outputs of one case that Results sets side by side first.
 * Pure functions over plain facts about outputs, so they are tested without a
 * page.
 */
import { testedVersion, versionNumber } from './lift.ts'
import type { Configuration } from './schemas.ts'

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
}

export interface Pair<T extends PairOutput = PairOutput> {
  /** The older side: the version before, or the answer written without the skill. */
  a: T | null
  /** The newer side: the latest version's answer. */
  b: T | null
}

/** The newest run's first sample, among the outputs that were written when any was. */
const newestFirstSample = <T extends PairOutput>(outputs: T[]): T | null =>
  (outputs.some((o) => o.written) ? outputs.filter((o) => o.written) : outputs).reduce<T | null>(
    (best, o) =>
      !best ||
      o.createdAt > best.createdAt ||
      (o.createdAt === best.createdAt && o.index < best.index)
        ? o
        : best,
    null,
  )

/**
 * The two outputs of one case a reader compares first: the latest version's
 * answer beside the answer of the version before it, or beside the answer
 * written without the skill when there is no earlier version. It compares
 * like with like where it can: when one agent and model wrote on both sides,
 * that pair is the one, so the difference read is the skill's and not the
 * model's. With one version and no baseline there is only the one answer.
 */
export function defaultPair<T extends PairOutput>(outputs: readonly T[]): Pair<T> {
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
