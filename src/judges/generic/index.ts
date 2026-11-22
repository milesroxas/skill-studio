/**
 * The pack every skill is graded by: the rules the skill states and the checks
 * its cases state, and nothing a skill did not ask for. It judges the work
 * whatever kind of file it is: the text of a page, a script or a piece of
 * writing, the picture of a page or of a picture, and what the agent told the
 * user beside it, since a rule may be about any of the three.
 *
 * Questions are literal, the criteria carry the boundary cases, and all
 * independent questions over the same state go in one request. A rule is
 * asked under its heading with the skill beside it, and each heading is asked
 * once whether its rules are for this work at all. Counting happens in
 * score.ts.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { answerExact, type ExactSubject } from '@domain/exact.ts'
import { fitForJev } from '@domain/image.ts'
import { aboutLayout, layoutText } from '@domain/layout.ts'
import type { Unmarked } from '@domain/pack.ts'
import { NOTES_FILE } from '@domain/prompt.ts'
import { headingOf, plain, type Rule } from '@domain/rules.ts'
import type { Grader } from '@domain/schemas.ts'
import type { SortedReading } from '@domain/sorting.ts'
import type { Span } from '@domain/span.ts'
import { type Image, noul, type Question, withAssets } from '@typesafe-ai/sdk'
import { type Readable, readForJev } from '../images.ts'
import { isTooLarge, type JevState } from '../jev.ts'
import { pictureOf, renderOf } from '../shared/picture.ts'
import {
  asksJev,
  characters,
  genericAsks,
  noulOf,
  requestCut,
  requestState,
} from '../shared/questions.ts'
import {
  clip,
  firstOf,
  OUTPUT_PART,
  type PartAnswers,
  type Parted,
  type StatementAnswer,
  type UnmarkedCheck,
} from '../shared/score.ts'
import type {
  FileStart,
  FittedPicture,
  JudgeContext,
  JudgeInput,
  JudgePack,
  SourcePage,
} from '../types.ts'
import { type GenericRaw, genericScoring, type RuleAnswer, type UnmarkedRule } from './score.ts'

/**
 * How much of the work one request holds. Jev reads so much at once: 32k
 * tokens for the state and one question, about 80,000 characters of a page's
 * source and more of prose. A request past that is refused whole, so a reading
 * that was refused is taken again with less, and the output is flagged with
 * every part Jev read only the start of (`Work.cut`).
 */
interface Room {
  /** Characters of the file judged: its start says what it is. */
  output: number
  /** Characters of what the agent told the user. */
  notes: number
  /** Characters of SKILL.md beside its rules: the words a rule uses are said there. */
  skill: number
  /** Whether the other files the agent wrote are read. */
  others: boolean
  /** Characters of the text files the case's request came with, in all. */
  files: number
  /** Characters of the page's measured layout: its largest elements first. */
  layout: number
}

const ROOMS: readonly Room[] = [
  { output: 40_000, notes: 6000, skill: 12_000, others: true, files: 24_000, layout: 14_000 },
  { output: 20_000, notes: 3000, skill: 6000, others: false, files: 8000, layout: 8000 },
  { output: 8000, notes: 1500, skill: 0, others: false, files: 0, layout: 0 },
]

/**
 * The most parts of one output asked. An output longer than a room's `output`
 * is asked in parts, each a request of its own with every rule and check, so
 * a part costs what an output that fits costs. Past this many, the rest is not
 * read: its facts stand as not read, and the output is flagged with how much
 * Jev read.
 */
const MOST_PARTS = 4

/**
 * How far two parts of an output overlap, as a share of a part: a thing up to
 * this long that lies across the line between two parts is whole in one of
 * them. 5,000 characters of a 40,000-character part.
 */
const OVERLAP = 1 / 8

/** One part of an output asked in parts: its place among them, and where it lies in the text. */
export interface OutputPart {
  /** From 0. */
  index: number
  /** How many parts the whole output is in, read or not. */
  of: number
  /** The first character of the part, and the one past its last. */
  from: number
  to: number
}

/**
 * The parts `length` characters are asked in when a part holds `size`: one,
 * the whole, when it fits, else parts of `size` that overlap by `OVERLAP` of
 * it, the last one ending where the text ends.
 */
export function partsOf(length: number, size: number): OutputPart[] {
  if (length <= size) return [{ index: 0, of: 1, from: 0, to: length }]
  const step = size - Math.floor(size * OVERLAP)
  const spans: Array<[number, number]> = []
  for (let from = 0; ; from += step) {
    const to = Math.min(from + size, length)
    spans.push([from, to])
    if (to === length) break
  }
  return spans.map(([from, to], index) => ({ index, of: spans.length, from, to }))
}

