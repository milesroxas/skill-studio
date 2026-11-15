/**
 * A change in score, read between two ends: two runs of one case, or two
 * outputs. The reader answers a fact where they look, which is most often the
 * newest run, so a change counted with their answers would rise by their
 * attention and not by the skill. A change is read from Jev's answers alone,
 * unless both ends hold the reader's answer on the same fact: that answer then
 * counts at both. A score shown on its own still counts every answer the
 * reader gave. Pure.
 */
import { type Corrections, NO_CORRECTIONS } from './pack.ts'

/** The facts the reader answered at one end: on any of its outputs. */
const answeredAt = (end: readonly Corrections[]): Set<string> =>
  new Set(end.flatMap((corrections) => Object.keys(corrections)))

/** Only the answers on `facts`; the same object when it keeps them all. */
function keptTo(corrections: Corrections, facts: ReadonlySet<string>): Corrections {
  const ids = Object.keys(corrections)
  if (ids.every((id) => facts.has(id))) return corrections
  const kept = ids.filter((id) => facts.has(id))
  return kept.length ? Object.fromEntries(kept.map((id) => [id, corrections[id]])) : NO_CORRECTIONS
}

/**
 * The reader's answers each output of two ends keeps for the change between
 * them, in the order given: those on a fact the reader answered at both ends,
 * on some output of each, and no other. Every other fact is read as Jev
 * answered it.
 */
export function changeAnswers(
  a: readonly Corrections[],
  b: readonly Corrections[],
): { a: Corrections[]; b: Corrections[] } {
  const there = answeredAt(b)
  const both = new Set([...answeredAt(a)].filter((id) => there.has(id)))
  return { a: a.map((c) => keptTo(c, both)), b: b.map((c) => keptTo(c, both)) }
}
