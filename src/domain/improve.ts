/**
 * The three things a writer can do with a selected rule: Auto refine (check
 * it, and rewrite it only when something drifts), Suggest changes (three
 * labelled rewrites to pick from) and Help me improve (a few fixed questions
 * in the side panel, then a draft). Code owns each workflow: the lint and the
 * judge say what is wrong, a generative model only writes prose, and these
 * functions build what it is asked and read what it hands back. Pure data and
 * functions.
 */
import type { AiRun, ChatMessage } from './ai.ts'
import { APP_INTRO as APP, tag, VOICE } from './assist.ts'
import { type Finding, type RuleScene, wordCount } from './lint.ts'
import { type Principle, principleGuide, RULE_GUIDE, RULE_SHAPE } from './templates.ts'
import { LIST_MARK as MARK } from './text.ts'

/** The principles the judge reads a rule for. Testing is a run, not a reading. */
export const JUDGED = ['process', 'why', 'strict', 'earns', 'focused'] as const
export type Judged = (typeof JUDGED)[number]

/**
 * What the judge said of a rule: for each principle the probability it holds,
 * and how much the agent must hold to follow the rule, 0 (one step) to 3 (a
 * decision tree written as prose).
 */
export interface RuleJudgment extends Record<Judged, number> {
  complexity: number
}

/** A principle holds above this and drifts below `DRIFTS`; between, the judge could not tell. */
const HOLDS = 0.7
const DRIFTS = 0.3
/**
 * Complexity is a mean over four levels. A clean two-sentence rule lands
 * between 1 and 1.5, a tree written as prose near 2.4 (jev-1.14.0, 2026-11-07),
 * so a maybe starts here and a sure finding half a level higher.
 */
const COMPLEX_FROM = 2.25

const JUDGE_MESSAGE: Record<Judged, string> = {
  process: 'Jev reads this as a quality the result should have, not a step the agent takes.',
  why: 'Jev finds no reason in the rule: nothing says what goes wrong without it.',
  strict: 'Jev finds no boundary: no number, no always or never.',
  earns: 'Jev thinks an agent that never read this line would do the same work.',
  focused: 'Jev reads this as about another aspect than the skill’s description names.',
}

const MAYBE_MESSAGE: Record<Judged, string> = {
  process: 'Jev is unsure this names a step the agent can take.',
  why: 'Jev is unsure the reason is here.',
  strict: 'Jev is unsure where the line is.',
  earns: 'Jev is unsure the agent would act any differently without this line.',
  focused: 'Jev is unsure this belongs to the skill’s one aspect.',
}

/** The findings a judgment makes: a drift, a maybe, and a tree in disguise. */
export function judgmentFindings(judgment: RuleJudgment): Finding[] {
  const out: Finding[] = []
  for (const principle of JUDGED) {
    const p = judgment[principle]
    if (p >= HOLDS) continue
    const drift = p < DRIFTS
    out.push({
      dimension: 'principle',
      principle,
      lead: principleGuide(principle).lead,
      message: drift ? JUDGE_MESSAGE[principle] : MAYBE_MESSAGE[principle],
      quote: null,
      source: drift ? 'judge' : 'maybe',
    })
  }
  if (judgment.complexity >= COMPLEX_FROM)
    out.push({
      dimension: 'complexity',
      principle: null,
      lead: 'Keep each rule walkable.',
      message:
        'Jev reads several conditions in one rule. Split them into a decision tree or numbered steps, so the agent takes one branch at a time.',
      quote: null,
      source: judgment.complexity >= COMPLEX_FROM + 0.5 ? 'judge' : 'maybe',
    })
  return out
}

/**
 * Code's findings and the judge's as one list: a principle code already
 * flagged is not flagged again by the judge, and a maybe is dropped when
 * anything sure stands on the same dimension.
 */
