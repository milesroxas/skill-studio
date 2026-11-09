/**
 * Verdicts: the facts a score is counted from. Jev answers a fact with a
 * probability; the reader may answer it themselves, and their answer stands.
 * Pure functions, shared by every pack's scorer and the page.
 */
import type { Corrections, Verdict, VerdictKind } from './pack.ts'

/** A fact's name within its output: its kind and its words. */
export const verdictId = (kind: VerdictKind, text: string): string => `${kind}:${text.trim()}`

interface Fact {
  kind: VerdictKind
  text: string
  layer: string | null
  /** A name of its own, for a fixed question whose words may change. */
  id?: string
  section?: string
  weight?: number
}

/** A fact Jev answered: met when its probability reaches `yes`, unless the reader says otherwise. */
export function jevVerdict(
  fact: Fact,
  noul: number,
  yes: number,
  corrections: Corrections,
): Verdict {
  const id = fact.id ?? verdictId(fact.kind, fact.text)
  const jev = noul >= yes
  const own = corrections[id]
  return { ...fact, id, met: own ?? jev, open: true, corrected: own !== undefined && own !== jev }
}

/** A fact code measured. Nobody corrects a count. */
export const codeVerdict = (fact: Fact, met: boolean): Verdict => ({
  ...fact,
  id: fact.id ?? verdictId(fact.kind, fact.text),
  met,
  open: false,
  corrected: false,
})

/** Something wrong that counts in no layer of its own, such as a length outside the case's range. */
export const finding = (text: string): Verdict =>
  codeVerdict({ kind: 'other', text, layer: null }, false)

export interface Count {
  met: number
  total: number
}

/** How many of the facts of one kind an output meets; null when it has none of that kind. */
export function countOf(verdicts: readonly Verdict[], kind: VerdictKind): Count | null {
  const mine = verdicts.filter((v) => v.kind === kind)
  return mine.length ? { met: mine.filter((v) => v.met).length, total: mine.length } : null
}

/** How many of a layer's facts an output meets; null when the layer is not counted from facts. */
export function layerCount(verdicts: readonly Verdict[], layer: string): Count | null {
  const mine = verdicts.filter((v) => v.layer === layer)
  return mine.length ? { met: mine.filter((v) => v.met).length, total: mine.length } : null
}

/** Counts added up across outputs; null when none of them has a count. */
export function sumCounts(counts: ReadonlyArray<Count | null>): Count | null {
  const present = counts.filter((c): c is Count => c !== null)
  return present.length
    ? present.reduce((sum, c) => ({ met: sum.met + c.met, total: sum.total + c.total }))
    : null
}
