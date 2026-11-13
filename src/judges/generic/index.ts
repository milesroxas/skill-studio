/**
 * The pack every skill is graded by: the rules the skill states and the checks
 * its cases state, and nothing a skill did not ask for. It judges the work
 * whatever kind of file it is: the text of a page, a script or a piece of
 * writing, the picture of a page or of a picture, and what the agent told the
 * user beside it, since a rule may be about any of the three.
 *
 * Questions are literal, the criteria carry the boundary cases, and all
 * independent questions over the same state go in one request. Counting
 * happens in score.ts.
 */
import { join } from 'node:path'
import type { Grader } from '@domain/schemas.ts'
import { type Image, noul, withAssets } from '@typesafe-ai/sdk'
import { type Readable, readForJev } from '../images.ts'
import type { JevState } from '../jev.ts'
import { pictureOf } from '../shared/picture.ts'
import { asksJev, noulOf, requestState } from '../shared/questions.ts'
import { clip } from '../shared/score.ts'
import type { JudgeContext, JudgeInput, JudgePack } from '../types.ts'
import { type GenericRaw, genericScoring, type RuleAnswer } from './score.ts'

/** How much of a file Jev reads: its start says what it is, and a request has a size. */
const OUTPUT_MAX = 24_000
/** How much of what the agent told the user Jev reads. */
const NOTES_MAX = 6000

/** The work as Jev is given it: which of its parts there are, and the state that holds them. */
interface Work {
  state: JevState
  /** The file's text is in `output`. */
  text: boolean
  /** The work as a picture is in `picture`. */
  picture: boolean
  /** What the agent told the user is in `notes`. */
  notes: boolean
  /** `picture` is `output` drawn, as a page is, and not a picture made beside it. */
  drawn: boolean
  /** The other files it wrote are in `other_files`, by name. */
  others: boolean
}

/** Why the output's picture is not shown to Jev, as a flag; null when it was read or there is none. */
const unreadOf = (input: JudgeInput): string | null => {
  const problem = pictureOf(input)?.problem
  return problem ? `picture not judged: ${problem}` : null
}

/** The work of one output, or null when it has neither text nor a picture Jev can read. */
function workOf(input: JudgeInput): Work | null {
  const read = pictureOf(input)
  const text = input.text.trim() ? input.text.slice(0, OUTPUT_MAX) : ''
  const notes = input.notes?.trim().slice(0, NOTES_MAX) ?? ''
  if (!text && !read?.image) return null
  const state: JevState = { ...requestState(input) }
  if (text) state.output = text
  if (read?.image) state.picture = read.image
  if (notes) state.notes = notes
  // One file is the work itself; with more, a rule may be about what was made beside it.
  if (input.others.length)
    state.other_files = Object.fromEntries(input.others.map((o) => [o.file, o.text]))
  return {
    state,
    text: Boolean(text),
    picture: Boolean(read?.image),
    notes: Boolean(notes),
    drawn: input.primary?.kind === 'html',
    others: input.others.length > 0,
  }
}

const has = (state: JevState, key: string): boolean =>
  typeof state === 'object' && state !== null && key in state

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
        ? '`picture` shows `output` as it looks when it is opened.'
        : '`picture` is a picture made with `output`.'
      : null,
    work.others
      ? `\`other_files\` holds the other files made with ${made}, each by its name.`
      : null,
    work.notes
      ? `\`notes\` is what its maker told the user about ${made}: it is not part of ${made}.`
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

/**
 * What the criteria add when there are notes. A rule about the piece itself,
 * such as its length or its look, must never be failed for how the notes
 * read; a rule that asks for something to be said is met wherever it is said.
 */
const notesClause = (work: Work): string =>
  work.notes
    ? ' Something the agent must say, state, name, list, ask or report counts when `notes` says it. Nothing else is judged on `notes`.'
    : ''

