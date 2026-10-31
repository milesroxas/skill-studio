/**
 * The default judge pack. Questions are literal, the criteria carry the
 * boundary cases, and all independent questions over the same state go in one
 * request. Counting happens in score.ts.
 */
import { noul } from '@typesafe-ai/sdk'
import { askStatements, pairwiseText, round, statementQuestion } from '../shared/questions.ts'
import type { StatementAnswer } from '../shared/score.ts'
import type { JudgeContext, JudgeInput, JudgePack } from '../types.ts'
import { type GenericRaw, genericScoring, type RuleAnswer } from './score.ts'

const ruleQuestion = (rule: string) =>
  noul(`Does \`output\` follow this rule: "${rule}"`, {
    true: 'The output does what the rule asks everywhere the rule applies, or the rule is about a situation that does not come up in this output.',
    false:
      'The output does something the rule forbids, or leaves out something the rule requires in a place where the rule applies.',
  })

async function adherence(
  input: JudgeInput,
  ctx: JudgeContext,
): Promise<{ rules: RuleAnswer[] } | null> {
  if (!input.rules.length) return null
  const questions = Object.fromEntries(input.rules.map((r) => [r.id, ruleQuestion(r.text)]))
  const answers = await ctx.jev.ask({ output: input.text }, questions)
  return {
    rules: input.rules.map((r) => ({
      id: r.id,
      text: r.text,
      section: r.section,
      noul: round(answers[r.id].noul),
    })),
  }
}

/** Each statement over the whole output, and over each unit to say where it comes closest. */
async function rubric(
  input: JudgeInput,
  ctx: JudgeContext,
): Promise<{ statements: StatementAnswer[] } | null> {
  const graders = input.case?.graders ?? []
  if (!graders.length) return null
  const perUnit = Object.fromEntries(
    graders.map((g) => [g.id, statementQuestion(g.statement, 'paragraph')]),
  )
  const [whole, unitAnswers] = await Promise.all([
    askStatements(graders, { output: input.text }, 'output', ctx),
    input.units.length > 1
      ? ctx.jev.pool(input.units, (unit) => ctx.jev.ask({ paragraph: unit.text }, perUnit))
      : null,
  ])
  return {
    statements: whole.map((s) => {
      const units = unitAnswers ? unitAnswers.map((a) => round(a[s.id].noul)) : null
      return { ...s, units, best: units ? units.indexOf(Math.max(...units)) : null }
    }),
  }
}

export const genericPack: JudgePack<GenericRaw> = {
  ...genericScoring,
  label: 'Generic: rule adherence and rubric',
  artifacts: ['markdown'],
  async judge(input, ctx) {
    if (!ctx.useJev || !input.text.trim()) return null
    if (input.case?.bench.judge === false) return null
    const [adh, rub] = await Promise.all([adherence(input, ctx), rubric(input, ctx)])
    if (!adh && !rub) return null
    return { adherence: adh, rubric: rub }
  },
  pairwise: pairwiseText,
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
