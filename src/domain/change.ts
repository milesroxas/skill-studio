/**
 * A change in score, read between two ends: two runs of one case, or two
 * outputs. No change is read between two ends that counted different facts
 * (`countedApart`). The reader answers a fact where they look, which is most often the
 * newest run, so a change counted with their answers would rise by their
 * attention and not by the skill. A change is read from Jev's answers alone,
 * unless both ends hold the reader's answer on the same fact: that answer then
 * counts at both. A score shown on its own still counts every answer the
 * reader gave. Pure.
 */
import { type Corrections, NO_CORRECTIONS, type Verdict } from './pack.ts'

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

/** A fact as a layer counts it: its layer and its name, since one check may count in two layers. */
const factKey = (v: Verdict): string => `${v.layer}\n${v.id}`

/** The facts one end was asked in some layer, and those it set aside on any of its outputs. */
function factsAt(end: ReadonlyArray<readonly Verdict[]>): {
  asked: Set<string>
  aside: Set<string>
} {
  const asked = new Set<string>()
  const aside = new Set<string>()
  for (const verdicts of end)
    for (const v of verdicts) {
      if (v.layer === null) continue
      asked.add(factKey(v))
      if (v.aside) aside.add(factKey(v))
    }
  return { asked, aside }
}

/**
 * Two ends counted different facts: a rule or check both were asked, by its
 * name in the same layer, counted at one end and set aside at the other, as
 * not sure or as not applying, on any of that end's outputs. A layer is the
 * share met of the facts it counted, so a change between the two would be
 * read over different facts, and is not read at all. A fact only one end
 * was asked, such as a rule added, edited or taken out between two versions,
 * is the skill's own change, and does not stop one. Each end is its outputs'
 * verdicts as the change reads them (`changeAnswers`): a fact the reader
 * answered at both ends counts at both.
 */
export function countedApart(
  a: ReadonlyArray<readonly Verdict[]>,
  b: ReadonlyArray<readonly Verdict[]>,
): boolean {
  const from = factsAt(a)
  const to = factsAt(b)
  return [...from.asked].some(
    (key) => to.asked.has(key) && from.aside.has(key) !== to.aside.has(key),
  )
}
