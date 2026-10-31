/**
 * Questions more than one pack asks. Each question is literal and its
 * criteria carry the boundary cases; counting stays in the scorers.
 */
import type { Grader } from '@core/schemas.ts'
import type { State } from '@server/jev.ts'
import { choice, noul } from '@typesafe-ai/sdk'
import type { JudgeContext, JudgeInput, PairwiseVote } from '../types.ts'
import type { StatementAnswer } from './score.ts'

export const round = (value: number): number => Number(value.toFixed(3))

export const statementQuestion = (statement: string, field: string) =>
  noul(`Is this statement true of \`${field}\`: "${statement}"`, {
    true: `The statement holds for \`${field}\` as written.`,
    false: `The statement is false of \`${field}\`, or \`${field}\` does not contain what the statement needs to be true.`,
  })

/** Every grader statement asked once over `state[field]`, no per-unit pass. */
export async function askStatements(
  graders: Grader[],
  state: State,
  field: string,
  ctx: JudgeContext,
): Promise<StatementAnswer[]> {
  if (!graders.length) return []
  const questions = Object.fromEntries(
    graders.map((g) => [g.id, statementQuestion(g.statement, field)]),
  )
  const answers = await ctx.jev.ask(state, questions)
  return graders.map((g) => ({
    id: g.id,
    text: g.statement,
    weight: g.weight,
    noul: round(answers[g.id].noul),
    units: null,
    best: null,
  }))
}

/** One Choice per criterion over the two outputs' judged text. */
export async function pairwiseText(
  a: JudgeInput,
  b: JudgeInput,
  criteria: string[],
  ctx: JudgeContext,
): Promise<Record<string, PairwiseVote>> {
  const questions = Object.fromEntries(
    criteria.map((criterion, i) => [
      `c${i}`,
      choice(`Which of \`a\` and \`b\` better satisfies this criterion: "${criterion}"`, {
        a: '`a` satisfies the criterion and `b` does not, or `a` satisfies it clearly more.',
        b: '`b` satisfies the criterion and `a` does not, or `b` satisfies it clearly more.',
        tie: 'Both satisfy it to the same degree, or neither does.',
      }),
    ]),
  )
  const answers = await ctx.jev.ask({ a: a.text, b: b.text }, questions)
  return Object.fromEntries(
    criteria.map((criterion, i) => {
      const answer = answers[`c${i}`]
      return [criterion, { vote: answer.choice, confidence: round(answer.confidence) }]
    }),
  )
}
