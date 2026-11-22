/**
 * Verdicts: the facts a score is counted from. Jev answers a fact with a
 * probability; the reader may answer it themselves, and their answer stands.
 * Pure functions, shared by every pack's scorer and the page.
 */
import type { ExactAnswer, NoAnswer } from './exact.ts'
import {
  type Aside,
  type CodeAnswer,
  type Corrections,
  type JudgedVerdict,
  LEFT_OUT,
  type MeasuredVerdict,
  type UnmarkableVerdict,
  type Unmarked,
  type Verdict,
  type VerdictKind,
} from './pack.ts'
import type { ExactTest } from './rule-reading.ts'

/** A fact's name within its output: its kind and its words. */
export const verdictId = (kind: VerdictKind, text: string): string => `${kind}:${text.trim()}`

/** A fact as a layer counts it: its layer and its name, since one check may count in two layers. */
export const factKey = (layer: string | null, id: string): string => `${layer}\n${id}`

/** `corrections` that leave `facts` out of every layer, each by `factKey` (`LEFT_OUT`). */
export const leavingOut = (corrections: Corrections, facts: ReadonlySet<string>): Corrections => ({
  ...corrections,
  [LEFT_OUT]: facts,
})

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
 * `no` and below the fact is inapplicable, whatever was answered of it. A null
 * answer is one Jev gave none it could stand on, as for a long output whose
 * parts cannot settle the fact (`joinParts` in `span.ts`): it reads `unread`,
 * unless the fact does not apply anyway.
 */
export function readingOf(noul: number | null, cuts: Cuts, applies = 1): 'met' | 'missed' | Aside {
  // A config that names no `no`, such as one a report kept from before, reads every answer as yes or no.
  const no = Number.isFinite(cuts.no) ? Math.min(cuts.no, cuts.yes) : cuts.yes
  if (applies < cuts.yes && applies <= no) return 'inapplicable'
  if (noul === null) return 'unread'
  if (noul >= cuts.yes) return 'met'
  return noul > no ? 'unsure' : 'missed'
}

/**
 * Why code gave no answer on a fact it read, where that sets the fact aside as
 * not sure: it read the output and would not call it. Ordinary ways of
 * counting fall on both sides of the bound (`convention`), two readings of the
 * rule disagree (`differ`), a value is written in a way it does not read
 * (`other notation`), or the measured page leaves out elements the answer
 * rests on (`not listed`). Jev's answer does not count there: on these, a
 * sure answer of Jev's is a guess at what code could not settle.
 *
 * Every other reason is one where code never read what the fact is about:
 * the output is of a kind the reading does not read (`kind`), it is empty
 * (`empty`), the part or the values to look for are not there (`not there`),
 * or the page was not measured (`not measured`). There Jev's answer stands, as
 * it does for a fact nobody sorted, and its "does not apply" questions decide.
 */
export const SETS_ASIDE: ReadonlySet<NoAnswer> = new Set([
  'convention',
  'differ',
  'other notation',
  'not listed',
])

/** Code's stored answer as a verdict holds it (`CodeAnswer`), with the tests it answered when they were kept. */
export function codeAnswerOf(answer: ExactAnswer & { tests?: ExactTest[] }): CodeAnswer {
  const tests = answer.tests ?? []
  if (answer.answer === 'none')
    return {
      met: null,
      why: answer.why,
      saw: answer.saw,
      tests,
      stands: SETS_ASIDE.has(answer.why),
    }
  return { met: answer.answer === 'met', why: null, saw: answer.saw, tests, stands: true }
}

/**
 * A fact Jev answered, read by `cuts` (`readingOf`), unless the reader says
 * otherwise: their answer is met or missed, and it counts. A fact the
 * corrections leave out (`leavingOut`) is set aside whatever was answered. A
 * null `noul` is a fact Jev was asked of only part of what it needs: it stands
 * as not read, and the reader's own answer on it counts as on any other.
 *
 * `code` is what code answered, for a fact read by code. Where code's answer
 * stands (`CodeAnswer.stands`) it is the fact's, in place of Jev's: met,
 * missed, or not sure where code would not call it. A rule for another kind of
 * work (`applies` at `no` or below) does not apply, whoever answered it. The
 * reader's own answer stands over code's as over Jev's.
 */
