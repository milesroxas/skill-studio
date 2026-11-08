/**
 * Changes the side panel's assistant proposes to the open skill. The model
 * writes each one as a fenced block in its reply. The panel shows the block as
 * a change the writer applies with one click, through the operations the
 * Editor, Cases and Versions screens use. The model never writes a file: the
 * writer's click does, and the backend checks every path and id as it does for
 * those screens. Pure data and functions.
 */
import { blankDraft, checkWeight, draftOf, newCheck } from './case-draft.ts'
import type { Case, CaseDraft } from './schemas.ts'
import { isSlug, slug } from './text.ts'

/**
 * A change opens and closes with four tildes. Not backticks: a SKILL.md often
 * holds a code fence, which would end a backtick block early.
 */
const CHANGE_FENCE = '~~~~'

/**
 * One check of a proposed case. `weight` is null when the block did not name
 * one: a saved check keeps the weight it has, and a new one gets 1.
 */
export interface CaseCheck {
  statement: string
  weight: number | null
}

export type SkillChange =
  /** The whole new text of SKILL.md or of a file under references/. */
  | { kind: 'file'; path: string; text: string }
  /** A case to add, or to replace when `id` names one the skill has. */
  | {
      kind: 'case'
      id: string
      title: string
      prompt: string
      expected: string
      checks: CaseCheck[]
    }
  /** Save the skill's files as they stand as the next version, under this name. */
  | { kind: 'version'; name: string }

export type ReplyPart =
  | { kind: 'prose'; text: string }
  | { kind: 'change'; change: SkillChange }
  /** A change still being written: its block has opened and not yet closed. */
  | { kind: 'writing'; label: string }

const OPENING = new RegExp(`^${CHANGE_FENCE}[ \\t]*(file|case|version)\\b[ \\t]*(.*)$`)
const isClosing = (line: string): boolean => line.trimEnd() === CHANGE_FENCE

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** A check of a case block: a statement alone, or an object that names its weight too. */
function checkOf(value: unknown): CaseCheck | null {
  if (typeof value === 'string')
    return value.trim() ? { statement: value.trim(), weight: null } : null
  const raw = record(value)
  const statement = text(raw.statement)
  return statement ? { statement, weight: checkWeight(raw.weight) } : null
}

/** A case block's JSON as a change, or null when it is not a case the Cases screen could save. */
function caseChange(body: string): SkillChange | null {
  let raw: Record<string, unknown>
  try {
    raw = record(JSON.parse(body))
  } catch {
    return null
  }
  const title = text(raw.title)
  const prompt = text(raw.prompt)
  const checks = (Array.isArray(raw.checks) ? raw.checks : [])
    .map(checkOf)
    .filter((check): check is CaseCheck => check !== null)
  const id = isSlug(text(raw.id)) ? text(raw.id) : slug(title, 40)
  if (!prompt || !id) return null
  return { kind: 'case', id, title, prompt, expected: text(raw.expected), checks }
}

function changeOf(kind: string, rest: string, body: string[]): SkillChange | null {
  if (kind === 'file') {
    const path = rest.trim()
    return path ? { kind: 'file', path, text: `${body.join('\n').trimEnd()}\n` } : null
  }
  if (kind === 'case') return caseChange(body.join('\n'))
  const name = body.join(' ').replace(/\s+/g, ' ').trim()
  return name ? { kind: 'version', name } : null
}

/** What the panel says while a block of this kind is still arriving. */
const writingLabel = (kind: string, rest: string): string =>
  kind === 'file' ? rest.trim() || 'New file' : kind === 'case' ? 'New case' : 'New version'

/**
 * A reply split into prose and changes, in order. A block that does not hold
 * up, such as a case whose JSON is malformed, stays in the prose as code, so
 * nothing broken is offered. `partial` is for a reply still being written: an
 * open block at its end is a change on its way, where a finished reply's open
 * block was cut off and stays as code.
 */
