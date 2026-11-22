/**
 * All cases read on checks: each case's newest answer set against its answer
 * without the skill, or against its answer before, as better, the same or
 * worse (`caseResult` in `domain/case-result.ts`), with how many checks each
 * side met. What the head counts, what the table's columns are called, the
 * words a case's line and its row say, and what the note behind the count of
 * cases says are worked out here, so the screen only draws them. Pure.
 */
import { type Blank, type CaseMove, caseResult } from '@domain/case-result.ts'
import type { BenchConfig } from '@domain/schemas.ts'
import {
  type CaseStand,
  type CaseTry,
  isWithoutSkill,
  type Output,
  plural,
  runTitle,
  scoreOf,
  unreadOutput,
  withAnswers,
} from './model.ts'

/** What a case's newest answer is set against: its answer without the skill, or its answer before. */
export type Against = 'without' | 'before'

/** `against` in the address; without the skill unless it says `before`. */
export const againstOf = (params: URLSearchParams): Against =>
  params.get('against') === 'before' ? 'before' : 'without'

/** One case read on its checks. */
export interface CaseRead {
  stand: CaseStand
  /** The answer it is read against, and its newest; null where there is none. */
  from: CaseTry | null
  to: CaseTry | null
  move: CaseMove
  /** Checks met now less checks met before, one each; null where nothing is compared. */
  moved: number | null
  /** The checks read, and how many each side met: the head's note adds them up. */
  marks: { checks: number; a: number; b: number } | null
  /** Each side ran once and one check moved: the move may be chance. */
  chance: boolean
  /** Either side is more than one attempt. */
  several: boolean
  /** Why there is nothing to compare, in a few words; null where there is. */
  why: string | null
}

/** A case was set against another answer on its checks. */
export const compared = (read: CaseRead): boolean => read.move !== 'none'

/** The outputs of a run that a reading counts: each that ran to its end and has a grading Jev could read. */
const counted = (t: CaseTry): Output[] =>
  t.outputs.filter((o) => !o.cut && !unreadOutput(o) && o.result !== null)

/** A word for a run with no score ("Writing…", "Not graded"), said of the run without the skill. */
const withoutWords = (word: string): string =>
  word.endsWith('…') ? `${word.slice(0, -1)} without the skill…` : `${word} without the skill`

/** "graded without Jev", "graded by Jev": how runs other than `t` were graded, since `t` was graded the other way. */
const gradedOther = (t: CaseTry): string =>
  t.run.report?.model ? 'graded without Jev' : 'graded by Jev'

const BLANK_WORDS: Record<Exclude<Blank, 'no-checks' | null>, string> = {
  unread: 'Its checks were not read',
  unmarkable: 'Its checks cannot be marked',
  unsure: 'Jev was not sure of its checks',
  inapplicable: 'Its checks do not apply',
}

/** Why two answers both marked had no check in common to read. */
function blankWhy(blank: { a: Blank; b: Blank }, to: CaseTry): string {
  if (blank.a === 'no-checks' && blank.b === 'no-checks')
    return to.run.report && !to.run.report.model ? 'No check was marked' : 'The case has no checks'
  for (const side of [blank.b, blank.a]) if (side && side !== 'no-checks') return BLANK_WORDS[side]
  return 'No check was marked on both answers'
}

/**
 * One case on its checks against `against`. `word` says why a run has no
 * score in the table's own words ("Writing…", "Not graded"), which turn on
 * the jobs running now.
 */
export function readCase(
  stand: CaseStand,
  config: BenchConfig,
  against: Against,
  word: (t: CaseTry) => string,
): CaseRead {
  const to = stand.latest
  const from = against === 'without' ? stand.floor : stand.previous
  const none = (why: string): CaseRead => ({
    stand,
    from,
    to,
    move: 'none',
    moved: null,
    marks: null,
    chance: false,
    several: false,
    why,
  })
  if (!to) {
    const newest = stand.history.find((t) => !isWithoutSkill(t.run))
    return none(
      newest ? word(newest) : stand.history.length ? 'Not run with the skill yet' : 'Not run yet',
    )
  }
  if (!from) {
    if (against === 'before')
      return none(stand.apart ? `Runs before were ${gradedOther(to)}` : 'First run')
    const without = stand.history.find((t) => isWithoutSkill(t.run))
    if (!without) return none('Not run without the skill')
    return none(
      without.score === null
        ? withoutWords(word(without))
        : `Without the skill, ${gradedOther(to)}`,
    )
  }
  const a = counted(from)
  const b = counted(to)
  const result = caseResult({
    case: stand.id,
    a: a.map((o) => o.corrections),
    b: b.map((o) => o.corrections),
    verdictsOf: (end, answers) =>
      withAnswers(end === 'a' ? a : b, answers).map((o) => scoreOf(o, config)?.verdicts ?? []),
  })
  if (result.move === 'none' || !result.marks) return none(blankWhy(result.blank, to))
  return {
    stand,
    from,
    to,
    move: result.move,
    moved: result.moved,
    marks: { checks: result.checks, ...result.marks },
    chance: result.alone && result.move !== 'same' && Math.abs(result.moved ?? 0) === 1,
    several: !result.alone,
    why: null,
  }
}

/** How a case moved, as one word: what its line in the case list and its row's change start with. */
export const MOVE_WORD = { better: 'Better', same: 'Same', worse: 'Worse' } as const

