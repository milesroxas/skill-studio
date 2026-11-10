/**
 * Picks: the reader's choice of the better of two outputs of one case. A pick
 * is the last word on which is better. Jev's scores stand beside it, and where
 * the two point opposite ways the pick says Jev is missing something. Pure
 * functions over plain facts about outputs, so they are tested without a page.
 */
import { versionNumber } from './lift.ts'
import { type Configuration, OVERALL, type Preference, type Vote } from './schemas.ts'

/** One output as picking reads it. */
export interface PickOutput {
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
  /** The agent wrote an output. A run stopped or failed before it did leaves nothing to read. */
  written: boolean
}

export interface Pair<T extends PickOutput = PickOutput> {
  /** The older side: the version before, or the answer written without the skill. */
  a: T | null
  /** The newer side: the latest version's answer. */
  b: T | null
}

/** The newest run's first sample, among the outputs that were written when any was. */
const newestFirstSample = <T extends PickOutput>(outputs: T[]): T | null =>
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
export function defaultPair<T extends PickOutput>(outputs: readonly T[]): Pair<T> {
  const skilled = outputs.filter(
    (o) => o.configuration !== 'without_skill' && versionNumber(o.version) !== null,
  )
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

const samePair = (p: Preference, x: string, y: string): boolean =>
  (p.a === x && p.b === y) || (p.a === y && p.b === x)

const flipped = (vote: Vote): Vote => (vote === 'a' ? 'b' : vote === 'b' ? 'a' : 'tie')

/** The reader's pick between `a` and `b`, said from that order; null when they have not picked. */
export function pickBetween(preferences: readonly Preference[], a: string, b: string): Vote | null {
  const found = preferences.find(
    (p) => p.by === 'human' && p.criterion === OVERALL && samePair(p, a, b),
  )
  if (!found) return null
  return found.a === a ? found.vote : flipped(found.vote)
}

/**
 * How a pick stands against the scores. `differs` when the reader picked one
 * side and the other scores higher: Jev's facts do not hold what the reader
 * saw. A tie picked, or a score missing, is never a difference.
 */
export function pickStanding(
  vote: Vote | null,
  totalA: number | null,
  totalB: number | null,
): 'agrees' | 'differs' | null {
  if (vote === null || totalA === null || totalB === null) return null
  const higher = totalA === totalB ? 'tie' : totalA > totalB ? 'a' : 'b'
  if (vote === 'tie' || higher === 'tie') return 'agrees'
  return vote === higher ? 'agrees' : 'differs'
}
