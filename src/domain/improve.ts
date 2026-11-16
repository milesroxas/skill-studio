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
import { type Finding, lintRule, proseWords, type RuleScene, ruleCount } from './lint.ts'
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

/** Whether the checks are sure of anything in the rule: a maybe alone is not a finding. */
export const drifts = (findings: Finding[]): boolean => findings.some((f) => f.source !== 'maybe')

/**
 * A finding new words can fix: a sure one about how the rule is written. A
 * maybe is not sure. A line that changes nothing (`earns`) or belongs to
 * another skill (`focused`) is wrong for being there, however it is worded,
 * and the file's length is not this rule's to fix.
 */
const fixable = (f: Finding): boolean =>
  f.source !== 'maybe' &&
  f.dimension !== 'file' &&
  f.principle !== 'earns' &&
  f.principle !== 'focused'

/** The findings a rewrite is asked to fix, and is held to once it is written. */
export const toFix = (findings: Finding[]): Finding[] => findings.filter(fixable)

/**
 * What a rewrite still leaves open: what code finds in it, rule by rule, and
 * what Jev was sure of when it read the rewrite, when it did. Empty means the
 * rewrite does what it was asked.
 */
export const openIn = (text: string, judgment: RuleJudgment | null): Finding[] =>
  toFix(mergeFindings(lintRule(text), judgment ? judgmentFindings(judgment) : []))

/** Jev's questions are about one rule: a rewrite that became several is read by code alone. */
export const oneRule = (text: string): boolean => ruleCount(text) <= 1

/** What a rule still needs, by the finding that says so, as the words after "Still needs". */
const NEEDS: Record<string, string> = {
  process: 'a step to take',
  why: 'a reason',
  strict: 'a number, or an always or never',
  complexity: 'one thing to a rule',
}

/**
 * What a rewrite could not supply, each thing once, for the line under it:
 * "a reason", "a number, or an always or never". Only the writer knows these,
 * so the line sends them to Help me improve, which asks.
 */
export const needsOf = (open: Finding[]): string[] => [
  ...new Set(open.map((f) => NEEDS[f.principle ?? f.dimension]).filter(Boolean)),
]

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
  long: 'The file is long. Add no word the fix does not need.',
  over: 'The file is past its budget. Add no word the fix does not need, and cut any that does no work.',
}

const REPLACES = `Your text replaces the selection as it is, so it holds only the new text of the selection: the same list markers and heading level as the lines around it, no greeting, no explanation, no code fence. Keep every fact, number and condition the selection holds unless a finding says it is the problem. A rule is as long as what it says needs: never drop a fact to save words, and never add a word that changes nothing. Where a finding says the rule asks for several things, write one top-level bullet for each, every one with its own why.`

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

/**
 * What Auto refine asks once the checks have found something to fix. `findings`
 * are the ones a rewrite can fix (`toFix`). With `again`, the selection is a
 * first revision that left them open, and this is the one more try.
 */
