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
import { join } from 'node:path'
import { headingOf, plain, type Rule } from '@domain/rules.ts'
import type { Grader } from '@domain/schemas.ts'
import { type Image, noul, withAssets } from '@typesafe-ai/sdk'
import { type Readable, readForJev } from '../images.ts'
import { isTooLarge, type JevState } from '../jev.ts'
import { pictureOf, renderOf } from '../shared/picture.ts'
import { asksJev, noulOf, requestState } from '../shared/questions.ts'
import { clip } from '../shared/score.ts'
import type { JudgeContext, JudgeInput, JudgePack } from '../types.ts'
import { type GenericRaw, genericScoring, type RuleAnswer } from './score.ts'

/**
 * How much of the work one request holds. Jev reads so much at once, and a
 * request past that is refused whole, so a reading that was refused is taken
 * again with less: `said` is what the output is flagged with when it was.
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
  said?: string
}

const ROOMS: readonly Room[] = [
  { output: 24_000, notes: 6000, skill: 12_000, others: true },
  {
    output: 12_000,
    notes: 3000,
    skill: 6000,
    others: false,
    said: 'judged on the first 12,000 characters of the output and none of the files beside it: the whole is more than Jev reads at once',
  },
  {
    output: 6000,
    notes: 1500,
    skill: 0,
    others: false,
    said: 'judged on the first 6,000 characters of the output and none of the files beside it: the whole is more than Jev reads at once',
  },
]

/** The most questions one request holds: each repeats what the state is, so many of them outgrow a request. */
const QUESTIONS_MAX = 40
/** The longest side of a picture Jev reads: a page drawn in a larger window is scaled down to it. */
const LONGEST_SIDE = 1568

