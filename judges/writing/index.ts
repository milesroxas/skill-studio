/**
 * The writing judge pack: the reference skill's benchmark as a pack. Lint
 * comes from the skill's own command (bench.json `lint.command`) or a small
 * fallback; shape is code; structure, substance, tone and grounding are Jev
 * questions whose thresholds and points live in score.ts.
 */
import type { Unit } from '@core/text.ts'
import { choice, noul, score } from '@typesafe-ai/sdk'
import { runCommand } from '../shared/exec.ts'
import { pairwiseText, round } from '../shared/questions.ts'
import type { JudgeContext, JudgeInput, JudgePack } from '../types.ts'
import {
  type LintRaw,
  type UnitAnswer,
  type WritingConfig,
  type WritingJev,
  type WritingRaw,
  writingScoring,
} from './score.ts'
import {
  AI_MENTION,
  type Claim,
  claimsOf,
  evidenceChunks,
  fallbackLint,
  type LintFinding,
  nearestEvidence,
  shapeOf,
} from './shape.ts'

const PIECE_QUESTIONS = {
  opens_on_work: noul(
    'Does `opening` begin inside the work or its problem, with a concrete tension, observation, scene or admission?',
    {
      true: 'The first sentences name a specific problem, a moment from the work, what people assume about it, or where the writer started, including a mistake or a doubt.',
      false:
        'The first sentences announce the piece, say the writer is excited or proud, greet the reader, ask a question and then answer it, define a term, or talk about the industry or the world in general.',
    },
  ),
  point_early: noul('Does `opening` tell the reader what the piece shows, argues or found?', {
    true: 'It states the main point, a result, or the question the rest answers, or lists what the sections will cover.',
    false: 'It only sets a scene or gives background, and the main point is not stated in it.',
  }),
  ending: choice('What does `ending` do?', {
    recap: 'Summarizes or lists what the earlier parts covered.',
    implication:
      'States what the work described adds up to: a principle, a consequence or a changed view, tied to that work.',
    engagement: 'Asks the reader to comment, share, follow, reply or say what they think.',
    moral: 'Makes a broad inspirational or industry-wide statement not tied to the specific work.',
    pointer:
      'Only points to where to see or try more, such as a link, a case study, a demo or the feature itself.',
  }),
}

const ENDING_BEFORE = {
  ending_before: choice('What does `before_ending` do?', {
    recap: 'Summarizes or lists what the earlier parts covered.',
    implication:
      'States what the work described adds up to: a principle, a consequence or a changed view, tied to that work.',
    engagement: 'Asks the reader to comment, share, follow, reply or say what they think.',
    moral: 'Makes a broad inspirational or industry-wide statement not tied to the specific work.',
    detail: 'Describes more of the work itself: what was built, how, or a result.',
  }),
}

const TITLE_QUESTION = {
  title: choice('What kind of title is `title`?', {
    teaser: 'Hides the subject to make the reader curious.',
    descriptive: 'Says plainly what the piece covers, such as "How I built X" or "Why X".',
    claim: 'States a position or a finding in a few words.',
    hype: 'Uses superlatives, excitement, "ultimate", all caps or a number for clicks.',
  }),
}

const UNIT_QUESTIONS = {
  specificity: score('How specific is `paragraph` to one piece of work?', [
    "General: it could appear unchanged in any designer's or developer's writing. No named project, decision, artifact or measured detail.",
    'Names the project or the topic but stays general about what happened or why.',
    'Gives a concrete detail of the work: a named decision, constraint, artifact or mechanism, a tool used for a stated reason, or a measured result.',
  ]),
  selling: score('How promotional is the language in `paragraph`?', [
    'Plain: states what happened or what the writer thinks, without praising the work, the tools or the writer.',
    'Some emphasis: a few adjectives or claims that praise the work, the tools or the result.',
    'Selling: superlatives, hype, excitement or announcement language about the work, the tools or the writer.',
  ]),
  decision: noul(
    'Does `paragraph` describe a choice between options, or say why one approach was used instead of another?',
    {
      true: 'It names an alternative that was considered, rejected or traded off, or gives the reason this approach was picked over another.',
      false:
        'It describes what exists or what happened, with no alternative and no reason for the choice.',
    },
  ),
  setback: noul(
    'Does `paragraph` say that something did not work, cost something, was harder than expected, was given up, or is not settled yet?',
    {
      true: 'It reports a failure, a mistake, a slower or costlier result, a limitation, or an open question about the work.',
      false: 'It reports only what works or what was achieved.',
    },
  ),
}

