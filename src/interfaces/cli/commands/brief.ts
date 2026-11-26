/**
 * What `--brief` prints, for an agent in a chat to read in place of the full
 * report: for each case, by name and in the order `st cases` lists them, the
 * run that did better where two are read, and the words of each rule or check
 * an output missed. Nothing else.
 */
import {
  type Apart,
  type AttemptState,
  type CaseBrief,
  type ComparedCases,
  caseBriefs,
  casesApart,
  type RunScoring,
} from '@application/grade.ts'
import { caseName } from '@domain/case-draft.ts'
import type { CaseMove } from '@domain/case-result.ts'
import { casesInOrder } from '@domain/results-address.ts'
import type { Report, SampleMeta } from '@domain/schemas.ts'
import type { RunView } from '@domain/views.ts'
import { loadCases } from '@infrastructure/cases.ts'
import type { Context } from './command.ts'

/** The skill's case ids in the order `st cases` lists them, and each case's name, by id. */
function namesOf(skill: string, views: readonly RunView[]) {
  const live = loadCases(skill)
  const name = (id: string): string => {
    const found =
      live.find((c) => c.id === id) ??
      views.flatMap((v) => (Object.hasOwn(v.cases, id) ? (v.cases[id].earlier ?? []) : []))[0]
    return found ? caseName(found) : id
  }
  return { order: live.map((c) => c.id), name }
}

/** One run as the command read it, and as it is scored. */
type Side = Omit<RunScoring, 'report'> & { report: Report | null; view: RunView }

/** One of two graded runs `compare` reads. */
type Graded = RunScoring & { view: RunView }

/** Each case of one run, brief, by case id, scored as `st report` scores it. */
const briefsOf = (skill: string, side: Side, scoring: Context['scoring']) =>
  caseBriefs(skill, side, side.view.meta, scoring)

/** Refuse `--brief` beside `--json`: the one is read as words, the other as JSON. */
export function briefOrJson(values: Context['values']): boolean {
  if (values.brief && values.json) throw new Error('Pass --brief or --json, not both.')
  return Boolean(values.brief)
}

/** A reason as a run or a grading recorded it, cut short where it runs long: an error can. */
function reason(text: string): string {
  const said = text.charAt(0).toLowerCase() + text.slice(1)
  return said.length > 80 ? `${said.slice(0, 79).trimEnd()}…` : said
}

/** What became of an attempt not read whole, in a few words. */
function stateWords(state: AttemptState): string {
  switch (state.kind) {
    case 'empty':
      return 'wrote nothing'
    case 'unreadable':
      return 'could not be read'
    case 'stopped':
      return 'stopped before it finished'
    case 'ungraded':
      return 'not graded'
    case 'removed':
      return 'its folder was removed'
    case 'unscored':
      return `not scored, ${reason(state.why)}`
    case 'failed':
      return `failed, ${reason(state.why)}`
  }
}

/** "1", "1 and 3", "1, 2 and 4". */
export const numbers = (list: readonly number[]): string =>
  list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : String(list[0])

/**
 * Why a case of one run was not read whole, a note each: each thing that
 * became of its attempts, with the attempts it became of where there are
 * more than one, then how many of its rules and checks were not read. None
 * where every attempt was read whole.
 */
function notesOf(brief: CaseBrief): string[] {
  if (!brief.attempts) return ['no attempt ran']
  const byWords = new Map<string, number[]>()
  for (const state of brief.apart) {
    const words = stateWords(state)
    byWords.set(words, [...(byWords.get(words) ?? []), state.index])
  }
  const notes = [...byWords].map(([words, attempts]) =>
    brief.attempts === 1
      ? words
      : attempts.length === brief.attempts
        ? `every attempt ${words}`
        : `attempt${attempts.length > 1 ? 's' : ''} ${numbers(attempts)} ${words}`,
  )
  if (brief.unread)
    notes.push(
      `${brief.unread} ${brief.unread === 1 ? 'rule or check' : 'rules and checks'} not read`,
    )
  return notes
}