/** The longest side of a picture Jev reads: a page drawn in a larger window is scaled down to it. */
const LONGEST_SIDE = 1568

/** The work as Jev is given it: which of its parts there are, and the state that holds them. */
interface Work {
  state: JevState
  /** The file's text is in `output`. */
  text: boolean
  /** The part of the file `output` holds, when the file is asked in parts; null when it is asked whole. */
  part: OutputPart | null
  /** The work as a picture is in `picture`. */
  picture: boolean
  /** What the agent told the user is in `notes`. */
  notes: boolean
  /** The window `output` was drawn in to make `picture`, as a page is; null for a picture made beside it. */
  drawn: { width: number; height: number } | null
  /** The size of the picture the agent made, when `picture` is a copy drawn smaller or larger to fit; else null. */
  fitted: [number, number] | null
  /** The other files it wrote are in `other_files`, by name. */
  others: boolean
  /** The text files the request came with are in `request_files`, by name. */
  files: boolean
  /** The SKILL.md the rules are quoted from is in `skill`. */
  skill: boolean
  /** The headings its rules stand under are in `headings`. */
  headings: string[]
  /** The elements of the page as the window measured them are in `layout`. */
  layout: boolean
  /** The page `picture` was made from, when `layout` is that page's and not `output`'s own; else null. */
  source: SourcePage | null
  /** What Jev reads only the start of, or none of, each as the flag says it. */
  cut: string[]
}

/** Why the output's picture is not shown to Jev, as a flag; null when it was read or there is none. */
const unreadOf = (input: JudgeInput): string | null => {
  const problem = pictureOf(input)?.problem
  return problem ? `picture not judged: ${problem}` : null
}

/** The headings the rules stand under, each once, in the order of the file. */
const headingsOf = (rules: readonly Rule[]): string[] => [
  ...new Set(rules.flatMap((rule) => headingOf(rule) ?? [])),
]

/**
 * The work of one output as `room` holds it, or null when it has neither text
 * nor a picture Jev can read. For an output asked in parts, `part` is the one
 * this work holds, and `read` how many parts are asked: the text is that part's,
 * and everything else is as it is for the whole.
 */
function workOf(input: JudgeInput, room: Room, part?: OutputPart, read = 1): Work | null {
  const picture = pictureOf(input)
  const whole = input.text.trim() ? input.text : ''
  const text = part ? whole.slice(part.from, part.to) : whole.slice(0, room.output)
  // What of the output Jev reads in all: to the end of the last part asked.
  const reach = part ? partsOf(whole.length, room.output)[read - 1].to : text.length
  const told = input.notes?.trim() ?? ''
  const notes = told.slice(0, room.notes)
  if (!text && !picture?.image) return null
  const state: JevState = { ...requestState(input) }
  if (text) state.output = text
  if (picture?.image) state.picture = picture.image
  if (notes) state.notes = notes
  // One file is the work itself; with more, a rule may be about what was made beside it.
  const others = room.others ? input.others.filter((o) => o.text) : []
  if (others.length) state.other_files = Object.fromEntries(others.map((o) => [o.file, o.text]))
  // What the agent was handed to work from: a rule may hold the work to a file of it.
  const given = shareRoom(input.requestFiles ?? [], room.files)
  const files = given.filter((f) => f.text)
  if (files.length && has(state, 'request'))
    state.request_files = Object.fromEntries(files.map((f) => [f.file, f.text]))
  // A rule is read where it stands: the skill says what its words mean and which work each heading is for.
  const written = input.rules.length ? (input.skill?.trim() ?? '') : ''
  const skill = written.slice(0, room.skill)
  const headings = skill ? headingsOf(input.rules) : []
  if (skill) state.skill = skill
  if (headings.length) state.headings = headings
  // The page is in the picture only when the picture judged is the one the app drew.
  const page = input.primary?.kind === 'html' ? renderOf(input, 'desktop') : null
  const window = page?.image && page.image === picture?.image
  // What the window measured goes with the picture it drew: a length is read there, not off the picture.
  // It is the largest part of a request, so it is sent only where a rule or a check is about what it holds.
  const measured =
    window && room.layout && asksOfLayout(input)
      ? (input.renders.find((r) => r.size.id === 'desktop')?.layout ?? null)
      : null
  // A picture that is the work has no elements of its own: the page that draws it was measured for it.
  const source =
    !window && picture?.image && input.primary?.kind === 'image' && input.source?.layout
      ? input.source
      : null
  const borrowed = source?.layout && room.layout && asksOfLayout(input) ? source.layout : null
  if (measured) state.layout = layoutText(measured, room.layout)
  else if (borrowed) state.layout = layoutText(borrowed, room.layout)
  const work: Work = {
    state,
    text: Boolean(text),
    part: part && part.of > 1 ? part : null,
    picture: Boolean(picture?.image),
    notes: Boolean(notes),
    drawn: window ? windowOf(input) : null,
    fitted:
      !window && input.fitted && input.fitted.read.image === picture?.image && resized(input.fitted)
        ? input.fitted.pixels
        : null,
    others: others.length > 0,
    files: has(state, 'request_files'),
    skill: Boolean(skill),
    headings,
    layout: measured !== null || borrowed !== null,
    source: borrowed ? source : null,
    cut: [
      requestCut(input),
      whole.length > reach ? firstOf(reach, OUTPUT_PART) : null,
      told.length > notes.length ? firstOf(notes.length, NOTES_FILE) : null,
      written.length > skill.length
        ? skill
          ? firstOf(skill.length, 'SKILL.md')
          : 'Jev read none of SKILL.md'
        : null,
      ...filesCut(room.others ? input.others : input.others.map((o) => ({ ...o, text: '' }))),
      ...(has(state, 'request') ? filesCut(given, "the case's ") : []),
    ].filter((line): line is string => line !== null),
  }
  // What each field is, once, for every question asked of this state.
  const fields = fieldsOf(work)
  if (Object.keys(fields).length) state.fields = fields
  return work
}