export function replyParts(reply: string, { partial = false } = {}): ReplyPart[] {
  const parts: ReplyPart[] = []
  let prose: string[] = []
  const flush = () => {
    const joined = prose.join('\n').trim()
    if (joined) parts.push({ kind: 'prose', text: joined })
    prose = []
  }
  const lines = reply.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const opening = OPENING.exec(lines[i])
    if (!opening) {
      prose.push(lines[i])
      continue
    }
    const [, kind, rest] = opening
    const end = lines.findIndex((line, k) => k > i && isClosing(line))
    const body = lines.slice(i + 1, end < 0 ? undefined : end)
    if (end < 0 && partial) {
      flush()
      parts.push({ kind: 'writing', label: writingLabel(kind, rest) })
      return parts
    }
    const change = end < 0 ? null : changeOf(kind, rest, body)
    if (change) {
      flush()
      parts.push({ kind: 'change', change })
    } else prose.push('```', ...body, '```')
    i = end < 0 ? lines.length : end
  }
  flush()
  return parts
}

/** The brief that teaches the model the blocks, from the same fence the parser reads. */
export const CHANGES_GUIDE = [
  'You can propose changes to the open skill. The reader applies each one with a button under it, and can undo it, so never tell them to copy or paste. Write each change as a block that opens and closes with a line of four tildes, outside any other fence:',
  `- A file: open with "${CHANGE_FENCE} file SKILL.md", or "${CHANGE_FENCE} file references/<name>.md" for a reference, then the whole new text of the file, never a part of it, then "${CHANGE_FENCE}". A new path creates the file. Only SKILL.md and files under references/ can be written.`,
  `- A case: open with "${CHANGE_FENCE} case", then one JSON object {"title": "…", "prompt": "…", "expected": "…", "checks": […]}, then "${CHANGE_FENCE}". Add "id" with an existing case's id to replace that case; leave it out to add a new one. A check is a string, or {"statement": "…", "weight": 2} for one that counts double. A string keeps the weight the saved check has, so to change one, write the case again with every check and the new weight on that one.`,
  `- A version: "${CHANGE_FENCE} version", one line naming the version, such as "Before the voice rewrite", then "${CHANGE_FENCE}". It saves the skill's files as they stand. Put it before a file change when the reader will want to compare the two later.`,
  "You make no change yourself, so never say you made one or will make one: say what each change does. Keep that outside the blocks, short. The skill's name is the name in SKILL.md's front matter: changing it there renames the skill in the app, and its folder keeps its own name.",
].join('\n')

/**
 * A case change as the draft to save. Over a saved case it keeps what the
 * change does not name: the pictures, the word range, and each check whose
 * statement it repeats, with that check's picture and, unless the change
 * names one, its weight.
 */
export function changeDraft(
  change: Extract<SkillChange, { kind: 'case' }>,
  saved: Case | undefined,
): CaseDraft {
  const base = saved ? draftOf(saved) : blankDraft()
  return {
    ...base,
    id: change.id,
    title: change.title,
    prompt: change.prompt,
    expectedOutcome: change.expected,
    graders: change.checks.map(({ statement, weight }) => {
      const kept = base.graders.find((g) => g.statement.trim() === statement) ?? {
        ...newCheck(),
        statement,
      }
      return weight === null ? kept : { ...kept, weight }
    }),
  }
}

/** Whether the saved case already says what the change says. */
export const caseHolds = (
  change: Extract<SkillChange, { kind: 'case' }>,
  saved: Case | undefined,
): boolean =>
  Boolean(saved) &&
  saved?.prompt.trim() === change.prompt &&
  saved.expectedOutcome.trim() === change.expected &&
  (saved.title === change.title || (!change.title && saved.title === saved.id)) &&
  saved.graders.length === change.checks.length &&
  saved.graders.every((g, i) => {
    const check = change.checks[i]
    return (
      g.statement.trim() === check.statement && (check.weight === null || g.weight === check.weight)
    )
  })