export function mergeFindings(code: Finding[], judged: Finding[]): Finding[] {
  const taken = new Set(code.map((f) => f.principle ?? f.dimension))
  const sure = judged.filter((f) => f.source === 'judge' && !taken.has(f.principle ?? f.dimension))
  for (const f of sure) taken.add(f.principle ?? f.dimension)
  const maybe = judged.filter((f) => f.source === 'maybe' && !taken.has(f.principle ?? f.dimension))
  return [...code, ...sure, ...maybe]
}

/** Whether the findings leave the model anything to fix: a maybe alone does not. */
export const drifts = (findings: Finding[]): boolean => findings.some((f) => f.source !== 'maybe')

/** The rule in its place, as every brief shows it. */
function sceneText(scene: RuleScene): string {
  return [
    scene.description ? `The skill's description: ${scene.description}` : '',
    scene.before ? tag('before', scene.before) : '',
    tag('selection', scene.selection),
    scene.after ? tag('after', scene.after) : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

const findingsText = (findings: Finding[]): string =>
  findings.map((f) => `- ${f.lead} ${f.message}${f.quote ? ` (“${f.quote}”)` : ''}`).join('\n')

/** How a rule is written here: the shape and the six principles, for any brief that writes one. */
const HOW = `A rule is ${RULE_SHAPE}\n- ${RULE_GUIDE.map((item) => `${item.lead} ${item.text}`).join('\n- ')}`

const BUDGET: Record<RuleScene['band'], string> = {
  fine: '',
  long: 'The file is long. The rewrite may not be longer than the selection.',
  over: 'The file is past its budget. The rewrite must be shorter than the selection.',
}

const REPLACES = `Your text replaces the selection as it is, so it holds only the new text of the selection: the same list markers and heading level as the lines around it, no greeting, no explanation, no code fence. Keep every fact, number and condition the selection holds unless a finding says it is the problem.`

/** The reply's shape for Auto refine: the one revision. */
export const REFINE_SCHEMA = {
  type: 'object',
  properties: {
    revision: {
      type: 'string',
      description: 'The new text of the selection, complete, and nothing else.',
    },
  },
  required: ['revision'],
  additionalProperties: false,
} as const

/** What Auto refine asks once the checks have found drift. */
export function refinePrompt(
  scene: RuleScene,
  findings: Finding[],
): { system: string; user: string } {
  const system = `You rewrite one passage of a SKILL.md in Skill Studio. ${APP}

${HOW}

The checks have already said what is wrong; your job is to fix exactly that and nothing more. ${REPLACES} ${BUDGET[scene.band]}`.trim()
  const user = `${sceneText(scene)}\n\nWhat is wrong with the selection:\n${findingsText(findings)}`
  return { system, user }
}

const parse = (raw: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === 'object') return value as Record<string, unknown>
  } catch {
    // fall through
  }
  throw new Error('The model’s reply was cut off or malformed. Try again.')
}

/** The revision from a finished Auto refine reply. Throws when there is none. */
const LIST_MARK = new RegExp(`^[ \\t]*${MARK}[ \\t]+`)

/**
 * `text` with the list mark the selection starts with, when the model left it
 * off: a rule replaced without its dash stops being a rule.
 */
/** `text` without the list mark it opens with, as a reader sees the rule in the editor. */
export const withoutListMark = (text: string): string => text.replace(LIST_MARK, '')

export function keepListMark(selection: string, text: string): string {
  const mark = LIST_MARK.exec(selection)?.[0]
  return mark && !LIST_MARK.test(text) ? `${mark}${text}` : text
}

export function refineText(raw: string): string {
  const { revision } = parse(raw)
  const text = typeof revision === 'string' ? revision.trim() : ''
  if (!text) throw new Error('The model returned no revision. Try again.')
  return text
}

/** Auto refine's answer: what was found, whether the judge read it, and the revision on its way when anything drifts. */
export interface RefineResult {
  findings: Finding[]
  /** Jev read the rule; false when no TypeSafe key is set, so only code's checks ran. */
  judged: boolean
  run: AiRun | null
}