/** Whether the copy drawn of a picture is another size than the picture: one drawn only to be a plain, upright PNG is not. */
const resized = ({ pixels: [width, height] }: FittedPicture): boolean => {
  const fit = fitForJev(width, height)
  return fit.width !== width || fit.height !== height
}

/** What is said of the files Jev read only the start of, and of those it read none of. */
function filesCut(files: readonly FileStart[], whose = ''): string[] {
  const started = files.filter((f) => f.cut && f.text).map((f) => f.file)
  const unread = files.filter((f) => !f.text).map((f) => f.file)
  return [
    started.length ? `Jev read only the start of ${whose}${listed(started)}` : null,
    unread.length ? `Jev read none of ${whose}${listed(unread)}` : null,
  ].filter((line): line is string => line !== null)
}

/**
 * `files` as `room` characters of them hold, shared out evenly: a file shorter
 * than its share is read whole and leaves the rest to the others, so every file
 * has its start read, the one a rule is about among them, whatever its place in
 * the list. One cut short is marked so; with no room at all, none has text.
 */
function shareRoom(files: readonly FileStart[], room: number): FileStart[] {
  const shares = new Map<FileStart, number>()
  let left = room
  const shortest = [...files].sort((a, b) => a.text.length - b.text.length)
  shortest.forEach((f, i) => {
    const share = Math.min(f.text.length, Math.floor(left / (shortest.length - i)))
    shares.set(f, share)
    left -= share
  })
  return files.map((f) => {
    const text = f.text.slice(0, shares.get(f) ?? 0)
    return text.length < f.text.length ? { ...f, text, cut: true } : f
  })
}

/** Whether a rule or a check of this output is about a size, a place or a colour: what a layout holds. */
const asksOfLayout = (input: JudgeInput): boolean =>
  input.rules.some((rule) => aboutLayout(rule.text)) ||
  (input.case?.graders ?? []).some((grader) => aboutLayout(grader.statement))

/** The window the page was drawn in. */
const windowOf = (input: JudgeInput): { width: number; height: number } | null => {
  const size = input.renders.find((r) => r.size.id === 'desktop')?.size
  return size ? { width: size.width, height: size.height } : null
}

const has = (state: JevState, key: string): boolean =>
  typeof state === 'object' && state !== null && key in state

/**
 * What a picture of a page is, said so nothing is read off it that it does not
 * hold: the window it was drawn in, that a larger window is drawn smaller, so
 * a pixel of the picture is not a pixel of the page, and that a page may go on
 * below the window.
 */
function drawnLine(window: { width: number; height: number }): string {
  const fit = Math.min(1, LONGEST_SIDE / window.width, LONGEST_SIDE / window.height)
  const scaled =
    fit < 1
      ? `, scaled to ${Math.round(window.width * fit)} by ${Math.round(window.height * fit)} px, so a length measured on \`picture\` is not its length in \`output\``
      : ''
  return `\`picture\` shows \`output\` as it looks when it is opened in a window ${window.width} px wide and ${window.height} px tall${scaled}. Anything of the page below that window is not in \`picture\`.`
}