export function jevVerdict(
  fact: Fact,
  noul: number | null,
  cuts: Cuts,
  corrections: Corrections,
  applies = 1,
  code?: ExactAnswer & { tests?: ExactTest[] },
): JudgedVerdict {
  const id = fact.id ?? verdictId(fact.kind, fact.text)
  const own = readingOf(noul, cuts, applies)
  const jev = own === 'met' ? true : own === 'missed' ? false : null
  const answer = code ? codeAnswerOf(code) : null
  const byCode = answer?.stands === true && own !== 'inapplicable'
  const reading: 'met' | 'missed' | Aside = !byCode
    ? own
    : answer.met === null
      ? 'unsure'
      : answer.met
        ? 'met'
        : 'missed'
  const by = byCode ? 'code' : 'jev'
  const extra = answer ? { code: answer } : {}
  // A fact a change leaves out counts in no layer, as one Jev was not sure of.
  if (corrections[LEFT_OUT]?.has(factKey(fact.layer, id)))
    return {
      ...fact,
      id,
      met: false,
      aside: reading === 'inapplicable' || reading === 'unread' ? reading : 'unsure',
      by,
      jev,
      ...extra,
      open: true,
      corrected: false,
    }
  const mark = Object.hasOwn(corrections, id) ? corrections[id] : undefined
  // An answer the reader gave is theirs whatever Jev said: moving the threshold must not hide it.
  if (mark !== undefined)
    return { ...fact, id, met: mark, by: 'reader', jev, ...extra, open: true, corrected: true }
  return reading === 'met' || reading === 'missed'
    ? { ...fact, id, met: reading === 'met', by, jev, ...extra, open: true, corrected: false }
    : { ...fact, id, met: false, aside: reading, by, jev, ...extra, open: true, corrected: false }
}

/** A fact code measured. Nobody corrects a count. */
export const codeVerdict = (fact: Fact, met: boolean): MeasuredVerdict => ({
  ...fact,
  id: fact.id ?? verdictId(fact.kind, fact.text),
  met,
  by: 'code',
  open: false,
  corrected: false,
})

/**
 * A rule or check a reading says nobody can mark as written: in no layer,
 * until the reader answers it. Their answer counts, as on a fact Jev was not
 * sure of. A fact a change leaves out (`leavingOut`) stays set aside.
 */
export function unmarkableVerdict(
  fact: Fact,
  unmarked: Unmarked,
  corrections: Corrections,
): UnmarkableVerdict {
  const id = fact.id ?? verdictId(fact.kind, fact.text)
  const aside = {
    ...fact,
    id,
    met: false,
    aside: 'unmarkable' as const,
    unmarkable: unmarked,
    by: null,
    open: true as const,
    corrected: false,
  }
  if (corrections[LEFT_OUT]?.has(factKey(fact.layer, id))) return aside
  const mark = Object.hasOwn(corrections, id) ? corrections[id] : undefined
  if (mark === undefined) return aside
  return {
    ...fact,
    id,
    met: mark,
    unmarkable: unmarked,
    by: 'reader',
    open: true,
    corrected: true,
  }
}

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
  /**
   * How many facts Jev did not read all of the output for (`unread`), each
   * counted once: in no score until the reader answers them, and counted apart
   * from `unsure`, since Jev was never asked of the whole.
   */
  unread: number
}

const weightOf = (v: Verdict): number => v.weight ?? 1

/** The facts that count: every one but those set aside. */
export const counted = <V extends Verdict>(facts: readonly V[]): V[] =>
  facts.filter((v) => !v.aside)

function countFacts(facts: readonly Verdict[]): Count | null {
  const unsure = facts.filter((v) => v.aside === 'unsure').length
  const unread = facts.filter((v) => v.aside === 'unread').length
  const marked = counted(facts)
  // Facts that do not apply to this output are no count of it at all.
  if (!marked.length && !unsure && !unread) return null
  return {
    met: marked.reduce((sum, v) => sum + (v.met ? weightOf(v) : 0), 0),
    total: marked.reduce((sum, v) => sum + weightOf(v), 0),
    unsure,
    unread,
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
        unread: sum.unread + c.unread,
      }))
    : null
}
