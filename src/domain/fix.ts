/**
 * Fix with AI: a change to one rule an answer broke, drafted from a short
 * sheet of evidence in one message. The sheet holds the rule as SKILL.md
 * writes it, the request the case made, the verdict (who marked the answer,
 * and for a rule code checked, what code saw), and what the answer wrote, cut
 * to a budget. The reply says in one sentence what went wrong and gives the
 * rule's new text, which takes the rule's place in SKILL.md when the writer
 * applies it. Where the answer did follow the rule and only the reading of it
 * was wrong, the rule comes back unchanged, and the sentence says so.
 *
 * A revision is held to the checks Auto refine holds one to, and to whether
 * it still asks what the rule asks (`FixCheck`). One that fails them is sent
 * back once, with what they found (`fixPrompt` with `again`).
 */
import { APP_INTRO, tag } from './assist.ts'
import { findingsText, keepListMark, withoutListMark } from './improve.ts'
import { type Finding, type RuleScene, sceneOf } from './lint.ts'
import type { Verdict } from './pack.ts'
import { scanRules } from './rules.ts'
import { RULE_GUIDE, RULE_SHAPE } from './templates.ts'
import { metaText, normalizeNewlines, readFrontMatter } from './text.ts'

/** The answer's files the sheet holds, all together: about 6,000 tokens. */
export const ANSWER_BUDGET = 24_000

/**
 * What a fix is refused with when the answer, as its grading stands now, follows the rule or the
 * rule is set aside. Nothing went wrong, so the popover says it plainly and offers only Close.
 */
export const NOTHING_TO_FIX =
  'This answer no longer counts as breaking this rule, so there is nothing to fix.'
/** No one file takes more than this, so a long page leaves room for the files beside it. */
const FILE_MAX = 16_000
/** The request's own share: one that carries a project's files is cut, not left out. */
const REQUEST_MAX = 16_000
/**
 * The verdict's share. Who marked the answer always stays; what code saw
 * past it is left out a test at a time, the last test first, and the sheet
 * says how many were.
 */
const VERDICT_MAX = 8_000

/** The rule as SKILL.md writes it, and the lines it takes there (1-based, as `scanRules` counts). */
export interface RuleSource {
  from: number
  to: number
  /** The lines, list mark and all. */
  text: string
  section: string
}

/** One of the answer's files, as the sheet holds it. */
export interface AnswerFile {
  path: string
  text: string
  /** Only its start is held. */
  cut: boolean
}

export interface FixSheet {
  rule: RuleSource
  /** What the agent was asked, word for word, with what the app adds to every request. */
  request: string
  /** The rule's verdict on the answer, as Results shows it; null when the grading kept none. */
  verdict: Verdict | null
  answer: readonly AnswerFile[]
}

/** The reply's shape. */
export const FIX_SCHEMA = {
  type: 'object',
  properties: {
    why: {
      type: 'string',
      description:
        'One plain sentence of 20 words or fewer: what in the answer broke the rule, naming the concrete thing, or that the answer did follow it.',
    },
    revision: {
      type: 'string',
      description:
        "The rule's complete new text, list mark and all, or the rule unchanged when no change to it would help.",
    },
  },
  required: ['why', 'revision'],
  additionalProperties: false,
} as const

/** The reply's shape when a revision is sent back: its new text alone, since what went wrong stands. */
export const FIX_AGAIN_SCHEMA = {
  type: 'object',
  properties: {
    revision: FIX_SCHEMA.properties.revision,
  },
  required: ['revision'],
  additionalProperties: false,
} as const

/** A finished draft: what went wrong, and the rule's new text. */
export interface FixDraft {
  why: string
  revision: string
}

/**
 * What the checks found in a revision: what code and Jev still find open in
 * it (`openIn`), and whether Jev is sure an agent following it would no longer
 * be following the rule (`keptQuestion`, read as `dropsFact` reads it). False
 * where Jev did not read it.
 */
export interface FixCheck {
  open: Finding[]
  dropped: boolean
  /** Jev read the revision: false with no key, or when Jev could not be reached. */
  judged: boolean
}

/** How much a check found: a revision is sent back when this is above 0, and of two, the one with less is kept. */
export const faultsOf = (check: FixCheck): number => check.open.length + (check.dropped ? 1 : 0)

/** A revision sent back: the draft it came in, and what the checks found in it. */
export interface FixAgain {
  draft: FixDraft
  check: FixCheck
}

/**
 * Where `ruleText`, as a verdict names it, stands in SKILL.md now. Null when
 * no rule there reads so any more: it was edited or removed since the run.
 */