/**
 * What `output` is when the file is asked in parts: which part of how many,
 * where it lies in the file, and that each part is judged on what it holds,
 * so a thing that lies in another part is not marked missing for that alone.
 * The first part holds the file's start and the last its end, so a thing that
 * belongs at one end is judged in the part that holds that end.
 */
function partLine(part: OutputPart): string {
  const end =
    part.index === 0
      ? ', the start of the file'
      : part.index === part.of - 1
        ? ', the end of the file'
        : ''
  return `\`output\` is part ${part.index + 1} of ${part.of} of the file: its characters ${characters(part.from + 1)} to ${characters(part.to)}${end}. The file is too long to read at once, so each part is asked apart, and two parts next to each other share some text. Judge what this part shows. A thing that is not in this part may be in another, so it is not missing for that alone.`
}

/**
 * What `layout` is for a picture that is the work: the measures of the page
 * that draws it. The page's name is quoted and not in backticks, which
 * TypeSafe reads as a path into the state.
 */
function sourceLine(source: SourcePage): string {
  const [width, height] = source.window
  const larger =
    source.times > 1
      ? ` \`picture\` is ${source.times} times that size, so a length in \`picture\` is ${source.times} times its length in \`layout\`.`
      : ''
  return `\`picture\` is what the page "${plain(source.file)}" draws in a window ${width} px wide and ${height} px tall, and \`layout\` lists that page's elements as measured there: the place and the size of each in px, from the top left of the page, and where it sits inside the elements that hold it.${larger} A size, a distance or a position is read from \`layout\`, where it was measured, and not judged by eye on \`picture\`.`
}

/**
 * What each field of the state is, by its name: said once, in the state, for
 * every question to read. TypeSafe bills the state once a request and each
 * question's own words, so a question that said it all again would cost a
 * request as much again in room as its output.
 */
function fieldsOf(work: Work): Record<string, string> {
  const made = work.text ? '`output`' : '`picture`'
  const picture = [
    work.text && work.picture
      ? work.drawn
        ? drawnLine(work.drawn)
        : '`picture` is a picture made with `output`.'
      : null,
    work.fitted
      ? `\`picture\` is shown at another size than the file it is, which is ${work.fitted[0]} by ${work.fitted[1]} px, so a length measured on \`picture\` is not its length in the file.`
      : null,
  ].filter((line): line is string => line !== null)
  const fields: Record<string, string | null> = {
    output: work.part ? partLine(work.part) : null,
    request: has(work.state, 'request')
      ? `${made} was produced to answer \`request\`${
          has(work.state, 'request_images')
            ? ', which came with the pictures in `request_images`'
            : ''
        }.`
      : null,
    request_files: work.files
      ? `\`request_files\` holds the files that came with \`request\`, each by its name: what ${made} was made from, and no part of it.`
      : null,
    picture: picture.length ? picture.join(' ') : null,
    layout: work.layout
      ? work.source
        ? sourceLine(work.source)
        : `\`layout\` lists the elements of ${made} as that window measured them: the place and the size of each in px, from the top left of the page, and where it sits inside the elements that hold it. A size, a distance or a position is read from \`layout\`, where it was measured, and not judged by eye on \`picture\`.`
      : null,
    other_files: work.others
      ? `\`other_files\` holds the other files made with ${made}, each by its name.`
      : null,
    notes: work.notes
      ? `\`notes\` is what its maker told the user about ${made}: it is not part of ${made}.`
      : null,
    skill: work.skill
      ? `\`skill\` holds the instructions ${made} is held to: it is not part of ${made}.`
      : null,
  }
  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string] => entry[1] !== null),
  )
}

/** The fields a rule or a check is judged on, as the question names them. */
const subjectOf = (work: Work): string =>
  listed(
    [
      work.text ? '`output`' : null,
      work.picture ? '`picture`' : null,
      work.others ? '`other_files`' : null,
    ].filter((field): field is string => field !== null),
  )

/** "a", "a and b", "a, b and c". */
const listed = (items: string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '')

/** What says which kind of work this is: the request, or the output itself where there is none. */
const saidBy = (work: Work): string =>
  has(work.state, 'request') ? '`request` asks for' : `${work.text ? '`output`' : '`picture`'} is`

/**
 * What the criteria add when there are notes. A rule about the piece itself,
 * such as its length or its look, must never be failed for how the notes
 * read; a rule that asks for something to be said is met wherever it is said.
 * It is the boundary of a yes and a no, so it stays with each criterion.
 */