/** The work as Jev is given it: which of its parts there are, and the state that holds them. */
interface Work {
  state: JevState
  /** The file's text is in `output`. */
  text: boolean
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
  /** The SKILL.md the rules are quoted from is in `skill`. */
  skill: boolean
  /** The headings its rules stand under are in `headings`. */
  headings: string[]
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

/** The work of one output as `room` holds it, or null when it has neither text nor a picture Jev can read. */
function workOf(input: JudgeInput, room: Room): Work | null {
  const read = pictureOf(input)
  const text = input.text.trim() ? input.text.slice(0, room.output) : ''
  const notes = input.notes?.trim().slice(0, room.notes) ?? ''
  if (!text && !read?.image) return null
  const state: JevState = { ...requestState(input) }
  if (text) state.output = text
  if (read?.image) state.picture = read.image
  if (notes) state.notes = notes
  // One file is the work itself; with more, a rule may be about what was made beside it.
  const others = room.others ? input.others : []
  if (others.length) state.other_files = Object.fromEntries(others.map((o) => [o.file, o.text]))
  // A rule is read where it stands: the skill says what its words mean and which work each heading is for.
  const skill = input.rules.length ? (input.skill?.trim().slice(0, room.skill) ?? '') : ''
  const headings = skill ? headingsOf(input.rules) : []
  if (skill) state.skill = skill
  if (headings.length) state.headings = headings
  // The page is in the picture only when the picture judged is the one the app drew.
  const page = input.primary?.kind === 'html' ? renderOf(input, 'desktop') : null
  const window = page?.image && page.image === read?.image
  return {
    state,
    text: Boolean(text),
    picture: Boolean(read?.image),
    notes: Boolean(notes),
    drawn: window ? windowOf(input) : null,
    fitted:
      !window && input.fitted && input.fitted.read.image === read?.image
        ? input.fitted.pixels
        : null,
    others: others.length > 0,
    skill: Boolean(skill),
    headings,
  }
}

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

/** What each field of the state is, said once before the question, so Jev knows what it is reading. */
function lead(work: Work): string {
  const made = work.text ? '`output`' : '`picture`'
  const lines = [
    has(work.state, 'request')
      ? `${made} was produced to answer \`request\`${
          has(work.state, 'request_images')
            ? ', which came with the pictures in `request_images`'
            : ''
        }.`
      : null,
    work.text && work.picture
      ? work.drawn
        ? drawnLine(work.drawn)
        : '`picture` is a picture made with `output`.'
      : null,
    work.fitted
      ? `\`picture\` is shown at another size than the file it is, which is ${work.fitted[0]} by ${work.fitted[1]} px, so a length measured on \`picture\` is not its length in the file.`
      : null,
    work.others
      ? `\`other_files\` holds the other files made with ${made}, each by its name.`
      : null,
    work.notes
      ? `\`notes\` is what its maker told the user about ${made}: it is not part of ${made}.`
      : null,
    work.skill
      ? `\`skill\` holds the instructions ${made} is held to: it is not part of ${made}.`
      : null,
  ].filter((line): line is string => line !== null)
  return lines.length ? `${lines.join(' ')} ` : ''
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
  return noul(`${lead(work)}${asked}`, {
    true: `What the rule asks is done everywhere it applies in ${subject}, or the rule does not come up here: ${elsewhere} for another kind of work than ${saidBy(work)}, or for a situation that is not this one.${notesClause(work)}`,
    false: `The rule is for work of this kind, and something it forbids is done in ${subject} or something it requires is left out.${notesClause(work)}`,
  })
}

/**
 * What a heading is judged on. With a request, that is the request and the
 * skill alone: which rules are for this work is settled by what was asked for,
 * and an output in view pulls the answer to the kind of work that was made, so
 * a screen asked for and a detail made would have the rules for a screen set
 * aside. With no request there is only the work to go by.
 */
const headingState = (work: Work): JevState => {
  const { state } = work
  if (!has(state, 'request')) return state
  const { request, request_images, skill, headings } = state as Record<string, unknown>
  return {
    request,
    ...(request_images === undefined ? {} : { request_images }),
    skill,
    headings,
  } as JevState
}

/** What each field a heading is judged on is. */
const headingLead = (work: Work): string =>
  has(work.state, 'request')
    ? `\`skill\` holds the instructions an answer to \`request\` is held to${
        has(work.state, 'request_images')
          ? ', and `request` came with the pictures in `request_images`'
          : ''
      }. `
    : lead(work)

/**
 * Whether the rules under one heading are for this work at all. One narrow
 * question a heading, which Jev answers far more surely than it answers the
 * same thing folded into each rule: a skill that has "Rules for a screen" and
 * "Rules for a detail" asks only one of the two of any output.
 */
const headingQuestion = (heading: string, work: Work) =>
  noul(
    `${headingLead(work)}\`skill\` groups its rules under the headings in \`headings\`. Are the rules under the heading "${plain(heading)}" for the kind of work ${saidBy(work)}?`,
    {
      true: `The heading names no one kind of work, so its rules are for all of it, or it names the kind of work ${saidBy(work)}.`,
      false: `The heading names a kind of work, a mode or a situation other than the one ${saidBy(work)}.`,
    },
  )

function statementQuestion(statement: string, work: Work, reference: Image | null) {
  const subject = subjectOf(work)
  const asked = `${lead(work)}Is this statement true of ${subject}: ${quoted(statement)}`
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
const CHECK = 'check:'

/**
 * The case's checks that are asked, and why each of the rest is not. A check
 * about a picture Jev cannot read is not asked: without the picture its answer
 * would be a guess, counted as a miss. It is left out of the rubric and said.
 */
function askedChecks(input: JudgeInput, ctx: JudgeContext) {
  const unasked: string[] = []
  const asked = (input.case?.graders ?? []).flatMap((grader) => {
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

/**
 * Every rule of the skill and every check of the case, in one request: they
 * are independent questions over one state, so the output and its pictures are
 * sent, and paid for, once. A skill with more questions than one request holds
 * has them asked in several. The headings the rules stand under are asked of
 * the request alone, in a request of their own, and with the rest where there
 * is no request.
 */
async function ask(
  input: JudgeInput,
  work: Work,
  ctx: JudgeContext,
): Promise<Pick<GenericRaw, 'adherence' | 'rubric'>> {
  const graders = input.case?.graders ?? []
  const { asked, unasked } = askedChecks(input, ctx)
  const headings = Object.fromEntries(
    work.headings.map((heading, i) => [`${HEADING}${i}`, headingQuestion(heading, work)]),
  )
  // With a request, the headings are asked of it alone, in a request of their own.
  const apart = work.headings.length > 0 && has(work.state, 'request')
  const questions = {
    ...Object.fromEntries(input.rules.map((r) => [`${RULE}${r.id}`, ruleQuestion(r, work)])),
    ...(apart ? {} : headings),
    ...Object.fromEntries(
      asked.map(({ grader, picture }) => [
        `${CHECK}${grader.id}`,
        statementQuestion(grader.statement, work, picture),
      ]),
    ),
  }
  const entries = Object.entries(questions)
  const requests = Array.from({ length: Math.ceil(entries.length / QUESTIONS_MAX) }, (_, i) =>
    Object.fromEntries(entries.slice(i * QUESTIONS_MAX, (i + 1) * QUESTIONS_MAX)),
  )
  const answers: Record<string, unknown> = Object.assign(
    {},
    ...(await Promise.all([
      ...requests.map((part) => ctx.jev.ask(work.state, part, ctx.signal)),
      ...(apart ? [ctx.jev.ask(headingState(work), headings, ctx.signal)] : []),
    ])),
  )
  const applies = new Map(
    work.headings.map((heading, i) => [heading, noulOf(answers, `${HEADING}${i}`)]),
  )
  const adherence = input.rules.length
    ? {
        rules: input.rules.map((r): RuleAnswer => {
          const heading = headingOf(r)
          const under = heading === null ? undefined : applies.get(heading)
          return {
            id: r.id,
            text: r.text,
            section: r.section,
            noul: noulOf(answers, `${RULE}${r.id}`),
            ...(under === undefined ? {} : { applies: under }),
          }
        }),
      }
    : null
  const rubric = graders.length
    ? {
        statements: asked.map(({ grader }) => ({
          id: grader.id,
          text: grader.statement,
          weight: grader.weight,
          noul: noulOf(answers, `${CHECK}${grader.id}`),
          units: null,
          best: null,
        })),
        ...(unasked.length ? { unasked } : {}),
      }
    : null
  return { adherence, rubric }
}

export const genericPack: JudgePack<GenericRaw> = {
  ...genericScoring,
  version: 5,
  label: 'Generic: the skill’s rules and the case’s checks',
  renders: true,
  async judge(input, ctx) {
    if (!asksJev(input, ctx)) return null
    // A picture Jev would refuse is said, so rules nobody marked are never read as followed.
    const unread = unreadOf(input)
    const nothing = unread ? { adherence: null, rubric: null, unread } : null
    for (const room of ROOMS) {
      const work = workOf(input, room)
      if (!work) return nothing
      try {
        const { adherence, rubric } = await ask(input, work, ctx)
        if (!adherence && !rubric) return nothing
        return {
          adherence,
          rubric,
          ...(unread ? { unread } : {}),
          ...(room.said ? { short: room.said } : {}),
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
