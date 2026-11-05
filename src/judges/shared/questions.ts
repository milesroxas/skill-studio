/**
 * Questions more than one pack asks. Each question is literal and its
 * criteria carry the boundary cases; counting stays in the scorers. Jev sees
 * only the state it is given, so a question about an output carries the
 * request the output answers, and a comparison carries the skill's rules too.
 */
import { type Grader, OVERALL } from '@domain/schemas.ts'
import { round } from '@domain/text.ts'
import { choice, noul } from '@typesafe-ai/sdk'
import type { JevState } from '../jev.ts'
import type { JudgeContext, JudgeInput, PairwiseVote } from '../types.ts'
import type { StatementAnswer } from './score.ts'

/** A longer prompt is cut here: its start says what was asked, and the output needs the room. */
const REQUEST_MAX = 4000

/** The case's prompt, as Jev reads it; null for an output with no case. */
export const requestOf = (input: JudgeInput): string | null =>
  input.case?.prompt.trim().slice(0, REQUEST_MAX) || null

/** `state` with the request the output answers in front, when its case has one. */
export function withRequest<S extends Record<string, unknown>>(
  input: JudgeInput,
  state: S,
): S | (S & { request: string }) {
  const request = requestOf(input)
  return request ? { request, ...state } : state
}

const hasRequest = (state: JevState): boolean =>
  typeof state === 'object' && state !== null && 'request' in state

/** Opens a question about `field` when `state` holds the request it answers. */
export const answering = (field: string, state: JevState): string =>
  hasRequest(state) ? `\`${field}\` was produced to answer \`request\`. ` : ''

export const statementQuestion = (statement: string, field: string, state: JevState = {}) =>
  noul(`${answering(field, state)}Is this statement true of \`${field}\`: "${statement}"`, {
    true: `The statement holds for \`${field}\` as written.`,
    false: `The statement is false of \`${field}\`, or \`${field}\` does not contain what the statement needs to be true.`,
  })

/** Every grader statement asked once over `state[field]`, no per-unit pass. */
export async function askStatements(
  graders: Grader[],
  state: JevState,
  field: string,
  ctx: JudgeContext,
): Promise<StatementAnswer[]> {
  if (!graders.length) return []
  const questions = Object.fromEntries(
    graders.map((g) => [g.id, statementQuestion(g.statement, field, state)]),
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

/** What two outputs are measured against: the request each answers, the skill's rules, the case's graders. */
interface PairGround {
  /** `shared`: one case. `separate`: each output has its own. `none`: an output has no case. */
  requests: 'shared' | 'separate' | 'none'
  rules: boolean
  checks: boolean
}

/** Joins the wording for the rules and for the checks, leaving out whichever the state lacks. */
const both = (ground: PairGround, rules: string, checks: string): string =>
  [ground.rules ? rules : '', ground.checks ? checks : ''].filter(Boolean).join(' and ')

const SEPARATE = '`a` was written to answer `request_a` and `b` to answer `request_b`'

/** "Which is better" with no criterion named: fewer rules broken, then the request done more exactly. */
function overallQuestion(ground: PairGround) {
  const asked = ground.requests !== 'none'
  const shared = ground.requests === 'shared'
  const request = shared ? '`request`' : 'its own request'
  const same = both(ground, 'break', 'fail')
  const side = (x: string, y: string): string => {
    const fewer = `\`${x}\` ${both(ground, 'breaks fewer of `rules`', 'fails fewer of `checks`')} than \`${y}\`.`
    return asked
      ? `${fewer} If they ${same} the same ones, \`${x}\` does what ${request} asks more exactly.`
      : fewer
  }
  const level = both(ground, 'break the same `rules`', 'fail the same `checks`')
  const opening = ground.requests === 'separate' ? `${SEPARATE}. ` : ''
  const better = asked ? `the better answer to ${request}` : 'better'
  return choice(
    `${opening}Which of \`a\` and \`b\` is ${better}, judged by ${both(ground, '`rules`', '`checks`')}?`,
    {
      a: side('a', 'b'),
      b: side('b', 'a'),
      tie: asked
        ? `\`a\` and \`b\` ${level}, and answer ${shared ? '`request`' : 'their own requests'} equally well.`
        : `\`a\` and \`b\` ${level}.`,
    },
  )
}

/** A criterion the reader typed, with what the outputs were written for said first. */
function namedQuestion(criterion: string, ground: PairGround) {
  const following = ground.rules ? ' while following `rules`' : ''
  const opening =
    ground.requests === 'shared'
      ? `\`a\` and \`b\` were each written to answer \`request\`${following}. `
      : ground.requests === 'separate'
        ? `${SEPARATE}${following}. `
        : ground.rules
          ? '`a` and `b` were each written to follow `rules`. '
          : ''
  return choice(
    `${opening}Which of \`a\` and \`b\` better satisfies this criterion: "${criterion}"`,
    {
      a: '`a` satisfies the criterion and `b` does not, or `a` satisfies it clearly more.',
      b: '`b` satisfies the criterion and `a` does not, or `b` satisfies it clearly more.',
      tie: 'Both satisfy it to the same degree, or neither does.',
    },
  )
}

const isOverall = (criterion: string): boolean => criterion.trim().toLowerCase() === OVERALL

/**
 * One Choice per criterion over the two outputs' judged text, with the
 * request, the skill's rules and the case's graders in the state. Without
 * them Jev can only fall back on which text reads better in general, and
 * prefers a note that breaks the skill's length rule for being fuller.
 */
export async function pairwiseText(
  a: JudgeInput,
  b: JudgeInput,
  criteria: string[],
  ctx: JudgeContext,
): Promise<Record<string, PairwiseVote>> {
  if (!a.text.trim() || !b.text.trim())
    throw new Error('Jev compares text, and one of these outputs has none.')
  const requestA = requestOf(a)
  const requestB = requestOf(b)
  const requests: PairGround['requests'] =
    requestA === null || requestB === null
      ? 'none'
      : a.case?.id === b.case?.id
        ? 'shared'
        : 'separate'
  const rules = a.rules.map((r) => r.text)
  // Graders belong to one case, so they measure both outputs only when the case is shared.
  const checks =
    criteria.some(isOverall) && requests === 'shared'
      ? (a.case?.graders ?? []).map((g) => g.statement)
      : []
  const ground: PairGround = { requests, rules: rules.length > 0, checks: checks.length > 0 }
  const state = {
    ...(requests === 'shared' ? { request: requestA } : {}),
    ...(requests === 'separate' ? { request_a: requestA, request_b: requestB } : {}),
    ...(ground.rules ? { rules } : {}),
    ...(ground.checks ? { checks } : {}),
    a: a.text,
    b: b.text,
  }
  // With no rules and no graders there is nothing to count, so "overall" is asked as a named criterion.
  const measured = ground.rules || ground.checks
  const questions = Object.fromEntries(
    criteria.map((criterion, i) => [
      `c${i}`,
      isOverall(criterion) && measured ? overallQuestion(ground) : namedQuestion(criterion, ground),
    ]),
  )
  const answers = await ctx.jev.ask(state, questions)
  return Object.fromEntries(
    criteria.map((criterion, i) => {
      const answer = answers[`c${i}`]
      return [criterion, { vote: answer.choice, confidence: round(answer.confidence, 3) }]
    }),
  )
}
