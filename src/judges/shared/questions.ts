/**
 * Questions more than one pack asks. Each question is literal and its
 * criteria carry the boundary cases; counting stays in the scorers. Jev sees
 * only the state it is given, so a question about an output carries the
 * request the output answers with the pictures that came with it.
 */
import { join } from 'node:path'
import type { Grader } from '@domain/schemas.ts'
import { type Image, noul, withAssets } from '@typesafe-ai/sdk'
import { readForJev } from '../images.ts'
import type { JevState } from '../jev.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import type { StatementAnswer } from './score.ts'

/**
 * Whether Jev is asked about this output: grading has a key to ask with, and
 * the case does not say `bench.judge: false`. The one place that decides it,
 * for every pack.
 */
export const asksJev = (
  input: Pick<JudgeInput, 'case'>,
  ctx: Pick<JudgeContext, 'useJev'>,
): boolean => ctx.useJev && input.case?.bench.judge !== false

/** Jev's reply held no usable answer to a question that was asked. */
export class MissingAnswerError extends Error {
  constructor(
    readonly question: string,
    readonly field: string,
  ) {
    super(`Jev gave no ${field} for "${question}".`)
    this.name = 'MissingAnswerError'
  }
}

type Answers = Readonly<Record<string, unknown>>

const fieldOf = (answers: Answers, question: string, field: string): unknown => {
  const answer = Object.hasOwn(answers, question) ? answers[question] : undefined
  return answer && typeof answer === 'object'
    ? (answer as Record<string, unknown>)[field]
    : undefined
}

/** A number Jev answered `question` with, as it came; throws when it is missing or not a number. */
function numberOf(answers: Answers, question: string, field: string): number {
  const value = fieldOf(answers, question, field)
  if (typeof value !== 'number' || Number.isNaN(value))
    throw new MissingAnswerError(question, field)
  return value
}

/**
 * The probability Jev answered a yes/no `question` with, unrounded: a
 * threshold is applied to what Jev said, and a number is rounded only where it
 * is shown. A question that was asked and has no answer is a failed reading,
 * never a no and never a skip, so this throws.
 */
export const noulOf = (answers: Answers, question: string): number =>
  numberOf(answers, question, 'noul')

/** The level Jev answered a scored `question` with; throws when it is missing. */
export const scoreOf = (answers: Answers, question: string): number =>
  numberOf(answers, question, 'score')

/** Jev's reported confidence in its answer to `question`; throws when it is missing. */
export const confidenceOf = (answers: Answers, question: string): number =>
  numberOf(answers, question, 'confidence')

/** The label Jev picked for a choice `question`, one of `labels`; throws when it is missing or another. */
export function choiceOf<L extends string>(
  answers: Answers,
  question: string,
  labels: readonly L[],
): L {
  const value = fieldOf(answers, question, 'choice')
  if (typeof value !== 'string' || !labels.includes(value as L))
    throw new MissingAnswerError(question, 'choice')
  return value as L
}

/**
 * The answer to a question asked of some outputs only, such as the title's
 * kind or the step after an error: `read` reads it as `noulOf` and the rest
 * do, and a reply that left it out gives null, which its scorer leaves out.
 * So one missing extra does not cost the pack every layer, code's measures
 * with them. Any other failure still throws, and so does a missing answer to
 * a question every output is asked.
 */
export function optionalAnswer<T>(read: () => T): T | null {
  try {
    return read()
  } catch (error) {
    if (error instanceof MissingAnswerError) return null
    throw error
  }
}

/** A longer prompt is cut here: its start says what was asked, and the output needs the room. */
const REQUEST_MAX = 4000

/** The case's prompt, as Jev reads it; null for an output with no case. */
const requestOf = (input: JudgeInput): string | null =>
  input.case?.prompt.trim().slice(0, REQUEST_MAX) || null

/** What a case's request adds to a state: its text, and the pictures it came with. */
type RequestState = {
  request?: string
  /** In state once, so every question reads them and they are paid for once. */
  request_images?: Image[]
}

/** The request an output answers, as state: empty for an output with no case. */
export function requestState(input: JudgeInput): RequestState {
  const request = requestOf(input)
  if (!request) return {}
  return input.images.length
    ? { request, request_images: input.images.map((i) => i.image) }
    : { request }
}

/** `state` with the request the output answers in front, when its case has one. */
export const withRequest = <S extends Record<string, unknown>>(
  input: JudgeInput,
  state: S,
): RequestState & S => ({ ...requestState(input), ...state })

const holds = (state: JevState, key: string): boolean =>
  typeof state === 'object' && state !== null && key in state

/** Opens a question about `field` when `state` holds the request it answers. */
export const answering = (field: string, state: JevState): string =>
  holds(state, 'request')
    ? `\`${field}\` was produced to answer \`request\`${
        holds(state, 'request_images') ? ', which came with the pictures in `request_images`' : ''
      }. `
    : ''

/**
 * One grader statement as a question over `state[field]`. A statement about a
 * picture, such as a mock-up the output should match, carries that picture in
 * its own instructions: only this question needs it.
 */
function statementQuestion(
  statement: string,
  field: string,
  state: JevState = {},
  reference: Image | null = null,
) {
  const asked = `${answering(field, state)}Is this statement true of \`${field}\`: "${statement}"`
  return noul(
    reference ? withAssets`${asked} The statement is about this picture: ${reference}` : asked,
    {
      true: `The statement holds for \`${field}\` as written.`,
      false: `The statement is false of \`${field}\`, or \`${field}\` does not contain what the statement needs to be true.`,
    },
  )
}

/** A grader's reference picture, ready for Jev; null when it has none or Jev cannot read the file. */
function referenceOf(grader: Grader, ctx: JudgeContext): Image | null {
  if (!grader.image) return null
  const read = readForJev(join(ctx.skillDir, grader.image))
  if (read.problem) ctx.log(`${grader.id}: its picture is not shown to Jev, ${read.problem}.`)
  return read.image
}

/** Every grader statement asked once over `state[field]`, no per-unit pass. */
export async function askStatements(
  graders: Grader[],
  state: JevState,
  field: string,
  ctx: JudgeContext,
): Promise<StatementAnswer[]> {
  if (!graders.length) return []
  const questions = Object.fromEntries(
    graders.map((g) => [g.id, statementQuestion(g.statement, field, state, referenceOf(g, ctx))]),
  )
  const answers = await ctx.jev.ask(state, questions)
  return graders.map((g) => ({
    id: g.id,
    text: g.statement,
    weight: g.weight,
    noul: noulOf(answers, g.id),
    units: null,
    best: null,
  }))
}