/** The three rewrites, always in this order: correct first, then sharpen, then cut. */
export const REWRITE_KINDS = ['practice', 'direct', 'shorter'] as const
export type RewriteKind = (typeof REWRITE_KINDS)[number]

export const REWRITE_LABELS: Record<RewriteKind, { label: string; means: string }> = {
  practice: {
    label: 'Best practice',
    means: 'Fixes what the checks found',
  },
  direct: {
    label: 'More direct',
    means: 'Imperative, constraint first',
  },
  shorter: {
    label: 'Shorter',
    means: 'Same rule, fewer words',
  },
}

export const REWRITES_SCHEMA = {
  type: 'object',
  properties: {
    practice: {
      type: 'string',
      description:
        'The selection with every finding fixed: a number or absolute where it was vague, the why where it was missing, a step where it named a quality. Meaning kept.',
    },
    direct: {
      type: 'string',
      description:
        'The selection in the imperative, the constraint first and soft verbs out. Same facts, about the same length.',
    },
    shorter: {
      type: 'string',
      description:
        'The selection with every word that changes nothing cut. The why and the number stay. Fewer words than the selection.',
    },
  },
  required: ['practice', 'direct', 'shorter'],
  additionalProperties: false,
} as const

/** What Suggest changes asks: three rewrites, each with its own job. */
export function rewritesPrompt(
  scene: RuleScene,
  findings: Finding[],
): { system: string; user: string } {
  const system = `You write three rewrites of one passage of a SKILL.md in Skill Studio. ${APP}

${HOW}

The three rewrites:
- practice: fix what the checks found and nothing more. Where nothing was found, apply the principles above to what is there.
- direct: the same facts in the imperative, the constraint first, soft verbs ("try to", "should", "consider") out. About the same length.
- shorter: cut every word that changes what the agent does by nothing. Keep the why and every number. Fewer words than the selection.

${REPLACES} ${BUDGET[scene.band]}`.trim()
  const user = `${sceneText(scene)}\n\n${
    findings.length
      ? `What the checks found:\n${findingsText(findings)}`
      : 'The checks found nothing wrong.'
  }`
  return { system, user }
}

export type Rewrites = Record<RewriteKind, string>

/** The three rewrites from a finished reply. Throws when one is missing. */
export function rewritesOf(raw: string): Rewrites {
  const value = parse(raw)
  const out = {} as Rewrites
  for (const kind of REWRITE_KINDS) {
    const text = value[kind]
    if (typeof text !== 'string' || !text.trim())
      throw new Error(`The model returned no “${REWRITE_LABELS[kind].label}” rewrite. Try again.`)
    out[kind] = text.trim()
  }
  return out
}

/** What the judge said of one rewrite, and what code checked. */
export interface RewriteVerdict {
  /** Probability the rewrite keeps every fact of the selection; null when not judged. */
  kept: number | null
  /** Principles the rewrite still drifts on, as the judge read it: `practice` only. */
  drift: Finding[]
  /** Fewer words than the selection: `shorter` only. */
  shorter: boolean | null
}

/** Suggest changes' answer, carried as the run's text. */
export interface RewritesResult {
  rewrites: Rewrites
  verdicts: Record<RewriteKind, RewriteVerdict>
  /** Jev read each rewrite against the selection; false without a key, or when Jev could not be reached. */
  judged: boolean
}

export const rewritesText = (result: RewritesResult): string => JSON.stringify(result)

/** A finished Suggest changes run's text as its result. */
export function rewritesResult(text: string): RewritesResult {
  const value = parse(text)
  const rewrites = value.rewrites as Rewrites
  const verdicts = value.verdicts as RewritesResult['verdicts']
  if (!rewrites || !verdicts) throw new Error('The rewrites could not be read. Ask again.')
  return { rewrites, verdicts, judged: value.judged === true }
}

/** The verdicts code alone can give: whether `shorter` is shorter. */
export function codeVerdicts(scene: RuleScene, rewrites: Rewrites): RewritesResult['verdicts'] {
  const empty = (): RewriteVerdict => ({ kept: null, drift: [], shorter: null })
  return {
    practice: empty(),
    direct: empty(),
    shorter: { ...empty(), shorter: wordCount(rewrites.shorter) < wordCount(scene.selection) },
  }
}