/**
 * What a compared case's newest answer is set against, inside a sentence:
 * "without the skill", "v1", or "the run before" for an answer of the same
 * version.
 */
function againstName(read: CaseRead): string {
  const { from, to } = read
  if (!from || isWithoutSkill(from.run)) return 'without the skill'
  const name = runTitle(from.run, { short: true })
  return to && runTitle(to.run, { short: true }) === name ? 'the run before' : name
}

/**
 * A compared case's line in the case list, in words: "Better than without the
 * skill", "Same as v1", "Worse than the run before". Null where nothing is
 * compared, which says why in its own words (`CaseRead.why`).
 */
export function moveLine(read: CaseRead): string | null {
  if (read.move === 'none') return null
  const link = read.move === 'same' ? 'as' : 'than'
  return `${MOVE_WORD[read.move]} ${link} ${againstName(read)}`
}

/** How many checks one side of a compared case met, for its column: "1 of 2 checks". */
export function sideCount(read: CaseRead, side: 'a' | 'b'): string | null {
  return read.marks ? `${read.marks[side]} of ${plural(read.marks.checks, 'check')}` : null
}

/** How many cases are better, the same and worse. */
export function outcomeCounts(
  reads: readonly CaseRead[],
): Record<'better' | 'same' | 'worse', number> {
  const n = (move: CaseMove) => reads.filter((r) => r.move === move).length
  return { better: n('better'), same: n('same'), worse: n('worse') }
}

/** "1 better · 4 same", with worse only when there is one: All cases' line in the case list. */
export function outcomeLine(reads: readonly CaseRead[]): string {
  const { better, same, worse } = outcomeCounts(reads)
  return [`${better} better`, `${same} same`, worse ? `${worse} worse` : null]
    .filter(Boolean)
    .join(' · ')
}

/** Checks met now less checks met before, added up over the cases compared. */
export const checksMoved = (reads: readonly CaseRead[]): number =>
  reads.reduce((n, r) => n + (r.moved ?? 0), 0)

/** What a column of marks is headed by, and whether its rows say their version after their marks. */
export interface SideName {
  name: string
  /** The head names no one version, so each row says its own. */
  rowsSay: boolean
}

/**
 * The two columns' heads. The newer is the version every compared case's
 * newest answer is on, else "With the skill". The other is "Without the
 * skill", or the version every answer before is on, "The run before" when
 * that is the newer one's too, else "The version before".
 */
export function sideNames(
  reads: readonly CaseRead[],
  against: Against,
): { from: SideName; to: SideName } {
  const shown = reads.filter(compared)
  const one = (runs: Array<CaseTry | null>): string | null => {
    const names = new Set(runs.map((t) => (t ? runTitle(t.run, { short: true }) : '')))
    return names.size === 1 ? ([...names][0] ?? null) || null : null
  }
  const to = one(shown.map((r) => r.to))
  const from = against === 'without' ? null : one(shown.map((r) => r.from))
  return {
    to: to ? { name: to, rowsSay: false } : { name: 'With the skill', rowsSay: true },
    from:
      against === 'without'
        ? { name: 'Without the skill', rowsSay: false }
        : from
          ? { name: from === to ? 'The run before' : from, rowsSay: false }
          : { name: 'The version before', rowsSay: true },
  }
}

/** The version a row's side is on, said after its marks only when its column's head names none. */
export const rowVersion = (t: CaseTry | null, side: SideName): string | null =>
  side.rowsSay && t ? runTitle(t.run, { short: true }) : null

/** One thing behind the counts, in the note the count of cases opens. */
export interface CasesNote {
  title: string
  text: string
}

/**
 * What stands behind the head's counts, for the reader who asks: how a case
 * is read, every check added up, the score out of 100 over the same cases,
 * and that a move of one check on one attempt may be chance.
 */
export function casesNotes(reads: readonly CaseRead[], against: Against): CasesNote[] {
  const shown = reads.filter(compared)
  const sum = (pick: (m: { checks: number; a: number; b: number }) => number) =>
    shown.reduce((n, r) => n + (r.marks ? pick(r.marks) : 0), 0)
  const scored = shown.filter((r) => r.from?.score != null && r.to?.score != null)
  const mean = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length)
  const notes: Array<CasesNote | null> = [
    {
      title: 'How a case is read',
      text: `Each case’s newest answer is set against ${against === 'without' ? 'its answer without the skill' : 'its answer before'}, on its checks alone.${shown.some((r) => r.several) ? ' A case with several attempts is the same unless it moved more than its attempts differ.' : ''}`,
    },
    shown.length
      ? {
          title: 'All checks',
          text: `Across the ${plural(shown.length, 'case')} compared, answers met ${sum((m) => m.b)} of ${plural(
            sum((m) => m.checks),
            'check',
          )}, from ${sum((m) => m.a)}.`,
        }
      : null,
    scored.length
      ? {
          title: 'The score',
          text: `The score out of 100, rules and checks together, averages ${mean(scored.map((r) => r.to?.score as number))}, from ${mean(scored.map((r) => r.from?.score as number))}.`,
        }
      : null,
    shown.some((r) => r.chance)
      ? {
          title: 'May be chance',
          text: 'Each case ran once on each side, so a move of one check may be chance. A change with a dotted line is one of those: run the case again to see if it holds.',
        }
      : null,
  ]
  return notes.filter((n): n is CasesNote => n !== null)
}
