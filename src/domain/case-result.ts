/**
 * A result read as cases, on checks: for each case, whether its answer is
 * better, the same or worse between two ends, such as the run without the
 * skill and a run of one version, or one version and the next, and how many
 * cases are each: "better on 4, the same on 1, worse on 1".
 *
 * Only checks are read, a case's own and the checks for every case, never
 * rules: a rule comes from the skill's text, and an edited rule is a new fact
 * the other end never had. A check stays the same from one version to the
 * next. Only the checks both ends were marked on count, as a change between
 * two runs counts them (`change.ts`): one either end set aside on any of its
 * attempts is left out at both, and the reader's answers count only where
 * both ends hold one on the same check (`changeAnswers`). Pure.
 */
import { changeAnswers } from './change.ts'
import type { Aside, Corrections, Verdict } from './pack.ts'
import type { Configuration } from './schemas.ts'
import { mean, spread } from './stats.ts'
import { type Count, countOf, factKey } from './verdict.ts'

/**
 * How a case moved between two ends: better, the same or worse on its checks,
 * or `none` where no check was marked at both ends, which is no move at all
 * and is never counted as the same.
 */
export type CaseMove = 'better' | 'same' | 'worse' | 'none'

/** One case at two ends, as `caseResult` reads it. */
export interface CaseEnds {
  case: string
  /** The reader's answers on each attempt at the first end, in order. */
  a: readonly Corrections[]
  /** The same at the second end. */
  b: readonly Corrections[]
  /**
   * One end's attempts scored with the answers given, by the same scorers
   * every score is counted by: the verdicts of each attempt, in the order of
   * the answers.
   */
  verdictsOf: (end: 'a' | 'b', answers: Corrections[]) => ReadonlyArray<readonly Verdict[]>
}

/** Checks met of checks counted on one attempt, each by its weight, over the checks both ends were marked on. */
export interface Met {
  met: number
  total: number
}

/** How one case moved on its checks. */
export interface CaseResult {
  case: string
  move: CaseMove
  /** Each attempt at the first end that was marked on a check both ends counted. */
  a: Met[]
  /** The same at the second end. */
  b: Met[]
  /** How many checks were marked at both ends: the ones read. */
  checks: number
  /** How many checks only one end was marked on, or either set aside: left out at both. */
  left: number
  /**
   * Each end had one attempt, so there is no spread to say how far an answer
   * moves by itself: the move is read from the difference alone, and a small
   * move may be chance.
   */
  alone: boolean
  /** An answer of the reader's that only one end holds was read as Jev answered it. */
  oneSided: boolean
  /** Every check either end was asked, a mark a side, in one order (`checkSlots`). */
  slots: CheckSlot[]
  /**
   * How many more checks the second end met than the first, one each whatever
   * its weight, over the checks read: its marks met less the first end's. A
   * check met on some attempts and missed on others is not met. Null where
   * the move is `none`.
   */
  moved: number | null
  /** How many of the checks read each end met, one each: the counts `moved` is the difference of. Null where the move is `none`. */
  marks: { a: number; b: number } | null
  /** Why each end has no check to read, where it has none (`blankOf`). */
  blank: { a: Blank; b: Blank }
}

/** How one check stands at one end, over its attempts: met on all, missed on all, met on some, or marked on none. */
export type MarkState = 'met' | 'missed' | 'split' | 'unmarked'

/** One check at both ends: a mark each, so a check keeps its place on both. */
export interface CheckSlot {
  /** `factKey` of its layer and id. */
  key: string
  /** The check, as its writer put it: the second end's words where it has them. */
  text: string
  weight: number
  /** Null where that end was never asked the check. */
  a: MarkState | null
  b: MarkState | null
}

interface Seen {
  text: string
  weight: number
  met: number
  missed: number
}