/** A rewrite that changes something: the selection again has nothing to replace. */
export const offerable = (scene: RuleScene, text: string): boolean =>
  text.trim() !== scene.selection.trim()

/**
 * Jev read the rewrite as dropping a fact of the selection. A warning, never
 * a gate: the writer reads both and their pick stands.
 */
export const dropsFact = (verdict: RewriteVerdict): boolean =>
  verdict.kept !== null && verdict.kept < DRIFTS

/**
 * Help me improve walks these in this order. Each step is one question the
 * model asks in its own words, and one yes/no the judge answers about the
 * reply, so code decides when to move on. `when` says which steps are always
 * asked and which only when a finding stands on them.
 */
export interface ImproveStep {
  id: Principle | 'complexity' | 'length'
  /** The question, for the model to put to the writer in one or two sentences. */
  ask: string
  /** The question the judge answers about the writer's reply: did it give what was asked? */
  answered: string
  when: 'unless-holds' | 'flagged'
}

const IMPROVE_STEPS: readonly ImproveStep[] = [
  {
    id: 'earns',
    ask: 'After reading this line, what does the agent do differently? If the honest answer is nothing, say so.',
    answered: 'Does `answer` name something the agent does differently because of `rule`?',
    when: 'unless-holds',
  },
  {
    id: 'process',
    ask: 'Is this a step the agent takes, or a quality you want the result to have? If a quality, what would the agent do to get it?',
    answered:
      'Does `answer` describe an action or decision the agent carries out, rather than a quality of the result?',
    when: 'unless-holds',
  },
  {
    id: 'complexity',
    ask: 'This rule holds several conditions. Which one is decided first, and what follows from each answer?',
    answered:
      'Does `answer` say which condition comes first, or lay out the conditions in an order?',
    when: 'flagged',
  },
  {
    id: 'strict',
    ask: 'Where is the line: how many, how long, how often, or always or never?',
    answered: 'Does `answer` give a number, a unit, or the word always, never or only?',
    when: 'unless-holds',
  },
  {
    id: 'why',
    ask: 'What goes wrong without this rule? One sentence is enough: it goes in the same bullet.',
    answered: 'Does `answer` say what goes wrong, or what the rule prevents?',
    when: 'unless-holds',
  },
  {
    id: 'focused',
    ask: 'Does this belong in this skill, or in another skill or a reference file? The description says what this skill is about.',
    answered: 'Does `answer` say where the rule belongs?',
    when: 'flagged',
  },
  {
    id: 'length',
    ask: 'The file is long. What here can the agent already be assumed to know, so it can go?',
    answered: 'Does `answer` name something that can be cut, or say nothing can?',
    when: 'flagged',
  },
]

export type ImproveStepId = ImproveStep['id']

/** The judge's question about the first answer: the writer said the line does nothing, so the draft deletes it. */
export const CUT_QUESTION =
  'Does `answer` say the rule changes nothing, does no work, or should be removed?'

/** The most times one question is put before the walk moves on anyway. */
const ASKS_MAX = 2

const stepById = (id: ImproveStepId): ImproveStep =>
  IMPROVE_STEPS.find((s) => s.id === id) ?? IMPROVE_STEPS[0]

/**
 * The steps to walk for this rule: the ones its findings stand on, and every
 * unless-holds step the judge did not clear. Without a judgment nothing is
 * cleared, so all five principle questions are asked.
 */
export function planImprove(findings: Finding[], judgment: RuleJudgment | null): ImproveStepId[] {
  const flagged = new Set(findings.map((f) => f.principle ?? f.dimension))
  return IMPROVE_STEPS.filter((step) => {
    if (flagged.has(step.id)) return true
    if (step.when === 'flagged') return false
    const p = judgment?.[step.id as Judged]
    // Anything that is not a sure hold is asked about: a missing answer and one that is not a number too.
    return !(p !== undefined && p >= HOLDS)
  }).map((step) => step.id)
}