export function refinePrompt(
  scene: RuleScene,
  findings: Finding[],
  again = false,
): { system: string; user: string } {
  const system = `You rewrite one passage of a SKILL.md in Skill Studio. ${APP}

${HOW}

The checks have already said what is wrong; your job is to fix exactly that and nothing more. ${REPLACES} ${BUDGET[scene.band]}`.trim()
  const user = `${sceneText(scene)}\n\n${
    again
      ? 'The selection is a rewrite that was meant to fix these and did not. Fix them now, changing nothing else'
      : 'What is wrong with the selection'
  }:\n${findingsText(findings)}`
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

/**
 * Auto refine's answer: what was found, whether the judge read it, and the
 * revision on its way when a rewrite can fix any of it. With no run, either
 * nothing is wrong, or what is wrong is not a matter of wording.
 */
export interface RefineResult {
  findings: Finding[]
  /** Jev read the rule; false when no TypeSafe key is set, so only code's checks ran. */
  judged: boolean
  run: AiRun | null
}

/** A finished revision, as the run's text carries it: the new text, and what it still leaves open. */
export interface Revision {
  text: string
  /** What the checks still find in the revision, after one more try. Empty when it holds. */
  open: Finding[]
}

export const revisionText = (revision: Revision): string => JSON.stringify(revision)

/** A finished Auto refine run's text as its revision. */
export function revisionOf(text: string): Revision {
  const value = parse(text)
  if (typeof value.text !== 'string' || !value.text.trim())
    throw new Error('The revision could not be read. Ask again.')
  return { text: value.text, open: Array.isArray(value.open) ? (value.open as Finding[]) : [] }
}

/**
 * The kinds of rewrite. Three are offered at a time, always in this order:
 * correct first, then sharpen, then the one that fits the rule (`kindsFor`).
 */
const REWRITE_KINDS = ['practice', 'direct', 'shorter', 'split'] as const
export type RewriteKind = (typeof REWRITE_KINDS)[number]

/**
 * The three rewrites offered for a selection. The third is the cut, unless
 * the selection is one rule the checks read as asking for several things or
 * holding several conditions: fewer words would not fix that, and one rule
 * for each would. Decided by code alone, so the cards are known before
 * anything is asked.
 */
export function kindsFor(scene: Pick<RuleScene, 'selection'>): RewriteKind[] {
  const several =
    ruleCount(scene.selection) === 1 &&
    lintRule(scene.selection).some((f) => f.dimension === 'complexity')
  return ['practice', 'direct', several ? 'split' : 'shorter']
}

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
  split: {
    label: 'Split up',
    means: 'One rule for each thing it asks',
  },
}

const REWRITE_FIELDS: Record<RewriteKind, string> = {
  practice:
    'The selection with every finding fixed: a number or absolute where it was vague, the why where it was missing, a step where it named a quality. Meaning kept.',
  direct:
    'The selection in the imperative, the constraint first and soft verbs out. Same facts, about the same length.',
  shorter:
    'The selection with every word that changes nothing cut, each thing said once, and one exact word where several stood for it. The why and every number stay. The selection unchanged when nothing can go.',
  split:
    'The selection as several top-level bullets, one for each thing it asks, each with its own why. Same facts.',
}

const REWRITE_BRIEFS: Record<RewriteKind, string> = {
  practice:
    'practice: fix what the checks found and nothing more. Where nothing was found, apply the principles above to what is there.',
  direct:
    'direct: the same facts in the imperative, the constraint first, soft verbs ("try to", "should", "consider") out. About the same length.',
  shorter:
    'shorter: make it exact, not merely brief. Cut every word that changes what the agent does by nothing, say each thing once, and put one exact word where several stand for it ("is able to" is "can"). Never trade a precise word for a vaguer short one. Keep the why, every number and every condition. A rule is as long as it needs to be: when no word can go without losing one of those, return the selection unchanged.',
  split:
    'split: one top-level bullet for each thing the selection asks, with the selection’s own list marker, each bullet with the why it needs. Keep the selection’s words where they still fit and add no fact. Conditions that only hold together stay in one bullet.',
}

/** The reply's shape for Suggest changes: the three rewrites `kinds` names. */
export const rewritesSchema = (kinds: readonly RewriteKind[]) =>
  ({
    type: 'object',
    properties: Object.fromEntries(
      kinds.map((kind) => [kind, { type: 'string', description: REWRITE_FIELDS[kind] }]),
    ),
    required: [...kinds],
    additionalProperties: false,
  }) as const

/** What Suggest changes asks: three rewrites, each with its own job. */
export function rewritesPrompt(
  scene: RuleScene,
  findings: Finding[],
  kinds: readonly RewriteKind[] = kindsFor(scene),
): { system: string; user: string } {
  const system = `You write three rewrites of one passage of a SKILL.md in Skill Studio. ${APP}

${HOW}

The three rewrites:
${kinds.map((kind) => `- ${REWRITE_BRIEFS[kind]}`).join('\n')}

${REPLACES} ${BUDGET[scene.band]}`.trim()
  const user = `${sceneText(scene)}\n\n${
    findings.length
      ? `What the checks found:\n${findingsText(findings)}`
      : 'The checks found nothing wrong.'
  }`
  return { system, user }
}