/** Each check of one end by `factKey`, in the order first met, with how often it was met and missed. */
function seenAt(end: ReadonlyArray<readonly Verdict[]>): Map<string, Seen> {
  const seen = new Map<string, Seen>()
  for (const verdicts of end)
    for (const v of verdicts) {
      if (v.kind !== 'check' || v.layer === null) continue
      const key = factKey(v.layer, v.id)
      const s = seen.get(key) ?? { text: v.text, weight: v.weight ?? 1, met: 0, missed: 0 }
      if (!v.aside) {
        if (v.met) s.met += 1
        else s.missed += 1
      }
      seen.set(key, s)
    }
  return seen
}

const stateOf = (s: Seen | undefined): MarkState | null => {
  if (!s) return null
  if (!(s.met + s.missed)) return 'unmarked'
  if (!s.missed) return 'met'
  return s.met ? 'split' : 'missed'
}

/**
 * Both ends' checks in one order, the second end's first, then those only the
 * first was asked: each a mark a side, so a check that changed is seen where
 * it changed.
 */
export function checkSlots(
  a: ReadonlyArray<readonly Verdict[]>,
  b: ReadonlyArray<readonly Verdict[]>,
): CheckSlot[] {
  const from = seenAt(a)
  const to = seenAt(b)
  return [...new Set([...to.keys(), ...from.keys()])].map((key) => {
    const s = (to.get(key) ?? from.get(key)) as Seen
    return {
      key,
      text: s.text,
      weight: s.weight,
      a: stateOf(from.get(key)),
      b: stateOf(to.get(key)),
    }
  })
}

/**
 * Why one end has no check to read: `no-checks` where it was asked none, else
 * why every check it was asked was set aside (what Jev could not read first,
 * then what nobody can mark, then what Jev was not sure of). Null where it
 * marked one.
 */
export type Blank = 'no-checks' | Aside | null

const BLANK_ORDER: readonly Aside[] = ['unread', 'unmarkable', 'unsure', 'inapplicable']

export function blankOf(end: ReadonlyArray<readonly Verdict[]>): Blank {
  const checks = end.flat().filter((v) => v.kind === 'check' && v.layer !== null)
  if (!checks.length) return 'no-checks'
  if (checks.some((v) => !v.aside)) return null
  return BLANK_ORDER.find((why) => checks.some((v) => v.aside === why)) ?? null
}

/** The share met of one attempt, 0 to 1. */
const shareOf = (m: Met): number => m.met / m.total

/** Shares closer than this are the same: met and total are sums of whole weights, so a real difference is far larger. */
const EPSILON = 1e-9

/** The checks of one end, each by `factKey`: those it was marked on, and those it set aside on any attempt. */
function checksAt(end: ReadonlyArray<readonly Verdict[]>): {
  asked: Set<string>
  aside: Set<string>
} {
  const asked = new Set<string>()
  const aside = new Set<string>()
  for (const verdicts of end)
    for (const v of verdicts) {
      if (v.kind !== 'check' || v.layer === null) continue
      const key = factKey(v.layer, v.id)
      asked.add(key)
      if (v.aside) aside.add(key)
    }
  return { asked, aside }
}

/** Checks met of checks counted on each attempt, over `keys`; an attempt with none of them is left out. */
function metOf(end: ReadonlyArray<readonly Verdict[]>, keys: ReadonlySet<string>): Met[] {
  return end.flatMap((verdicts) => {
    const read = verdicts.filter(
      (v) => v.kind === 'check' && v.layer !== null && keys.has(factKey(v.layer, v.id)),
    )
    if (!read.length) return []
    const weight = (v: Verdict) => v.weight ?? 1
    return [
      {
        met: read.reduce((sum, v) => sum + (v.met ? weight(v) : 0), 0),
        total: read.reduce((sum, v) => sum + weight(v), 0),
      },
    ]
  })
}

/** Whether `value` lies inside the lowest and highest of `values`. */
const within = (value: number, values: readonly number[]): boolean => {
  const { low, high } = spread(values) as { low: number; high: number }
  return value >= low - EPSILON && value <= high + EPSILON
}

