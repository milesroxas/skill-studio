/**
 * What more than one pack needs to ask Jev and read its answers. Jev sees
 * only the state it is given, so a question about an output carries the
 * request the output answers with the pictures that came with it.
 */
import type { Image } from '@typesafe-ai/sdk'
import type { JudgeContext, JudgeInput } from '../types.ts'

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

/**
 * The answer to a question asked of some outputs only, such as whether a page fits
 * a phone or the step after an error: `read` reads it as `noulOf` and the rest
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