/** The side panel's improve conversation, scoped to one selection. */
export interface ImproveThread {
  /** The rule as it stands in the file now: a draft put in place becomes the selection the next reply works on. */
  scene: RuleScene
  /** ISO time the conversation was opened. */
  opened: string
  /**
   * Whether the writer asked to be walked through the questions; null until
   * their first message. Nothing is asked of the model before that message.
   */
  walked: boolean | null
  /** What the checks found in the rule, once read; drafts fix these where the writer did not ask otherwise. */
  findings: Finding[]
  /** The steps planned for this rule, in order. Empty until the writer's first message. */
  steps: ImproveStepId[]
  /** Index of the step in hand; `steps.length` once the draft is due. */
  at: number
  /** Times the step in hand has been put. */
  asks: number
  /** The writer said the line does nothing: the draft deletes it. */
  cut: boolean
  /** The conversation, starting with the writer's first message. */
  messages: ChatMessage[]
  run: AiRun | null
  /** The latest draft the model wrote, as text that replaces the selection. */
  draft: string | null
  /** What the judge said of the draft, as a checklist; null before a draft or without a judge. */
  checklist: ChecklistItem[] | null
  /** Jev reads the answers and the draft; false when no TypeSafe key is set. */
  judged: boolean
}

export const drafting = (thread: Pick<ImproveThread, 'steps' | 'at'>): boolean =>
  thread.at >= thread.steps.length

/** The step in hand, null once the draft is due. */
export const currentStep = (thread: Pick<ImproveThread, 'steps' | 'at'>): ImproveStep | null =>
  drafting(thread) ? null : stepById(thread.steps[thread.at])

/** The judge's reading of a reply: whether it answered the step, and, on the first, whether it says the line does nothing. */
export interface AnswerReading {
  answered: number
  cut: number | null
}

type Walk = Pick<ImproveThread, 'at' | 'asks' | 'cut'>

/**
 * Where the walk stands after a reply to the step in hand. A reply the judge
 * read as saying the line does nothing goes straight to a draft that deletes
 * it. One it read as no answer has the question put once more, up to
 * `ASKS_MAX` times in all; any other reply moves on. Without the judge's
 * reading (`null`), every reply counts as an answer.
 */
export function walkAfter(
  thread: Pick<ImproveThread, 'steps'> & Walk,
  reading: AnswerReading | null,
): Walk {
  const { at, asks, cut } = thread
  if (reading !== null && reading.cut !== null && reading.cut >= HOLDS)
    return { at: thread.steps.length, asks, cut: true }
  if (cut) return { at, asks, cut }
  const again = reading !== null && reading.answered < DRIFTS && asks + 1 < ASKS_MAX
  return again ? { at, asks: asks + 1, cut } : { at: at + 1, asks: 0, cut }
}

const FENCED = /```[a-z]*\n([\s\S]*?)```/g

/** The draft in a reply: the last fenced block. */
export function draftOf(text: string): string | null {
  const blocks = [...text.matchAll(FENCED)]
  const last = blocks.at(-1)?.[1]?.trim()
  return last || null
}

/**
 * A reply as the panel shows it: the prose before the draft, the draft, and
 * the prose after. `writing` is a draft whose block is still arriving, so the
 * panel holds its place without showing half a rule. A reply with no draft is
 * all `before`.
 */
export interface DraftReply {
  before: string
  draft: string | null
  writing: boolean
  after: string
}