/**
 * How one case moved on its checks between two ends. Each end is scored with
 * the reader's answers both ends hold (`changeAnswers`), and read over the
 * checks both were marked on and neither set aside. Then:
 *
 * - With more than one attempt at either end, the answer is the same where
 *   either end's mean lies inside the spread of the other's attempts: the
 *   attempts at one version already land that far apart. Else it is better or
 *   worse by which mean is higher.
 * - With one attempt at each end there is no spread to read: better or worse
 *   by the difference, the same only where there is none, and `alone` says a
 *   small move may be chance.
 * - With no check marked at both ends, or no attempt marked on one at either
 *   end, it is `none`.
 */
export function caseResult(ends: CaseEnds): CaseResult {
  const kept = changeAnswers(ends.a, ends.b)
  const oneSided = kept.a.some((c, i) => c !== ends.a[i]) || kept.b.some((c, i) => c !== ends.b[i])
  const at = { a: ends.verdictsOf('a', kept.a), b: ends.verdictsOf('b', kept.b) }
  const from = checksAt(at.a)
  const to = checksAt(at.b)
  const both = [...from.asked].filter((key) => to.asked.has(key))
  const keys = new Set(both.filter((key) => !from.aside.has(key) && !to.aside.has(key)))
  const all = new Set([...from.asked, ...to.asked])
  const a = metOf(at.a, keys)
  const b = metOf(at.b, keys)
  const alone = a.length === 1 && b.length === 1
  const slots = checkSlots(at.a, at.b)
  const base = {
    case: ends.case,
    a,
    b,
    checks: keys.size,
    left: all.size - keys.size,
    oneSided,
    slots,
    blank: { a: blankOf(at.a), b: blankOf(at.b) },
  }
  if (!keys.size || !a.length || !b.length)
    return { ...base, move: 'none', alone: false, moved: null, marks: null }
  const metAt = (side: 'a' | 'b') =>
    slots.filter((s) => keys.has(s.key) && s[side] === 'met').length
  const sharesA = a.map(shareOf)
  const sharesB = b.map(shareOf)
  const meanA = mean(sharesA) as number
  const meanB = mean(sharesB) as number
  const same = alone
    ? Math.abs(meanB - meanA) <= EPSILON
    : within(meanB, sharesA) || within(meanA, sharesB)
  const marks = { a: metAt('a'), b: metAt('b') }
  return {
    ...base,
    move: same ? 'same' : meanB > meanA ? 'better' : 'worse',
    alone,
    moved: marks.b - marks.a,
    marks,
  }
}

/** The cases two ends were read on, and how many moved each way. */
export interface CaseResults {
  cases: CaseResult[]
  better: number
  same: number
  worse: number
  /** Cases with no check marked at both ends: counted apart, never as the same. */
  none: number
}

/** Each case read with `caseResult`, in the order given, and the count of each move. */
export function caseResults(ends: readonly CaseEnds[]): CaseResults {
  const cases = ends.map(caseResult)
  const count = (move: CaseMove) => cases.filter((c) => c.move === move).length
  return {
    cases,
    better: count('better'),
    same: count('same'),
    worse: count('worse'),
    none: count('none'),
  }
}

/**
 * What one output met, read apart: checks met of checks counted, and rules
 * followed of rules counted (`countOf`). An output of a run without the skill
 * has no rules count: its agent never saw the rules, so following them is no
 * measure of it.
 */
export interface TwoCounts {
  checks: Count | null
  rules: Count | null
}

/** The two counts of one output's verdicts, for a run of `configuration`. */
export const twoCounts = (
  verdicts: readonly Verdict[],
  configuration: Configuration,
): TwoCounts => ({
  checks: countOf(verdicts, 'check'),
  rules: configuration === 'without_skill' ? null : countOf(verdicts, 'rule'),
})
