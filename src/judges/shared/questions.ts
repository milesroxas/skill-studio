/**
 * Questions more than one pack asks. Each question is literal and its
 * criteria carry the boundary cases; counting stays in the scorers. Jev sees
 * only the state it is given, so a question about an output carries the
 * request the output answers with the pictures that came with it.
 */
import { join } from 'node:path'
import type { Grader } from '@domain/schemas.ts'
import { round } from '@domain/text.ts'
import { type Image, noul, withAssets } from '@typesafe-ai/sdk'
import { readForJev } from '../images.ts'
import type { JevState } from '../jev.ts'
import type { JudgeContext, JudgeInput } from '../types.ts'
import type { StatementAnswer } from './score.ts'

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
export function statementQuestion(
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
    noul: round(answers[g.id].noul, 3),
    units: null,
    best: null,
  }))
}
