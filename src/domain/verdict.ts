/**
 * Verdicts: the facts a score is counted from. Jev answers a fact with a
 * probability; the reader may answer it themselves, and their answer stands.
 * Pure functions, shared by every pack's scorer and the page.
 */
import type {
  Aside,
  Corrections,
  JudgedVerdict,
  MeasuredVerdict,
  Verdict,
  VerdictKind,
} from './pack.ts'

/** A fact's name within its output: its kind and its words. */
export const verdictId = (kind: VerdictKind, text: string): string => `${kind}:${text.trim()}`

/**
 * A name for each of a case's checks, in the order given. A check is named by
 * its words, so the name outlives its file's. Where two checks of one case say
 * the same thing, each after the first carries its own id too, so the reader's
 * answer on one is not an answer on the other.
 */
export function checkIds(checks: ReadonlyArray<{ id: string; text: string }>): string[] {
  const taken = new Set<string>()
  return checks.map((check) => {
    const byWords = verdictId('check', check.text)
    const id = taken.has(byWords) ? `${byWords} #${check.id}` : byWords
    taken.add(id)
    return id
  })
}

interface Fact {
  kind: VerdictKind
  text: string
  layer: string | null
  /** A name of its own: for a fixed question whose words may change, or a check told from one that says the same. */
  id?: string
  section?: string
  weight?: number
}

/** The two thresholds an answer of Jev's is read by (`BenchConfig.yes`, `BenchConfig.no`). */
export interface Cuts {
  yes: number
  no: number
}

/**
 * How one answer of Jev's reads: met at `yes` and above, missed at `no` and
 * below, and unsure between the two, where a yes is about as likely as a no.
 * `applies` is the probability the fact is for this kind of work at all: at
 * `no` and below the fact is inapplicable, whatever was answered of it.
 */
export function readingOf(noul: number, cuts: Cuts, applies = 1): 'met' | 'missed' | Aside {
  // A config that names no `no`, such as one a report kept from before, reads every answer as yes or no.
  const no = Number.isFinite(cuts.no) ? Math.min(cuts.no, cuts.yes) : cuts.yes
  if (applies < cuts.yes && applies <= no) return 'inapplicable'
  if (noul >= cuts.yes) return 'met'
  return noul > no ? 'unsure' : 'missed'
}

/**
 * A fact Jev answered, read by `cuts` (`readingOf`), unless the reader says
 * otherwise: their answer is met or missed, and it counts.
 */
export function jevVerdict(
  fact: Fact,
  noul: number,
  cuts: Cuts,
  corrections: Corrections,
  applies = 1,
): JudgedVerdict {
  const id = fact.id ?? verdictId(fact.kind, fact.text)
  const reading = readingOf(noul, cuts, applies)
  const jev = reading === 'met' ? true : reading === 'missed' ? false : null
  const own = Object.hasOwn(corrections, id) ? corrections[id] : undefined
  // An answer the reader gave is theirs whatever Jev said: moving the threshold must not hide it.
  if (own !== undefined) return { ...fact, id, met: own, jev, open: true, corrected: true }
  return jev === null
    ? { ...fact, id, met: false, aside: reading as Aside, jev, open: true, corrected: false }
    : { ...fact, id, met: jev, jev, open: true, corrected: false }
}

/** A fact code measured. Nobody corrects a count. */
export const codeVerdict = (fact: Fact, met: boolean): MeasuredVerdict => ({
  ...fact,
  id: fact.id ?? verdictId(fact.kind, fact.text),
  met,
  open: false,
  corrected: false,
})

/** Something wrong that counts in no layer of its own, such as a length outside the case's range. */
export const finding = (text: string): MeasuredVerdict =>
  codeVerdict({ kind: 'other', text, layer: null }, false)

/**
 * Facts met out of facts counted, each by its weight: a ×2 check counts two
 * on both sides, so "3 of 4" and a bar at 75 say the same thing. Without a
 * weighted fact the numbers are plain counts.
 */
export interface Count {
  met: number
  /** The facts counted: met and missed. One set aside is in neither number. */
  total: number
  /** How many facts Jev was not sure of, each counted once: they are in no score until the reader answers them. */
  unsure: number
}

const weightOf = (v: Verdict): number => v.weight ?? 1

/** The facts that count: every one but those set aside. */
export const counted = <V extends Verdict>(facts: readonly V[]): V[] =>
  facts.filter((v) => !v.aside)

function countFacts(facts: readonly Verdict[]): Count | null {
  const unsure = facts.filter((v) => v.aside === 'unsure').length
  const marked = counted(facts)
  // Facts that do not apply to this output are no count of it at all.
  if (!marked.length && !unsure) return null
  return {
    met: marked.reduce((sum, v) => sum + (v.met ? weightOf(v) : 0), 0),
    total: marked.reduce((sum, v) => sum + weightOf(v), 0),
    unsure,
  }
}

/** How many of the facts of one kind an output meets, by weight; null when it has none of that kind. */
export const countOf = (verdicts: readonly Verdict[], kind: VerdictKind): Count | null =>
  countFacts(verdicts.filter((v) => v.kind === kind))

/** How many of a layer's facts an output meets, by weight; null when the layer is not counted from facts. */
export const layerCount = (verdicts: readonly Verdict[], layer: string): Count | null =>
  countFacts(verdicts.filter((v) => v.layer === layer))

/** Counts added up across outputs; null when none of them has a count. */
export function sumCounts(counts: ReadonlyArray<Count | null>): Count | null {
  const present = counts.filter((c): c is Count => c !== null)
  return present.length
    ? present.reduce((sum, c) => ({
        met: sum.met + c.met,
        total: sum.total + c.total,
        unsure: sum.unsure + c.unsure,
      }))
    : null
}