const ruleQuestion = (rule: string, work: Work) => {
  const subject = subjectOf(work)
  const does = subject.includes(' and ') ? 'Do' : 'Does'
  return noul(`${lead(work)}${does} ${subject} follow this rule: "${rule}"`, {
    true: `What the rule asks is done everywhere it applies in ${subject}, or the rule is about a situation that does not come up here.${notesClause(work)}`,
    false: `Something the rule forbids is done in ${subject}, or something the rule requires is left out where the rule applies.${notesClause(work)}`,
  })
}

function statementQuestion(statement: string, work: Work, reference: Image | null) {
  const subject = subjectOf(work)
  const asked = `${lead(work)}Is this statement true of ${subject}: "${statement}"`
  return noul(
    reference ? withAssets`${asked} The statement is about this picture: ${reference}` : asked,
    {
      true: `The statement holds for ${subject} as written.${notesClause(work)}`,
      false: `The statement is false of ${subject}, or what it needs to be true is not in ${subject}.${notesClause(work)}`,
    },
  )
}

/** A check's reference picture as Jev reads it, or why it cannot; null for a check with none. */
const referenceOf = (grader: Grader, ctx: JudgeContext): Readable | null =>
  grader.image ? readForJev(join(ctx.skillDir, grader.image)) : null

async function adherence(
  input: JudgeInput,
  work: Work,
  ctx: JudgeContext,
): Promise<{ rules: RuleAnswer[] } | null> {
  if (!input.rules.length) return null
  const questions = Object.fromEntries(input.rules.map((r) => [r.id, ruleQuestion(r.text, work)]))
  const answers = await ctx.jev.ask(work.state, questions)
  return {
    rules: input.rules.map((r) => ({
      id: r.id,
      text: r.text,
      section: r.section,
      noul: noulOf(answers, r.id),
    })),
  }
}

/**
 * Each of the case's checks once, over the whole work. A check about a picture
 * Jev cannot read is not asked: without the picture its answer would be a
 * guess, counted as a miss. It is left out of the rubric and said.
 */
async function rubric(
  input: JudgeInput,
  work: Work,
  ctx: JudgeContext,
): Promise<GenericRaw['rubric']> {
  const graders = input.case?.graders ?? []
  if (!graders.length) return null
  const unasked: string[] = []
  const asked = graders.flatMap((grader) => {
    const reference = referenceOf(grader, ctx)
    if (!reference?.problem) return [{ grader, picture: reference?.image ?? null }]
    unasked.push(
      `grader ${grader.id} not judged, its picture is not shown to Jev (${reference.problem}): ${clip(grader.statement)}`,
    )
    return []
  })
  for (const line of unasked) ctx.log(line)
  const answers = asked.length
    ? await ctx.jev.ask(
        work.state,
        Object.fromEntries(
          asked.map(({ grader, picture }) => [
            grader.id,
            statementQuestion(grader.statement, work, picture),
          ]),
        ),
      )
    : {}
  return {
    statements: asked.map(({ grader }) => ({
      id: grader.id,
      text: grader.statement,
      weight: grader.weight,
      noul: noulOf(answers, grader.id),
      units: null,
      best: null,
    })),
    ...(unasked.length ? { unasked } : {}),
  }
}

export const genericPack: JudgePack<GenericRaw> = {
  ...genericScoring,
  version: 3,
  label: 'Generic: the skill’s rules and the case’s checks',
  renders: true,
  async judge(input, ctx) {
    if (!asksJev(input, ctx)) return null
    const work = workOf(input)
    // A picture Jev would refuse is said, so rules nobody marked are never read as followed.
    const unread = unreadOf(input)
    const nothing = unread ? { adherence: null, rubric: null, unread } : null
    if (!work) return nothing
    const [adh, rub] = await Promise.all([adherence(input, work, ctx), rubric(input, work, ctx)])
    if (!adh && !rub) return nothing
    return { adherence: adh, rubric: rub, ...(unread ? { unread } : {}) }
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
