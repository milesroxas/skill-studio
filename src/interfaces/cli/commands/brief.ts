/**
 * What `--brief` prints, for an agent in a chat to read in place of the full
 * report: for each case, by id and name and in the order `st cases` lists them, the
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
import { caseName, oneLineTitle as oneLine, printable } from '@domain/case-draft.ts'
import type { CaseMove } from '@domain/case-result.ts'
import { casesInOrder } from '@domain/results-address.ts'
import type { Report, SampleMeta } from '@domain/schemas.ts'
import type { RunView } from '@domain/views.ts'
import { loadCases } from '@infrastructure/cases.ts'
import type { Context } from './command.ts'

/** Where a line breaks, as a terminal or an agent reading the text would break it. */
const LINE_BREAK = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/

/**
 * A case as the head of its `--brief` lines: its id in brackets at the start
 * of the line, where `--cases` can take it from, then its name on the same
 * line, once where the two are the same text. An id holds no bracket or space
 * (`isSafeName`), so `^\[([^\]]+)\]` finds it whatever the name holds.
 */
export const caseHead = (id: string, name: string): string => {
  const named = oneLine(name)
  return named === id ? `[${id}]` : `[${id}] ${named}`
}

/**
 * A case's head line, `head` and what follows it, on one line whatever it
 * holds. It is the one line of the output that starts at the margin with `[`:
 * every other line of a case is indented (`missedLines`).
 */
const headLine = (head: string, said: string): string => oneLine(said ? `${head}: ${said}` : head)

/**
 * A missed rule or check, `label` before its words, as indented lines: a rule
 * or check of several paragraphs keeps its line breaks, and loses only what a
 * terminal would act on rather than show (`printable`). The first line is two
 * spaces in, and every later line four, so none is read as a case's head, and
 * none as a miss of its own, whatever it starts with (`missed:` say).
 */
const missedLines = (label: string, words: string): string =>
  words
    .split(LINE_BREAK)
    .map((line) => printable(line))
    .map((line, i) => (i ? `    ${line}` : `  ${label}: ${line}`))
    .join('\n')

/**
 * The skill's case ids in the order `st cases` lists them, and each case's
 * head (`caseHead`), by id: a case since deleted is named as a run kept it.
 */
