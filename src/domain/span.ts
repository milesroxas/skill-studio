import { type Cuts, readingOf } from './verdict.ts'

/** How an answer about a whole output is put together from answers about its parts. */
export type Span = 'any' | 'every' | 'start' | 'end' | 'whole'

/**
 * One answer about a whole output, from the answers about its parts: a
 * probability that reads as the joined answer does under the same cuts, or
 * null when the parts cannot settle it, so the fact stands as not read.
 *
 * `parts` holds each part's probability in order, null for a part that was not
 * read. One part, read, is the answer itself. `span` is how the fact is put
 * together (`Span`), or null when nobody has said:
 *
 * - `any`: the highest part. A yes from a part read stands even when another
 *   was not read; without a yes, a part not read leaves it not read.
 * - `every`: the lowest part. A no from a part read stands even when another
 *   was not read; without a no, a part not read leaves it not read.
 * - `start`, `end`: the first or the last part, when it was read.
 * - `whole`: not read whenever there is more than one part.
 * - unknown: with every part read, the answer when every part reads the same
 *   way, and not read when they differ. With a part not read, not read.
 *
 * The probability carried is the part that settles the answer: the highest for
 * `any`, the lowest for `every`, and for parts that agree the least sure of
 * them, the lowest of those met and the highest of those missed. So a joined
 * answer is no surer than its weakest support, and Jev's certainty over a
 * reading in parts is never raised by asking more parts.
 */
export function joinParts(
  span: Span | null | undefined,
  parts: ReadonlyArray<number | null>,
  cuts: Cuts,
): number | null {
  const read = parts.filter((p): p is number => p !== null)
  if (!read.length) return null
  const whole = read.length === parts.length
  if (parts.length === 1) return read[0]
  const reads = (p: number) => readingOf(p, cuts)
  switch (span) {
    case 'any': {
      const highest = Math.max(...read)
      return whole || reads(highest) === 'met' ? highest : null
    }
    case 'every': {
      const lowest = Math.min(...read)
      return whole || reads(lowest) === 'missed' ? lowest : null
    }
    case 'start':
      return parts[0]
    case 'end':
      return parts[parts.length - 1]
    case 'whole':
      return null
    default: {
      if (!whole) return null
      const readings = new Set(read.map(reads))
      if (readings.size !== 1) return null
      // Parts that agree carry the one least sure of them: nearest the line between yes and no.
      return readings.has('met') ? Math.min(...read) : Math.max(...read)
    }
  }
}