const notesClause = (work: Work): string =>
  work.notes
    ? ' Something the agent must say, state, name, list, ask or report counts when `notes` says it. Nothing else is judged on `notes`.'
    : ''

/**
 * A rule or a check as it is quoted in a question: Markdown's marks taken
 * out. TypeSafe reads a backticked word in a question as a path into the
 * state, and a word a writer put in backticks names no such path.
 */
const quoted = (words: string): string => `"${plain(words)}"`

/**
 * One rule, asked where it stands: under its heading, with the skill it is
 * quoted from in the state. A rule under a heading for another kind of work
 * reads, on its own, like a rule for all of it, and is marked broken on work
 * it was never written for.
 */
const ruleQuestion = (rule: Rule, work: Work) => {
  const subject = subjectOf(work)
  const does = subject.includes(' and ') ? 'Do' : 'Does'
  const heading = work.skill ? headingOf(rule) : null
  const asked = heading
    ? `\`skill\` has this rule under its heading "${plain(heading)}": ${quoted(rule.text)} ${does} ${subject} follow the rule?`
    : `${does} ${subject} follow this rule: ${quoted(rule.text)}`
  const elsewhere = heading ? 'its heading or its own words are' : 'its own words are'
  return noul(asked, {
    true: `What the rule asks is done everywhere it applies in ${subject}, or the rule does not come up here: ${elsewhere} for another kind of work than ${saidBy(work)}, or for a situation that is not this one.${notesClause(work)}`,
    false: `The rule is for work of this kind, and something it forbids is done in ${subject} or something it requires is left out.${notesClause(work)}`,
  })
}

/**
 * What a heading is judged on. With a request, that is the request's words and
 * the skill alone: which rules are for this work is settled by what was asked
 * for, and an output in view pulls the answer to the kind of work that was
 * made, so a screen asked for and a detail made would have the rules for a
 * screen set aside. The request's pictures are left out too: its words say
 * which kind of work it asks for, and a picture costs more than the rest of
 * this request together. With no request there is only the work to go by.
 */
const headingState = (work: Work): JevState => {
  const { state } = work
  if (!has(state, 'request')) return state
  const fields = state as Record<string, unknown>
  return Object.fromEntries([
    ...['request', 'skill', 'headings'].flatMap((key) =>
      key in fields ? [[key, fields[key]]] : [],
    ),
    ...(work.skill
      ? [['fields', { skill: '`skill` holds the instructions an answer to `request` is held to.' }]]
      : []),
  ]) as JevState
}

/**
 * Whether one rule comes up for what the request asks, asked of the request
 * and the skill alone, as a heading is. A rule's own words may set it aside
 * ("When the request names a table, ..."), and a rule that does not come up is
 * no rule followed: counted as met, it would hold every output of a case that
 * names no table to a rule it could not break. A rule about what an answer may
 * or may not do, such as one that forbids a headline or sets how a price is
 * written, comes up whatever the request.
 */
const upQuestion = (rule: Rule, work: Work) => {
  const heading = work.skill ? headingOf(rule) : null
  const where = heading
    ? `\`skill\` has this rule under its heading "${plain(heading)}": `
    : 'An answer to `request` is held to this rule: '
  return noul(
    `${where}${quoted(rule.text)} Does the rule come up for what \`request\` asks, whatever an answer to it turns out to be?`,
    {
      true: 'The rule is about something an answer to `request` holds, does or could do: what it must do, or what it must not do. A rule that forbids a thing, or says how a thing is done when it is done, comes up wherever an answer could do that thing.',
      false:
        'The rule is only for a situation `request` does not set up: it names a kind of request, reader, input or thing asked for that `request` does not have.',
    },
  )
}

/**
 * Whether the rules under one heading are for this work at all. One narrow
 * question a heading, which Jev answers far more surely than it answers the
 * same thing folded into each rule: a skill that has "Rules for a screen" and
 * "Rules for a detail" asks only one of the two of any output.
 */
const headingQuestion = (heading: string, work: Work) =>
  noul(
    `\`skill\` groups its rules under the headings in \`headings\`. Are the rules under the heading "${plain(heading)}" for the kind of work ${saidBy(work)}?`,
    {
      true: `The heading names no one kind of work, so its rules are for all of it, or it names the kind of work ${saidBy(work)}.`,
      false: `The heading names a kind of work, a mode or a situation other than the one ${saidBy(work)}.`,
    },
  )