const AI_QUESTIONS = {
  ai_did_work: noul(
    'Does `paragraph` say that an AI tool or agent did part of the work of building, coding or writing the thing described?',
  ),
  ai_split: noul(
    'Does `paragraph` make clear which part of the work an AI tool or agent did and which part the writer did?',
    {
      true: 'It says what the AI or agent produced or decided, and what the writer designed, directed, reviewed, tested or fixed.',
      false:
        'It mentions AI or an agent without saying who did which part, or credits all of the work to one side.',
    },
  ),
}

// "me" in the copy against a name in the evidence read as a contradiction until `writer` said who I is.
const GROUNDING_QUESTION = {
  grounding: choice('How does `evidence` relate to the facts stated in `claim`?', {
    supported:
      'The facts in `claim` (numbers, names, dates, roles, tools, outcomes, who did what) are stated in `evidence`, in the same or other words. `claim` is written by `writer`, so "I", "me" and "my" in it mean `writer`; "it", "this" and "that" in it refer to `sentence_before`.',
    contradicted:
      '`evidence` states something that conflicts with a fact in `claim`. A change of pronoun between "I" and the writer\'s name is not a conflict.',
    missing: '`claim` states a fact that `evidence` does not mention.',
    no_facts:
      '`claim` states no checkable fact: it is an opinion, a feeling, a reason, a plan or a general statement.',
  }),
}

/** Asked only after the Choice says contradicted: a contradiction counts only when this literal check agrees. */
const CONFLICT_QUESTION = {
  conflict: noul(
    'Does `evidence` state a fact that cannot be true at the same time as a fact in `claim`?',
    {
      true: 'They give different numbers, names, dates, tools or outcomes for the same thing, or one says something happens and the other says it does not.',
      false:
        'They agree, `evidence` adds detail, or `evidence` is about something else. A change of pronoun between "I" and the writer\'s name is not a conflict.',
    },
  ),
}

interface PieceAnswers {
  opens_on_work: { noul: number }
  point_early: { noul: number }
  ending: { choice: string; probabilities: Record<string, number> }
  ending_before?: { choice: string }
}

interface UnitAnswers {
  specificity: { score: number }
  selling: { score: number }
  decision: { noul: number }
  setback: { noul: number }
  ai_did_work?: { noul: number }
  ai_split?: { noul: number }
}

/** bench.json `borrowed`: case-insensitive patterns for lines the copy must not lift from a source. */
function borrowedIn(text: string, patterns: string[], ctx: JudgeContext): string[] {
  return patterns.filter((source) => {
    try {
      return new RegExp(source, 'i').test(text)
    } catch {
      ctx.log(`writing: bad borrowed pattern ${source}`)
      return false
    }
  })
}

const asFindings = (parsed: unknown): LintFinding[] | null => {
  const list = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { findings?: unknown }).findings)
      ? (parsed as { findings: unknown[] }).findings
      : null
  if (!list) return null
  return list.flatMap((f) => {
    if (!f || typeof f !== 'object') return []
    const r = f as Record<string, unknown>
    const severity = String(r.severity ?? 'warning')
    if (!['error', 'warning', 'info'].includes(severity)) return []
    return [
      {
        severity: severity as LintFinding['severity'],
        rule: String(r.rule ?? 'lint'),
        message: String(r.message ?? ''),
        excerpt: typeof r.excerpt === 'string' ? r.excerpt : undefined,
      },
    ]
  })
}

/**
 * The skill's lint command gets the copy on stdin, `{kind}` in its text
 * replaced, runs from the skill dir, and prints `{ findings: [...] }` or a
 * bare array of `{ severity, rule, message, excerpt? }`. Its exit code is
 * ignored: errors are read from the findings.
 */
function lint(
  input: JudgeInput,
  ctx: JudgeContext,
  config: WritingConfig['lint'],
  kind: string,
): LintRaw {
  let findings: LintFinding[] | null
  let failed: string | null = null
  const command = config.command ? config.command.replaceAll('{kind}', kind) : null
  if (command) {
    const result = runCommand(command, {
      cwd: ctx.skillDir,
      input: input.text,
      timeoutMs: config.timeoutSeconds * 1000,
    })
    try {
      findings = result.timedOut ? null : asFindings(JSON.parse(result.stdout))
    } catch {
      findings = null
    }
    if (!findings) {
      failed = result.timedOut
        ? 'timed out'
        : result.tail || `exit ${result.exit}, no findings JSON`
      findings = []
    }
  } else findings = fallbackLint(input.text, input.case?.bench.words ?? null)
  const errors = findings.filter((f) => f.severity === 'error')
  return {
    command,
    errors: errors.length,
    errorExcerpts: errors.map((f) => `${f.rule}: ${f.excerpt ?? f.message}`),
    warnings: findings.filter((f) => f.severity === 'warning').map((f) => f.rule),
    info: findings.filter((f) => f.severity === 'info').length,
    failed,
  }
}