function namesOf(skill: string, views: readonly RunView[]) {
  const live = loadCases(skill)
  const name = (id: string): string => {
    const found =
      live.find((c) => c.id === id) ??
      views.flatMap((v) => (Object.hasOwn(v.cases, id) ? (v.cases[id].earlier ?? []) : []))[0]
    return found ? caseName(found) : id
  }
  return { order: live.map((c) => c.id), name, head: (id: string) => caseHead(id, name(id)) }
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

const NONE: CaseBrief = {
  attempts: 0,
  missed: [],
  misses: new Map(),
  unread: 0,
  apart: [],
  asked: 0,
  unsure: 0,
  whole: 0,
}

/**
 * How many of a case's rules and checks were left not sure, out of those
 * asked, `4 of 16`, counted over its attempts read whole, each rule or check
 * once. Over more than one attempt, one not sure on any of them counts:
 * `4 of 16 at least once`. Null where none was.
 */
function unsureCount(brief: CaseBrief): string | null {
  if (!brief.unsure) return null
  return `${brief.unsure} of ${brief.asked}${brief.whole > 1 ? ' at least once' : ''}`
}

/** What is counted as not sure, said once a line. */
const NOT_SURE = 'rules and checks not sure'

/** One run's count, as a case's line says it: `4 of 16 rules and checks not sure`, `... at least once`. Null where none was. */
function unsureWords(brief: CaseBrief): string | null {
  if (!brief.unsure) return null
  return `${brief.unsure} of ${brief.asked} ${NOT_SURE}${brief.whole > 1 ? ' at least once' : ''}`
}

/**
 * How many attempts missed a rule or check, where the case had more than one:
 * ` in 1 of 3`, out of the attempts it was marked on (`CaseBrief.misses`).
 * Nothing where the case had one attempt.
 */
function howOften(brief: CaseBrief, words: string): string {
  const count = brief.misses.get(words)
  return brief.attempts > 1 && count ? ` in ${count.of} of ${count.in}` : ''
}

/**
 * What a case's head line says of one run. Where an attempt was not read
 * whole, what became of it is said, as it always was, and that alone.
 * Otherwise how many of its rules and checks were left not sure, after
 * "nothing missed" where nothing was: "nothing missed" stands alone only
 * where every one asked got an answer.
 */
function caseWords(brief: CaseBrief, counted = true): string {
  const notes = notesOf(brief)
  if (notes.length) return notes.join('; ')
  const unsure = counted ? unsureWords(brief) : null
  if (brief.missed.length) return unsure ?? ''
  // A count left out for room leaves "nothing missed" unsaid: alone it would say more than is so.
  if (brief.unsure && !unsure) return ''
  return unsure ? `nothing missed, ${unsure}` : 'nothing missed'
}

/** The most a case prints, in bytes, beyond the words of the rules and checks it missed. */
const CASE_BYTES = 200
/** The longest a case's id runs to (`st case add`): a case is held to `CASE_BYTES` as though its id were this long. */
const ID_LONGEST = 40

/**
 * The bytes a case prints, as `CASE_BYTES` holds it: its head line and each
 * missed block, every line with its line end, less the words of each missed
 * rule or check that are printed whole on their one line, its id counted as
 * `ID_LONGEST` long.
 */
function caseBytes(
  id: string,
  head: string,
  missed: ReadonlyArray<[block: string, words: string]>,
): number {
  const lines = [head, ...missed.map(([block]) => block)].join('\n')
  const words = missed.reduce(
    (n, [, w]) => n + (!LINE_BREAK.test(w) && printable(w) === w ? Buffer.byteLength(w) : 0),
    0,
  )
  return Buffer.byteLength(lines) + 1 + Math.max(0, ID_LONGEST - id.length) - words
}

/**
 * The head line with the most of its not-sure counts, in order, that keep the
 * case within `CASE_BYTES`: `line(n)` is the line with the first `n` of them.
 * Most lines hold all of them; a long title beside notes and misses may not.
 */
function fitted(
  id: string,
  counts: number,
  line: (n: number) => string,
  missed: ReadonlyArray<[block: string, words: string]>,
): string {
  for (let n = counts; n > 0; n -= 1) {
    const head = line(n)
    if (caseBytes(id, head, missed) <= CASE_BYTES) return head
  }
  return line(0)
}

/**
 * One run, brief: each case it took or has a grading of, then a line for each
 * rule or check an attempt missed. A case not read whole says why in place of
 * "nothing missed", and one with rules or checks left not sure says how many.
 * One run has no other to have done better than.
 */
export function printBrief(skill: string, side: Side, scoring: Context['scoring']): void {
  const briefs = briefsOf(skill, side, scoring)
  const { order, head } = namesOf(skill, [side.view])
  for (const id of casesInOrder(order, briefs.keys())) {
    const brief = briefs.get(id) ?? NONE
    const missed = brief.missed.map((w): [string, string] => [
      missedLines(`missed${howOften(brief, w)}`, w),
      w,
    ])
    const count = brief.unsure ? 1 : 0
    console.log(fitted(id, count, (n) => headLine(head(id), caseWords(brief, n > 0)), missed))
    for (const [block] of missed) console.log(block)
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
 * whole, in A or in B, or else how many rules and checks each left not sure,
 * then each rule or check an attempt missed, with which run missed it.
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
  const { order, head } = namesOf(skill, [b.view, a.view])
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
    // Each run's own count: what became of a run's attempt not read whole is said alone for that run.
    const unsure = (
      [
        ['A', one],
        ['B', two],
      ] as const
    ).flatMap(([run, brief]) => {
      const count = notesOf(brief).length && brief.attempts ? null : unsureCount(brief)
      return count ? [`${run} ${count}`] : []
    })
    const words = [...new Set([...one.missed, ...two.missed])]
    const said = [
      read ? BETTER[read.move] : why ? APART[why] : 'neither answered it',
      ...notes,
    ].join('; ')
    const nothing = !words.length && !notes.length
    const missed = words.map((w): [string, string] => [missedLines(whoMissed(one, two, w), w), w])
    // What is counted is said once for both runs: `rules and checks not sure: A 1 of 11, B 1 of 16`.
    // A count left out for room leaves "nothing missed" unsaid.
    const line = (n: number) =>
      headLine(
        head(id),
        [
          `${said}${nothing && n === unsure.length ? ', nothing missed' : ''}`,
          ...(n ? [`${NOT_SURE}: ${unsure.slice(0, n).join(', ')}`] : []),
        ].join('; '),
      )
    console.log(fitted(id, unsure.length, line, missed))
    for (const [block] of missed) console.log(block)
  }
}

/** Which run missed a rule or check, and how often where it had more than one attempt: `A missed in 1 of 2, B missed`. */
function whoMissed(one: CaseBrief, two: CaseBrief, w: string): string {
  const [inA, inB] = [one.missed.includes(w), two.missed.includes(w)]
  const [oftenA, oftenB] = [howOften(one, w), howOften(two, w)]
  return inA && inB
    ? oftenA === oftenB
      ? `A and B missed${oftenA}`
      : `A missed${oftenA}, B missed${oftenB}`
    : inA
      ? `A missed${oftenA}`
      : `B missed${oftenB}`
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
          ? `failed, it ${s.failed}${s.error ? ` (${oneLine(s.error)})` : ''}`
          : s.stopped
            ? 'stopped'
            : s.ok
              ? `done in ${s.seconds} s`
              : `no output written in ${s.seconds} s`
      }`,
    )
}