export function ruleSource(skillMd: string, ruleText: string): RuleSource | null {
  const scan = scanRules(skillMd)
  const at = scan.rules.findIndex((rule) => rule.text === ruleText)
  if (at < 0) return null
  const { from, to } = scan.spans[at]
  const lines = normalizeNewlines(skillMd).split('\n')
  return {
    from,
    to,
    text: lines.slice(from - 1, to).join('\n'),
    section: scan.rules[at].section,
  }
}

/**
 * The rule in its place, as the checks and Jev read a rule (`RuleScene`): the
 * lines around it, the skill's description and the file's size.
 */
export function fixScene(skillMd: string, source: RuleSource): RuleScene {
  const text = normalizeNewlines(skillMd)
  const from = text
    .split('\n')
    .slice(0, source.from - 1)
    .reduce((at, line) => at + line.length + 1, 0)
  const description = metaText(readFrontMatter(text).meta, 'description') ?? ''
  const { selection, before, after, band } = sceneOf(
    text,
    { from, to: from + source.text.length },
    description,
  )
  return { selection, before, after, description, band }
}

/** SKILL.md with the rule's lines replaced by `revision`, in the file's own line endings. */
export function replaceRule(skillMd: string, source: RuleSource, revision: string): string {
  const crlf = skillMd.includes('\r\n')
  const lines = normalizeNewlines(skillMd).split('\n')
  const next = keepListMark(source.text, normalizeNewlines(revision).trim())
  lines.splice(source.from - 1, source.to - source.from + 1, ...next.split('\n'))
  const text = lines.join('\n')
  return crlf ? text.replace(/\n/g, '\r\n') : text
}

/**
 * The answer's files within the budget, in the order given: each cut to its
 * share, and a file past the budget left out. Pictures are not text, so the
 * caller leaves them out before.
 */
export function sheetFiles(
  files: ReadonlyArray<{ path: string; text: string }>,
  budget = ANSWER_BUDGET,
): AnswerFile[] {
  const held: AnswerFile[] = []
  let left = budget
  for (const file of files) {
    if (left <= 0) break
    const room = Math.min(left, FILE_MAX)
    const cut = file.text.length > room
    const text = cut ? file.text.slice(0, room) : file.text
    held.push({ path: file.path, text, cut })
    left -= text.length
  }
  return held
}

const HOW = `A rule is ${RULE_SHAPE}\n- ${RULE_GUIDE.map((item) => `${item.lead} ${item.text}`).join('\n- ')}`

const NO_VERDICT = 'No verdict was kept for this rule: find in the answer what broke it.'

/** Who marked the answer as breaking the rule, as the verdict says it. */
const WHO = {
  reader:
    'The person who wrote the skill marked the answer as breaking the rule, from reading it themselves.',
  code: 'Code marked the answer as breaking the rule, by checking it with fixed tests.',
  jev: 'Jev, a model that reads answers, marked the answer as breaking the rule, and gave no reason.',
} as const

/** Said where the person or code marked it and Jev had not. */
const JEV_MET = 'Jev had read the answer as following the rule.'

/**
 * What the verdict says, for the sheet: who marked the answer as breaking the
 * rule, and for a rule code checked, each test and what it saw, as grading
 * kept them (`CodeAnswer`), so the model starts from what was counted or
 * found rather than searching the answer for it.
 */
function verdictText(verdict: Verdict | null): string {
  if (!verdict?.by) return NO_VERDICT
  const who = WHO[verdict.by]
  const who2 = verdict.by !== 'jev' && verdict.jev === true ? `${who} ${JEV_MET}` : who
  const code = verdict.code
  if (!code?.stands || !code.saw.length) return who2
  const head = [
    who2,
    `${verdict.by === 'code' ? 'Each test' : 'Code checked it too. Each test'} and what it saw, one to a line, as JSON:`,
  ].join('\n')
  const lines = code.saw.map((seen, i) => inertJson({ test: code.tests[i] ?? null, saw: seen }))
  let text = head
  for (const [i, line] of lines.entries()) {
    const cut = `\n[cut here: ${lines.length - i} of ${lines.length} tests left out]`
    const room = VERDICT_MAX - (i === lines.length - 1 ? 0 : cut.length)
    if (text.length + 1 + line.length > room) return `${text}${cut}`
    text = `${text}\n${line}`
  }
  return text
}

/**
 * JSON with `<`, `>` and `&` written as escapes: what code saw quotes the
 * answer, a page's own names among it, so a `</verdict>` in it cannot close
 * the sheet's section. It reads back as the same JSON.
 */
const inertJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