export function draftReply(text: string): DraftReply {
  const last = [...text.matchAll(FENCED)].at(-1)
  const end = last ? (last.index ?? 0) + last[0].length : 0
  const open = text.slice(end).search(/(^|\n)```/)
  if (open !== -1)
    return { before: text.slice(0, end + open).trim(), draft: null, writing: true, after: '' }
  if (!last) return { before: text.trim(), draft: null, writing: false, after: '' }
  return {
    before: text.slice(0, last.index).trim(),
    draft: last[1].trim(),
    writing: false,
    after: text.slice(end).trim(),
  }
}

/**
 * How a draft is laid out. A draft is an offer: nothing in the file changes
 * until the writer applies it, so the reply never says it changed anything.
 * The conversation is a workshop, so a reply does not close it with a
 * question; it offers one next step only when it has one worth taking.
 */
const DRAFT_FORMAT = `Put the draft in one fenced code block (three backticks, no language) holding only the text that replaces the selection, with the same list markers as the lines around it. Before the block, one sentence on what this draft would change, as an offer: the file changes only if the writer applies it, so never say you changed, replaced, rewrote or added anything. After the block, write nothing, unless there is one thing worth the writer's next move: a guess the draft made that only they can confirm, or one further change worth trying. Then say it in one sentence. Never ask whether the draft says what they meant, and never ask them to approve it.`

/** What a reply does once a draft stands: answer a question, or write the whole draft again. */
const AFTER_DRAFT =
  'A draft stands. Read what the writer said last: if it is a question, answer it in one to three sentences and write no draft; if it asks for a change, write the whole draft again with it.'

/** The brief for the next reply in an improve conversation: the rule, the walk so far, and the one thing to do now. */
export function improveSystem(
  thread: Pick<
    ImproveThread,
    'scene' | 'steps' | 'at' | 'asks' | 'cut' | 'walked' | 'findings' | 'draft'
  >,
): string {
  const step = currentStep(thread)
  const parts = [
    `You are helping a writer improve one rule of a SKILL.md in Skill Studio. ${APP} You put a question only when told to, in one or two plain sentences, and otherwise write drafts of the rule. You never lecture: the writer knows their craft, you know how a rule has to be shaped for an agent.`,
    HOW,
    VOICE,
    sceneText(thread.scene),
  ]
  if (thread.draft !== null)
    parts.push(
      'The selection above is the rule as it stands in the file now. If the writer put a draft in place, it is that draft.',
    )
  if (step)
    parts.push(
      `Ask now, in your own words and in one or two sentences, with no preamble: ${step.ask}${
        thread.asks > 0
          ? ' The last answer did not give this yet; ask once more, more concretely, and offer an example of the kind of answer you need.'
          : ''
      } Do not write the draft yet.`,
    )
  else if (thread.cut && thread.draft === null)
    parts.push(
      `The writer said this line changes nothing. Propose deleting it: say so in one sentence, and ${DRAFT_FORMAT.replace('holding only the text that replaces the selection', 'that is empty, since the selection goes')}`,
    )
  else {
    const from =
      thread.draft !== null
        ? `${AFTER_DRAFT} A new draft:`
        : thread.walked && thread.steps.length
          ? 'Every question is answered. Write the draft now from the answers:'
          : 'Write the draft now from what the writer asked:'
    parts.push(`${from} ${RULE_SHAPE} ${DRAFT_FORMAT}`)
    if (thread.findings.length && thread.draft === null)
      parts.push(
        `What the checks found in the selection, for you alone: fix these too, unless the writer asked otherwise, and never quote them or say where they came from:\n${findingsText(thread.findings)}`,
      )
  }
  if (thread.scene.band !== 'fine') parts.push(BUDGET[thread.scene.band])
  return parts.join('\n\n')
}

/** One line of the checklist under a draft: a principle, and whether the judge saw it held. */
export interface ChecklistItem {
  principle: Judged
  lead: string
  held: boolean
  /** What is still missing when it does not hold. */
  message: string | null
}

/** The judge's reading of a draft as the checklist the panel shows: one line per principle. */
export function checklistOf(judgment: RuleJudgment): ChecklistItem[] {
  return JUDGED.map((principle) => {
    const held = judgment[principle] >= HOLDS
    return {
      principle,
      lead: principleGuide(principle).lead,
      held,
      message: held ? null : JUDGE_MESSAGE[principle],
    }
  })
}