async function judgeGrounding(
  units: Unit[],
  chunks: string[],
  writer: string,
  ctx: JudgeContext,
): Promise<WritingJev['grounding']> {
  const claims = claimsOf(units)
  const verdicts = await ctx.jev.pool(claims, async ({ claim, before }: Claim) => {
    const state = {
      writer,
      ...(before ? { sentence_before: before } : {}),
      claim,
      evidence: nearestEvidence(`${before ?? ''} ${claim}`, chunks),
    }
    const answer = await ctx.jev.ask(state, GROUNDING_QUESTION)
    const verdict = answer.grounding.choice
    const conflict =
      verdict === 'contradicted'
        ? round((await ctx.jev.ask(state, CONFLICT_QUESTION)).conflict.noul)
        : null
    return {
      claim,
      before,
      verdict,
      conflict,
      confidence: round(answer.grounding.confidence),
      evidence: state.evidence,
    }
  })
  return { verdicts }
}

async function judgeJev(
  input: JudgeInput,
  ctx: JudgeContext,
  chunks: string[],
  writer: string,
): Promise<WritingJev> {
  const units = input.units
  const prose = units.filter((u) => !u.list)
  const opening = prose
    .slice(0, 2)
    .map((u) => u.text)
    .join('\n\n')
  const ending = prose.at(-1)?.text ?? ''
  const beforeEnding = prose.length > 2 ? prose[prose.length - 2].text : ''
  const pieceState = { opening, ending, ...(beforeEnding ? { before_ending: beforeEnding } : {}) }

  const pieceQuestions = beforeEnding ? { ...PIECE_QUESTIONS, ...ENDING_BEFORE } : PIECE_QUESTIONS
  const pieceAnswers: Promise<PieceAnswers> = ctx.jev.ask(pieceState, pieceQuestions)
  const [piece, titleAnswer, unitAnswers] = await Promise.all([
    pieceAnswers,
    input.title ? ctx.jev.ask({ title: input.title }, TITLE_QUESTION) : null,
    ctx.jev.pool(units, async (unit): Promise<UnitAnswers> => {
      const state = { paragraph: unit.text }
      if (!AI_MENTION.test(unit.text)) return ctx.jev.ask(state, UNIT_QUESTIONS)
      return ctx.jev.ask(state, { ...UNIT_QUESTIONS, ...AI_QUESTIONS })
    }),
  ])

  const perUnit: UnitAnswer[] = units.map((unit, i) => {
    const a = unitAnswers[i]
    return {
      text: unit.text,
      list: unit.list,
      specificity: round(a.specificity.score / 2),
      selling: round(a.selling.score / 2),
      decision: round(a.decision.noul),
      setback: round(a.setback.noul),
      aiDidWork: a.ai_did_work ? round(a.ai_did_work.noul) : null,
      aiSplit: a.ai_split ? round(a.ai_split.noul) : null,
    }
  })
  const grounding = chunks.length ? await judgeGrounding(units, chunks, writer, ctx) : null
  return {
    opensOnWork: round(piece.opens_on_work.noul),
    pointEarly: round(piece.point_early.noul),
    ending: piece.ending.choice,
    endingBefore: piece.ending_before?.choice ?? null,
    endingProbabilities: piece.ending.probabilities,
    title: titleAnswer ? titleAnswer.title.choice : null,
    aiBuilt: Boolean(input.case?.bench.aiBuilt),
    aiMentioned: AI_MENTION.test(input.text),
    grounding,
    perUnit,
  }
}

export const writingPack: JudgePack<WritingRaw> = {
  ...writingScoring,
  label: 'Writing: lint, shape, structure, substance, tone, grounding',
  artifacts: ['markdown'],
  async judge(input, ctx) {
    if (!input.text.trim()) return null
    const config = ctx.config as WritingConfig
    const kind = input.case?.bench.kind ?? config.writingKind
    const chunks = evidenceChunks(Object.values(input.evidence))
    const runJev = ctx.useJev && input.case?.bench.judge !== false && input.units.length > 0
    const writer = config.writer ?? 'the writer'
    return {
      kind,
      lint: lint(input, ctx, config.lint, kind),
      shape: kind === 'article' ? shapeOf(input.text) : null,
      borrowed: borrowedIn(input.text, config.borrowed, ctx),
      hasEvidence: chunks.length > 0,
      jev: runJev ? await judgeJev(input, ctx, chunks, writer) : null,
    }
  },
  pairwise: pairwiseText,
  anchorsTemplate: [
    '---',
    'case: <case key>',
    'label: good | bad',
    'tests: lint, structure, substance, tone, grounding, total',
    'about: Why this anchor exists.',
    '---',
    '',
    '<the output>',
    '',
  ].join('\n'),
}