/** What a revision sent back is told: what broke the rule, the revision, and what the checks still find in it. */
function againText({ draft, check }: FixAgain): string {
  const found = [
    ...(check.open.length ? [findingsText(check.open)] : []),
    ...(check.dropped
      ? [
          '- It no longer asks all the rule asks: it lets through something the rule forbids, leaves out something it requires, or changes a number it sets.',
        ]
      : []),
  ].join('\n')
  return [
    `What in the answer broke the rule: ${draft.why}`,
    tag('revision', draft.revision),
    `Your revision above was checked, and the checks found this in it:\n${found}`,
    "Write the rule's new text again with that fixed, changing nothing else. Where the answer broke the rule only by doing what the request asked, the request still wins.",
  ].join('\n\n')
}

/**
 * What Fix with AI asks. With `again`, the revision is sent back: the sheet
 * holds what the first reply said broke the rule in place of the answer's
 * files, and the reply is the rule's new text alone (`FIX_AGAIN_SCHEMA`).
 */
export function fixPrompt(sheet: FixSheet, again?: FixAgain): { system: string; user: string } {
  const system = `You fix one rule of a SKILL.md in Skill Studio. ${APP_INTRO} An agent answered a request with the skill, and the answer was marked as breaking the rule below. Start from the verdict: it says who marked the answer, and where code checked it, what code counted or found. Take what code saw as found, and read the answer for what the verdict does not say.

Then change the rule so an agent reading it would not do that again: say plainly what was left unclear, add the case the rule missed, or draw the line where it should be. Change only what the miss needs, and keep every other fact, number and condition the rule holds. Your text replaces the rule's lines as they are: the same list mark, no heading, no code fence, no other rule.

The request is what the agent was given, word for word, with the instructions the app adds to every request. Whatever it asks for, a file, a step or a format, is part of the answer and never extra. If the answer broke the rule only by doing what the request asked, make the rule say the request wins; never forbid what the request asks for.

If the answer did follow the rule, and only the marking was wrong, return the rule unchanged and say so. A mark the person made stands: they read the answer themselves.

${HOW}

Write "why" for someone who does not write code: one sentence, 20 words or fewer, naming the thing in the answer (a file, a line, a word), never how the app works.`
  const answer = sheet.answer.length
    ? sheet.answer
        .map((file) =>
          tag(
            'file',
            file.cut ? `${file.text}\n[cut here: the file goes on]` : file.text,
            file.path,
          ),
        )
        .join('\n\n')
    : 'The answer wrote no file that can be read as text.'
  const user = [
    tag('rule', sheet.rule.text, sheet.rule.section),
    tag(
      'request',
      sheet.request.length > REQUEST_MAX
        ? `${sheet.request.slice(0, REQUEST_MAX)}\n[cut here: the request goes on]`
        : sheet.request,
    ),
    tag('verdict', verdictText(sheet.verdict)),
    again ? againText(again) : tag('answer', answer),
  ].join('\n\n')
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

/** The draft from a finished reply, with the rule's list mark kept. Throws when it holds none. */
export function fixDraftOf(raw: string, rule: RuleSource): FixDraft {
  const { why, revision } = parse(raw)
  const text = typeof revision === 'string' ? revision.trim() : ''
  const said = typeof why === 'string' ? why.trim() : ''
  if (!text || !said) throw new Error('The model returned no fix. Try again.')
  return { why: said, revision: keepListMark(rule.text, text) }
}

/** A sent-back revision's new text, with the rule's list mark kept. Throws when the reply holds none. */
export function fixRevisionOf(raw: string, rule: RuleSource): string {
  const { revision } = parse(raw)
  const text = typeof revision === 'string' ? revision.trim() : ''
  if (!text) throw new Error('The model returned no fix. Try again.')
  return keepListMark(rule.text, text)
}

/** The draft as a finished run carries it. */
export const fixText = (draft: FixDraft): string => JSON.stringify(draft)

/** A finished run's draft, as the page reads it. Null when its text is not one. */
export function readFixText(text: string): FixDraft | null {
  try {
    const value = JSON.parse(text) as Partial<FixDraft>
    return typeof value.why === 'string' && typeof value.revision === 'string'
      ? { why: value.why, revision: value.revision }
      : null
  } catch {
    return null
  }
}

/** The draft changes nothing: the answer followed the rule as it stands. */
export const unchanged = (rule: RuleSource, draft: FixDraft): boolean =>
  normalizeNewlines(rule.text).trim() === normalizeNewlines(draft.revision).trim()

/** The version a fix's run keeps, named by what was fixed: the rule's first six words. */
export function fixVersionName(rule: string): string {
  const words = withoutListMark(rule).replace(/[*_`]/g, '').split(/\s+/).filter(Boolean)
  const head = words
    .slice(0, 6)
    .join(' ')
    .replace(/[,;:.]+$/, '')
  return `Fix: ${head}${words.length > 6 ? '…' : ''}`
}
