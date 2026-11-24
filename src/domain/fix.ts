/**
 * Fix with AI: a change to one rule an answer broke, drafted from a short
 * sheet of evidence in one message. The sheet holds the rule as SKILL.md
 * writes it, the request the case made, and what the answer wrote, cut to a
 * budget. The reply says in one sentence what went wrong and gives the rule's
 * new text, which takes the rule's place in SKILL.md when the writer applies
 * it. Where the answer did follow the rule and only the reading of it was
 * wrong, the rule comes back unchanged, and the sentence says so.
 */
import { APP_INTRO, tag } from './assist.ts'
import { keepListMark, withoutListMark } from './improve.ts'
import { scanRules } from './rules.ts'
import { RULE_GUIDE, RULE_SHAPE } from './templates.ts'
import { normalizeNewlines } from './text.ts'

/** The answer's files the sheet holds, all together: about 6,000 tokens. */
export const ANSWER_BUDGET = 24_000
/** No one file takes more than this, so a long page leaves room for the files beside it. */
const FILE_MAX = 16_000
/** The request's own share: one that carries a project's files is cut, not left out. */
const REQUEST_MAX = 16_000

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

/** A finished draft: what went wrong, and the rule's new text. */
export interface FixDraft {
  why: string
  revision: string
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

export function fixPrompt(sheet: FixSheet): { system: string; user: string } {
  const system = `You fix one rule of a SKILL.md in Skill Studio. ${APP_INTRO} An agent answered a request with the skill, and the answer was marked as breaking the rule below. Read the answer and find what in it breaks the rule.

Then change the rule so an agent reading it would not do that again: say plainly what was left unclear, add the case the rule missed, or draw the line where it should be. Change only what the miss needs, and keep every other fact, number and condition the rule holds. Your text replaces the rule's lines as they are: the same list mark, no heading, no code fence, no other rule.

The request is what the agent was given, word for word, with the instructions the app adds to every request. Whatever it asks for, a file, a step or a format, is part of the answer and never extra. If the answer broke the rule only by doing what the request asked, make the rule say the request wins; never forbid what the request asks for.

If the answer did follow the rule, and only the marking was wrong, return the rule unchanged and say so.

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
    tag('answer', answer),
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