const NONE: CaseBrief = { attempts: 0, missed: [], unread: 0, apart: [] }

/**
 * One run, brief: each case it took or has a grading of, then a line for each
 * rule or check an attempt missed. A case not read whole says why in place of
 * "nothing missed". One run has no other to have done better than.
 */
export function printBrief(skill: string, side: Side, scoring: Context['scoring']): void {
  const briefs = briefsOf(skill, side, scoring)
  const { order, name } = namesOf(skill, [side.view])
  for (const id of casesInOrder(order, briefs.keys())) {
    const brief = briefs.get(id) ?? NONE
    const notes = notesOf(brief)
    const words = notes.length ? notes.join('; ') : brief.missed.length ? '' : 'nothing missed'
    console.log(words ? `${name(id)}: ${words}` : name(id))
    for (const w of brief.missed) console.log(`  missed: ${w}`)
  }
}

/** Which of the two runs did better on a case's checks, as `compare` reads it. */
const BETTER: Readonly<Record<CaseMove, string>> = {
  better: 'B did better',
  same: 'neither did better',
  worse: 'A did better',
  none: 'no checks to compare',
}

/** Why a case is not read between the two runs, in A and B (`casesApart`). */
const APART: Readonly<Record<Apart, string>> = {
  'only-a': 'only A answered it',
  'only-b': 'only B answered it',
  judged: 'not compared, graded with Jev in one of A and B and without it in the other',
  asked: 'not compared, its agent was asked another prompt or other files in A and in B',
}

/**
 * Two runs, brief, A the first named and B the second: each case either took,
 * which did better on its checks (`compareCases`) or why the two were not
 * read against each other (`casesApart`), what became of attempts not read
 * whole, in A or in B, then each rule or check an attempt missed, with which
 * run missed it.
 */
export function printBriefCompare(
  skill: string,
  a: Graded,
  b: Graded,
  byCase: ComparedCases,
  scoring: Context['scoring'],
): void {
  const inA = briefsOf(skill, a, scoring)
  const inB = briefsOf(skill, b, scoring)
  const apart = casesApart(a, b)
  const { order, name } = namesOf(skill, [b.view, a.view])
  for (const id of casesInOrder(order, [...inA.keys(), ...inB.keys()])) {
    const read = byCase.cases.find((c) => c.case === id)
    const why = apart.get(id)
    const one = inA.get(id) ?? NONE
    const two = inB.get(id) ?? NONE
    // A run with no attempt at the case is said by `only A answered it`, or by the case's absence from both.
    const notes = [
      ...notesOf(one).flatMap((n) => (one.attempts ? [`in A, ${n}`] : [])),
      ...notesOf(two).flatMap((n) => (two.attempts ? [`in B, ${n}`] : [])),
    ]
    const words = [...new Set([...one.missed, ...two.missed])]
    const head = [
      read ? BETTER[read.move] : why ? APART[why] : 'neither answered it',
      ...notes,
    ].join('; ')
    console.log(`${name(id)}: ${head}${words.length || notes.length ? '' : ', nothing missed'}`)
    for (const w of words) {
      const who = one.missed.includes(w) ? (two.missed.includes(w) ? 'A and B' : 'A') : 'B'
      console.log(`  ${who} missed: ${w}`)
    }
  }
}

/**
 * The one line `run --quiet` prints as an attempt ends: its case by name, its
 * number, and how it ended, a failure with why, as the run records it.
 */
export function attemptLine(skill: string): (sample: SampleMeta) => void {
  const { name } = namesOf(skill, [])
  return (s) =>
    console.error(
      `${name(s.case)}, attempt ${s.index}: ${
        s.failed
          ? `failed, it ${s.failed}${s.error ? ` (${s.error})` : ''}`
          : s.stopped
            ? 'stopped'
            : s.ok
              ? `done in ${s.seconds} s`
              : `no output written in ${s.seconds} s`
      }`,
    )
}
