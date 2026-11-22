/**
 * A change in score, read between two ends: two runs of one case, or two
 * outputs. A change is read over the rules and checks both ends counted
 * (`changeReading`). The reader answers a fact where they look, which is most often the
 * newest run, so a change counted with their answers would rise by their
 * attention and not by the skill. A change is read from Jev's answers alone,
 * unless both ends hold the reader's answer on the same fact: that answer then
 * counts at both. A score shown on its own still counts every answer the
 * reader gave. Pure.
 */
import { type Corrections, NO_CORRECTIONS, type Verdict, type VerdictKind } from './pack.ts'
import { factKey, leavingOut } from './verdict.ts'

/** An output as a change reads it: its case, what its agent was asked (`RunCase.ask`), and whether Jev graded it. */
export interface Answered {
  case: string
  ask: string
  judged: boolean
}

/**
 * Two outputs whose scores can be set against each other: answers to the same
 * case as it was asked, both graded with Jev or both without.
 */
export const comparableAnswers = (a: Answered, b: Answered): boolean =>
  a.case === b.case && a.ask === b.ask && a.judged === b.judged

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

/** What one end was asked in some layer, each fact by `factKey` with its kind, and those it set aside on any of its outputs. */
function factsAt(end: ReadonlyArray<readonly Verdict[]>): {
  asked: Map<string, VerdictKind>
  aside: Set<string>
} {
  const asked = new Map<string, VerdictKind>()
  const aside = new Set<string>()
  for (const verdicts of end)
    for (const v of verdicts) {
      if (v.layer === null) continue
      const key = factKey(v.layer, v.id)
      asked.set(key, v.kind)
      if (v.aside) aside.add(key)
    }
  return { asked, aside }
}

/** What a change between two ends is read over (`changeReading`). */
export interface ChangeReading {
  /** The answers each output of the first end is scored with for the change, in the order given. */
  a: Corrections[]
  /** The same for the second end. */
  b: Corrections[]
  /** The kind of each fact left out at both ends, one entry a fact. */
  left: VerdictKind[]
  /** An answer of the reader's that only one end holds is read as Jev answered it (`changeAnswers`). */
  oneSided: boolean
}

/**
 * What a change between two ends is read over: the rules and checks both
 * ends counted. A fact both ends were asked, by its name in the same layer,
 * that either end set aside on any of its outputs, as not sure, as not
 * applying or as not read (an output too long for Jev to read whole), is
 * left out at both ends, so each end's layers are counted over
 * the same facts. A fact only one end was asked, such as a rule added,
 * edited or taken out between two versions, is the skill's own change, and
 * counts where it was asked. The reader's answers count only where both ends
 * hold one on the same fact (`changeAnswers`), so a fact they answered at both
 * counts at both, and is read so before anything is left out.
 *
 * `verdictsOf` scores one end's outputs with the answers given, by the same
 * scorers every score is counted by, and hands back the verdicts of each
 * output its score counts. Each end is then scored again with the answers
 * handed back here, which leave the facts out (`leavingOut`): a change is
 * the difference of the two scores counted so. When nothing is left to count
 * at an end, that end has no score, and there is no change to read.
 */
export function changeReading(
  a: readonly Corrections[],
  b: readonly Corrections[],
  verdictsOf: (end: 'a' | 'b', answers: Corrections[]) => ReadonlyArray<readonly Verdict[]>,
): ChangeReading {
  const kept = changeAnswers(a, b)
  const oneSided = kept.a.some((c, i) => c !== a[i]) || kept.b.some((c, i) => c !== b[i])
  const from = factsAt(verdictsOf('a', kept.a))
  const to = factsAt(verdictsOf('b', kept.b))
  const left = new Map(
    [...from.asked].filter(
      ([key]) => to.asked.has(key) && (from.aside.has(key) || to.aside.has(key)),
    ),
  )
  if (!left.size) return { ...kept, left: [], oneSided }
  const facts = new Set(left.keys())
  return {
    a: kept.a.map((c) => leavingOut(c, facts)),
    b: kept.b.map((c) => leavingOut(c, facts)),
    left: [...left.values()],
    oneSided,
  }
}
