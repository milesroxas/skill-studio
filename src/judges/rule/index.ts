/**
 * Jev reads a rule the way it reads an output: one request, one yes/no per
 * principle and a score for complexity, all over the same small state. The
 * answers are probabilities code turns into findings (`@domain/improve.ts`),
 * so Auto refine, Suggest changes and Help me improve judge a rule the same
 * way whatever model writes the prose. Its state is the rule and two lines
 * either side, never the whole file: that is what the question needs, and
 * what it costs.
 */
import {
  CUT_QUESTION,
  type ImproveStep,
  JUDGED,
  type Judged,
  type RewriteKind,
  type Rewrites,
  type RuleJudgment,
} from '@domain/improve.ts'
import type { RuleScene } from '@domain/lint.ts'
import { noul, score } from '@typesafe-ai/sdk'
import type { Jev } from '../jev.ts'
import { noulOf, scoreOf } from '../shared/questions.ts'

/** The rule as Jev reads it. The description says the one aspect the skill is about. */
const stateOf = (scene: RuleScene) => ({
  rule: scene.selection,
  ...(scene.before ? { before: scene.before } : {}),
  ...(scene.after ? { after: scene.after } : {}),
  skill_description: scene.description || 'Not written yet.',
})

/** One question per principle over the text in `field`, each phrased so that yes means the principle holds. */
const principleQuestion = (principle: Judged, field: string) => {
  const f = `\`${field}\``
  switch (principle) {
    case 'process':
      return noul(
        `Does ${f} give the agent a step to take or a decision to make, rather than a quality the result should have?`,
        {
          true: 'It names an action, a check or a choice the agent can carry out as written, such as "lead with the change" or "write exactly two sentences".',
          false:
            'It describes how the result should be or feel, such as "clear", "concise" or "natural", and leaves the agent to guess what to do.',
        },
      )
    case 'why':
      return noul(`Does ${f} say why it exists, or what goes wrong when it is not followed?`, {
        true: 'A reason is in the text: a second sentence, a "because" or "so that", or a colon that explains it.',
        false: 'It is bare: it says what to do and nothing about why.',
      })
    case 'strict':
      return noul(
        `Does ${f} fix its boundary with a number, a unit, or an absolute word such as always, never or only?`,
        {
          true: 'The agent can tell exactly when it is met: a count, a limit, or always or never.',
          false:
            'It leaves the boundary to judgment, with words such as "reasonably", "short", "where appropriate" or "try to".',
        },
      )
    case 'earns':
      return noul(
        `Would an agent that never read ${f} behave differently on this skill’s task than one that did?`,
        {
          true: 'It changes what the agent writes or does: without it the agent would plausibly do otherwise.',
          false:
            'It tells the agent what it already knows or would do anyway, such as what a term means or that the work should be correct.',
        },
      )
    case 'focused':
      return noul(`Is ${f} about the aspect \`skill_description\` says this skill is for?`, {
        true: 'It serves the work the description names.',
        false:
          'It is about another aspect, such as code style in a writing skill, or formatting in a workflow skill.',
      })
  }
}

const complexityQuestion = (field: string) =>
  score(`How much must the agent hold in mind to follow \`${field}\`?`, [
    'One step or one check, with no condition.',
    'One step with one condition: "if X, do Y".',
    'Two or three conditions in one sentence, which the agent must weigh together.',
    'Four or more branches written as prose: a decision tree that was not drawn as one.',
  ])

/** The six questions over `field`, keyed `<prefix>_<principle>` and `<prefix>_complexity`. */
const ruleQuestions = (field: string, prefix: string) => ({
  ...Object.fromEntries(JUDGED.map((p) => [`${prefix}_${p}`, principleQuestion(p, field)])),
  [`${prefix}_complexity`]: complexityQuestion(field),
})

/**
 * The six answers under `prefix` as one judgment. A question Jev left
 * unanswered throws: read as 0 it would be a sure finding nobody made.
 */
const judgmentOf = (answers: Readonly<Record<string, unknown>>, prefix: string): RuleJudgment => {
  const judgment = { complexity: scoreOf(answers, `${prefix}_complexity`) } as RuleJudgment
  for (const p of JUDGED) judgment[p] = noulOf(answers, `${prefix}_${p}`)
  return judgment
}

/** Jev's reading of the selected rule in its place. */
export async function judgeRule(jev: Jev, scene: RuleScene): Promise<RuleJudgment> {
  const answers = await jev.ask(stateOf(scene), ruleQuestions('rule', 'rule'))
  return judgmentOf(answers, 'rule')
}

const keptQuestion = (field: string) =>
  noul(`Does \`${field}\` keep every fact, number and condition that \`rule\` holds?`, {
    true: 'Everything the rule requires, forbids or counts is still required, forbidden or counted, in whatever words.',
    false: 'It drops, changes or softens a fact, a number or a condition of the rule.',
  })

/**
 * Whether each rewrite kept the selection's facts, and whether the best
 * practice rewrite now holds every principle: one request for all of it.
 */
export async function verifyRewrites(
  jev: Jev,
  scene: RuleScene,
  rewrites: Rewrites,
): Promise<{ kept: Record<RewriteKind, number>; practice: RuleJudgment }> {
  const state = {
    ...stateOf(scene),
    rewrite_practice: rewrites.practice,
    rewrite_direct: rewrites.direct,
    rewrite_shorter: rewrites.shorter,
  }
  const answers = await jev.ask(state, {
    kept_practice: keptQuestion('rewrite_practice'),
    kept_direct: keptQuestion('rewrite_direct'),
    kept_shorter: keptQuestion('rewrite_shorter'),
    ...ruleQuestions('rewrite_practice', 'practice'),
  })
  return {
    kept: {
      practice: noulOf(answers, 'kept_practice'),
      direct: noulOf(answers, 'kept_direct'),
      shorter: noulOf(answers, 'kept_shorter'),
    },
    practice: judgmentOf(answers, 'practice'),
  }
}

/** Whether the writer's reply answered the step's question, and, on the first step, whether it says the line should go. */
export async function judgeAnswer(
  jev: Jev,
  scene: RuleScene,
  step: ImproveStep,
  answer: string,
): Promise<{ answered: number; cut: number | null }> {
  const state = { ...stateOf(scene), question: step.ask, answer }
  const answered = noul(step.answered, {
    true: 'The answer gives what the question asked for, even briefly or in passing.',
    false: 'The answer talks around the question, asks one back, or gives something else.',
  })
  if (step.id !== 'earns') {
    const answers = await jev.ask(state, { answered })
    return { answered: noulOf(answers, 'answered'), cut: null }
  }
  const answers = await jev.ask(state, {
    answered,
    cut: noul(CUT_QUESTION, {
      true: 'The writer says the line does nothing, adds nothing, or should be deleted.',
      false: 'The writer names something the line does, or wants to keep it.',
    }),
  })
  return { answered: noulOf(answers, 'answered'), cut: noulOf(answers, 'cut') }
}

/** Jev's reading of a draft, in the selection's place. */
export const judgeDraft = (jev: Jev, scene: RuleScene, draft: string): Promise<RuleJudgment> =>
  judgeRule(jev, { ...scene, selection: draft })