function statementQuestion(statement: string, work: Work, reference: Image | null) {
  const subject = subjectOf(work)
  const asked = `Is this statement true of ${subject}: ${quoted(statement)}`
  return noul(
    reference
      ? withAssets`${asked} The statement came with this picture, which it holds ${subject} against and which is no part of ${subject}: ${reference}`
      : asked,
    {
      true: `The statement holds for ${subject} as written.${notesClause(work)}`,
      false: `The statement is false of ${subject}, or what it needs to be true is not in ${subject}.${notesClause(work)}`,
    },
  )
}

/** A check's reference picture as Jev reads it, or why it cannot; null for a check with none. */
const referenceOf = (grader: Grader, ctx: JudgeContext): Readable | null =>
  grader.image ? readForJev(join(ctx.skillDir, grader.image)) : null

/** The names the questions go under: rules, headings and checks. */
const RULE = 'rule:'
const HEADING = 'heading:'
const UP = 'up:'
const CHECK = 'check:'

/**
 * The case's checks that are asked, and why each of the rest is not. A check
 * about a picture Jev cannot read is not asked: without the picture its answer
 * would be a guess, counted as a miss. It is left out of the rubric and said.
 */
function askedChecks(input: JudgeInput, ctx: JudgeContext) {
  const unasked: string[] = []
  const asked = (input.case?.graders ?? []).flatMap((grader) => {
    // A check nobody can mark as written is not asked: its answer would count for nothing.
    if (unmarkedOf(input.readings?.checks[grader.id]) !== null) return []
    const reference = referenceOf(grader, ctx)
    if (!reference?.problem) return [{ grader, picture: reference?.image ?? null }]
    unasked.push(
      `grader ${grader.id} not judged, its picture is not shown to Jev (${reference.problem}): ${clip(grader.statement)}`,
    )
    return []
  })
  for (const line of unasked) ctx.log(line)
  return { asked, unasked }
}

/** A reading's span, for a fact read as Jev's to answer: how its parts join. */
const spanOf = (reading: SortedReading | undefined): Span | undefined =>
  reading?.reading === 'judged' && reading.span !== null ? reading.span : undefined

/** Why a fact cannot be marked, from its reading; null for one that can. */
function unmarkedOf(
  reading: SortedReading | undefined,
  others?: (ref: string) => string | null,
): Unmarked | null {
  if (reading?.reading !== 'unmarkable') return null
  return {
    why: reading.why,
    with: reading.with === null ? null : (others?.(reading.with) ?? null),
    fix: reading.fix,
  }
}

/**
 * The output as code reads it, whole and as written (`JudgeInput.whole`), or
 * null when there is nothing whole to read. A page's layout is the one the
 * window measured, when it drew the page.
 */
function exactSubjectOf(input: JudgeInput): ExactSubject | null {
  const { whole, primary } = input
  if (!whole || !primary) return null
  return {
    output: whole.output,
    kind: primary.kind,
    others: whole.others,
    request: whole.request,
    files: whole.files,
    layout:
      primary.kind === 'html'
        ? (input.renders.find((r) => r.size.id === 'desktop')?.layout ?? null)
        : null,
  }
}

/** Code's answer on a fact read by code, kept beside Jev's; nothing for a fact read otherwise. */
function codeOf(
  reading: SortedReading | undefined,
  subject: ExactSubject | null,
): Pick<PartAnswers, 'code'> {
  if (reading?.reading !== 'exact' || !subject) return {}
  return { code: { ...answerExact(reading, subject), tests: reading.tests } }
}

/** A case's check by the name a reading gives it: `c2` is its second. */
function checkByRef(graders: readonly Grader[], ref: string): Grader | null {
  const at = /^c(\d+)$/.exec(ref)
  return at ? (graders[Number(at[1]) - 1] ?? null) : null
}

/**
 * Ask `questions` of `state` in one request, or in as many as it takes.
 * TypeSafe refuses a request for its size when the state with one question is
 * more than Jev reads at once, or when the state with all the questions is.
 * Fewer questions help only the second, and less of the work only the first,
 * so a refused request is asked again with its first question alone: refused
 * too, it is the state, and the error goes up for the work to be cut; answered,
 * the rest are asked in two halves, each the same way. No answer is asked twice.
 */