/** The rewrites of one reply, by kind: the three that were asked for. */
export type Rewrites = Partial<Record<RewriteKind, string>>

/** The rewrites `kinds` names from a finished reply. Throws when one is missing. */
export function rewritesOf(raw: string, kinds: readonly RewriteKind[]): Rewrites {
  const value = parse(raw)
  const out: Rewrites = {}
  for (const kind of kinds) {
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
  /** What the rewrite still leaves open, after one more try: `practice` only. */
  open: Finding[]
}

/** Suggest changes' answer, carried as the run's text. */
export interface RewritesResult {
  rewrites: Rewrites
  verdicts: Partial<Record<RewriteKind, RewriteVerdict>>
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

/** A verdict before anything has read the rewrite. */
export const noVerdict = (): RewriteVerdict => ({ kept: null, open: [] })

/**
 * Why a rewrite is not offered, in the words its card shows; null for one
 * there is something to pick in. Code decides it, so a card never offers what
 * its label does not hold: a Shorter that is no shorter, a Split up still in
 * one piece, or any rewrite that is the selection again.
 */
export function withheld(scene: RuleScene, kind: RewriteKind, text: string): string | null {
  const same = text.trim() === scene.selection.trim()
  if (kind === 'shorter' && (same || proseWords(text) >= proseWords(scene.selection)))
    return 'Nothing to cut. Every word here does work.'
  if (kind === 'split' && (same || ruleCount(text) <= ruleCount(scene.selection)))
    return 'Nothing to split. Its parts only hold together.'
  return same ? 'Same as the selection.' : null
}

/** A rewrite there is something to pick in. */
export const offerable = (scene: RuleScene, kind: RewriteKind, text: string): boolean =>
  withheld(scene, kind, text) === null

/**
 * What an offered rewrite did, counted by code, for the line under it: how
 * many words a Shorter cut, how many rules a Split up made. Null for the
 * kinds with nothing to count.
 */
export function measured(scene: RuleScene, kind: RewriteKind, text: string): string | null {
  if (kind === 'shorter') {
    const words = proseWords(text)
    return `${words} words, ${proseWords(scene.selection) - words} fewer`
  }
  if (kind === 'split') return `${ruleCount(text)} rules`
  return null
}

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
  id: Principle | 'complexity' | 'file'
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
    id: 'file',
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
  /** Jev could not read the writer's last answer, so it counted as one. */
  unread?: boolean
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

/** One line of the checklist under a draft: a point of the guide, and whether the draft misses it. */
export interface ChecklistItem {
  /** The principle, or the dimension of a finding that is no principle: several things in one rule, a filler phrase. */
  principle: Judged | Finding['dimension']
  lead: string
  /** False when code finds it missing, or Jev is sure it is: one Jev could not decide on is not a miss. */
  held: boolean
  /** What is still missing when it does not hold. */
  message: string | null
}

/**
 * How a draft stands against the guide, as the checklist the panel shows: one
 * line per principle, then what code finds that is no principle. It is read
 * by the checks that mark the rule in the editor once the draft is applied,
 * so a draft that "meets the guide" does not land with an amber number. A
 * draft misses a principle where code finds it missing or Jev is sure
 * (`DRIFTS`): one Jev could not decide on is not a miss.
 */
export function checklistOf(judgment: RuleJudgment, draft = ''): ChecklistItem[] {
  const code = lintRule(draft)
  const items: ChecklistItem[] = JUDGED.map((principle) => {
    const found = code.find((f) => f.principle === principle)
    const held = !found && judgment[principle] >= DRIFTS
    return {
      principle,
      lead: principleGuide(principle).lead,
      held,
      message: held ? null : (found?.message ?? JUDGE_MESSAGE[principle]),
    }
  })
  for (const f of code)
    if (!f.principle)
      items.push({ principle: f.dimension, lead: f.lead, held: false, message: f.message })
  return items
}