async function askAll(
  state: JevState,
  questions: Record<string, Question>,
  ctx: JudgeContext,
): Promise<Record<string, unknown>> {
  const entries = Object.entries(questions)
  if (!entries.length) return {}
  try {
    return await ctx.jev.ask(state, questions, ctx.signal)
  } catch (error) {
    if (!isTooLarge(error) || entries.length < 2) throw error
  }
  const [first, ...rest] = entries
  const one = await ctx.jev.ask(state, Object.fromEntries([first]), ctx.signal)
  ctx.log(`${entries.length} questions are more than one request holds: asking them in parts`)
  const half = Math.ceil(rest.length / 2)
  const parts = [rest.slice(0, half), rest.slice(half)].filter((part) => part.length > 0)
  const answers = await Promise.all(
    parts.map((part) => askAll(state, Object.fromEntries(part), ctx)),
  )
  return Object.assign({}, one, ...answers)
}

/**
 * `questions` of `state` as `askAll` asks them, asked once a grading: every
 * output of a case is held to the one answer, and that answer is paid for once.
 * A request that failed is forgotten, so the next output asks again.
 */
function askOnce(
  state: JevState,
  questions: Record<string, Question>,
  ctx: JudgeContext,
): Promise<Record<string, unknown>> {
  if (!ctx.once) return askAll(state, questions, ctx)
  const key = createHash('sha256')
    .update(JSON.stringify([ctx.jev.model, state, questions]))
    .digest('hex')
  const kept = ctx.once.get(key)
  if (kept) return kept
  const asking = askAll(state, questions, ctx)
  ctx.once.set(key, asking)
  asking.catch(() => ctx.once?.delete(key))
  return asking
}

/**
 * Every rule of the skill and every check of the case, in one request: they
 * are independent questions over one state, so the output and its pictures are
 * sent, and paid for, once. A skill with more questions than one request holds
 * has them asked in several (`askAll`). The headings the rules stand under are asked of
 * the request alone, in a request of their own, and with the rest where there
 * is no request.
 *
 * An output too long to read at once comes as one work a part (`works`, with
 * `parted` saying how many parts there are): every rule and check is asked of
 * each part, and each answer keeps every part's probability for scoring to join.
 * What rests on the request alone, the headings and whether each rule comes
 * up, is asked once whatever the parts; with no request, the headings are asked
 * of the first part, which holds the start that says what the work is.
 */
async function ask(
  input: JudgeInput,
  works: readonly Work[],
  parted: Parted | null,
  ctx: JudgeContext,
): Promise<Pick<GenericRaw, 'adherence' | 'rubric'>> {
  const [first] = works
  const graders = input.case?.graders ?? []
  const readings = input.readings
  // A rule nobody can mark as written is not asked: its answer would count for nothing.
  const rules = input.rules.filter((r) => unmarkedOf(readings?.rules[r.id]) === null)
  const { asked, unasked } = askedChecks(input, ctx)
  const headings = Object.fromEntries(
    first.headings.map((heading, i) => [`${HEADING}${i}`, headingQuestion(heading, first)]),
  )
  // With a request, the headings are asked of it alone, in a request of their own,
  // with whether each rule comes up for it. With none, there is nothing a rule comes up for.
  const request = has(first.state, 'request')
  const ups = request
    ? Object.fromEntries(rules.map((r) => [`${UP}${r.id}`, upQuestion(r, first)]))
    : {}
  const apart = request && (first.headings.length > 0 || rules.length > 0)
  const questionsOf = (work: Work, i: number) => ({
    ...Object.fromEntries(rules.map((r) => [`${RULE}${r.id}`, ruleQuestion(r, work)])),
    ...(apart || i > 0 ? {} : headings),
    ...Object.fromEntries(
      asked.map(({ grader, picture }) => [
        `${CHECK}${grader.id}`,
        statementQuestion(grader.statement, work, picture),
      ]),
    ),
  })
  const replies = await Promise.all([
    ...works.map((work, i) => askAll(work.state, questionsOf(work, i), ctx)),
    // The same for every output of the case: asked once a grading.
    ...(apart ? [askOnce(headingState(first), { ...headings, ...ups }, ctx)] : []),
  ])
  const each = replies.slice(0, works.length)
  const once = replies[works.length] ?? {}
  const answers: Record<string, unknown> = { ...each[0], ...once }
  /** A fact's answers: the first part's, and every part's when the output is in parts. */
  const answersOf = (key: string, span: Span | undefined) => {
    const all = each.map((part) => noulOf(part, key))
    return {
      noul: all[0],
      ...(parted ? { parts: all } : {}),
      ...(span ? { span } : {}),
    }
  }
  const applies = new Map(
    first.headings.map((heading, i) => [heading, noulOf(answers, `${HEADING}${i}`)]),
  )
  const exact = exactSubjectOf(input)
  // A reading names the other of a conflict as the sort was shown it: a rule as `r4`, a check of the case as `c2`.
  const named = (ref: string) =>
    input.rules.find((r) => r.id === ref)?.text ?? checkByRef(graders, ref)?.statement ?? null
  const adherence = input.rules.length
    ? {
        rules: input.rules.map((r): RuleAnswer | UnmarkedRule => {
          const reading = readings?.rules[r.id]
          const unmarked = unmarkedOf(reading, named)
          if (unmarked) return { id: r.id, text: r.text, section: r.section, unmarkable: unmarked }
          const heading = headingOf(r)
          const under = heading === null ? undefined : applies.get(heading)
          return {
            id: r.id,
            text: r.text,
            section: r.section,
            ...answersOf(`${RULE}${r.id}`, input.spans?.rules?.[r.id] ?? spanOf(reading)),
            ...codeOf(reading, exact),
            ...(under === undefined ? {} : { applies: under }),
            ...(request ? { comesUp: noulOf(answers, `${UP}${r.id}`) } : {}),
          }
        }),
      }
    : null
  const askedIds = new Set(asked.map(({ grader }) => grader.id))
  const rubric = graders.length
    ? {
        statements: graders.flatMap((grader): Array<StatementAnswer | UnmarkedCheck> => {
          const reading = readings?.checks[grader.id]
          const unmarked = unmarkedOf(reading, named)
          if (unmarked)
            return [
              {
                id: grader.id,
                text: grader.statement,
                weight: grader.weight,
                unmarkable: unmarked,
              },
            ]
          if (!askedIds.has(grader.id)) return []
          return [
            {
              id: grader.id,
              text: grader.statement,
              weight: grader.weight,
              ...answersOf(
                `${CHECK}${grader.id}`,
                input.spans?.checks?.[grader.id] ?? spanOf(reading),
              ),
              ...codeOf(reading, exact),
              units: null,
              best: null,
            },
          ]
        }),
        ...(unasked.length ? { unasked } : {}),
      }
    : null
  return { adherence, rubric }
}

/**
 * The works one output is asked as, in `room`: the whole, or, for an output
 * longer than the room holds, one work a part, the first `MOST_PARTS` of them.
 * Null when there is nothing Jev can read.
 */
function worksOf(input: JudgeInput, room: Room): { works: Work[]; parted: Parted | null } | null {
  const whole = input.text.trim() ? input.text.length : 0
  const parts = partsOf(whole, room.output)
  if (parts.length === 1) {
    const work = workOf(input, room)
    return work ? { works: [work], parted: null } : null
  }
  const read = Math.min(parts.length, MOST_PARTS)
  const works = parts
    .slice(0, read)
    .map((part) => workOf(input, room, part, read))
    .filter((work): work is Work => work !== null)
  return works.length === read ? { works, parted: { read, of: parts.length } } : null
}

export const genericPack: JudgePack<GenericRaw> = {
  ...genericScoring,
  version: 10,
  label: 'Generic: the skill’s rules and the case’s checks',
  renders: true,
  asks: genericAsks,
  async judge(input, ctx) {
    if (!asksJev(input, ctx)) return null
    // A picture Jev would refuse is said, so rules nobody marked are never read as followed.
    const unread = unreadOf(input)
    const nothing = unread ? { adherence: null, rubric: null, unread } : null
    for (const room of ROOMS) {
      const asking = worksOf(input, room)
      if (!asking) return nothing
      const { works, parted } = asking
      if (parted)
        ctx.log(
          parted.read < parted.of
            ? `the output is more than Jev reads at once: asking the first ${parted.read} of its ${parted.of} parts`
            : `the output is more than Jev reads at once: asking it in ${parted.of} parts`,
        )
      try {
        const { adherence, rubric } = await ask(input, works, parted, ctx)
        if (!adherence && !rubric) return nothing
        const [work] = works
        return {
          adherence,
          rubric,
          ...(unread ? { unread } : {}),
          ...(work.cut.length ? { cut: work.cut } : {}),
          ...(parted ? { parts: parted } : {}),
        }
      } catch (error) {
        // Refused for its size: the same request would be refused again, so the next one holds less.
        if (!isTooLarge(error) || room === ROOMS.at(-1)) throw error
        ctx.log('the output is more than Jev reads at once: asking again with less of it')
      }
    }
    return nothing
  },
  anchorsTemplate: [
    '---',
    'case: <case key>',
    'label: good | bad',
    'tests: adherence, rubric, total',
    'about: Why this anchor exists.',
    '---',
    '',
    '<the output>',
    '',
  ].join('\n'),
}
