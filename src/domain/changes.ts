/**
 * Changes the side panel's assistant proposes to the open skill. The model
 * writes each one as a fenced block in its reply. The panel shows the block as
 * a change the writer applies with one click, through the operations the
 * Skill and Cases screens use. The model never writes a file: the
 * writer's click does, and the backend checks every path and id as it does for
 * those screens. Pure data and functions.
 *
 * An `edit` block changes part of a file: the text to find, and what goes in
 * its place. The panel never reads one. When the reply ends, the backend
 * applies each to the file as it stands (`editsOf`, `applyEdits`) and puts
 * one `edited` block in the reply for the file, its whole new text exactly
 * (`withEdits`), which the panel reads as a `file` change.
 */
import { blankDraft, checkWeight, draftOf, newCaseId, newCheck } from './case-draft.ts'
import type { Case, CaseDraft } from './schemas.ts'
import { isSlug, normalizeNewlines, quotesAfterEdit, withFrontMatterQuoted } from './text.ts'

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
  /** The whole new text of one of the skill's files: SKILL.md, a reference, a script or any other. */
  | { kind: 'file'; path: string; text: string }
  /** A case to add, or to replace when `id` names one the skill has. */
  | {
      kind: 'case'
      id: string
      /**
       * The block named the id, so it means that case. When it did not, `id`
       * is made from the title or the prompt as a new case's is, and whoever
       * applies the change sets it clear of the ids the skill has (`newCaseId`).
       */
      idGiven: boolean
      title: string
      prompt: string
      expected: string
      checks: CaseCheck[]
    }
  /** Keep the skill's files as they stand as the next version, under this name. */
  | { kind: 'version'; name: string }

export type ReplyPart =
  | { kind: 'prose'; text: string }
  | { kind: 'change'; change: SkillChange }
  /** A change still being written: its block has opened and not yet closed. */
  | { kind: 'writing'; label: string }

/**
 * A block's opening line. `edited` is written by the backend only, never by
 * the model: a file as the reply's edits leave it (`withEdits`).
 */
const OPENING = new RegExp(`^${CHANGE_FENCE}[ \\t]*(file|edited|edit|case|version)\\b[ \\t]*(.*)$`)
const isClosing = (line: string): boolean => line.trimEnd() === CHANGE_FENCE
/** The line of an edit block between the text to find and the text to put in its place. */
const WITH = new RegExp(`^${CHANGE_FENCE}[ \\t]*with[ \\t]*$`)

/** A block whose text may hold a tilde fence of its own: a file, or an edit to one. */
const holdsFences = (kind: string): boolean => kind === 'file' || kind === 'edit'

/**
 * The openings a file block ends before: the blocks there were before edits,
 * so a file's text that holds a line opening an edit or an edited file keeps
 * that line, in a conversation of any age.
 */
const FILE_ENDS_BEFORE = new RegExp(`^${CHANGE_FENCE}[ \\t]*(file|case|version)\\b`)

/** Whether `line` opens the block a block of `kind` ends before. */
const endsBefore = (kind: string, line: string): boolean =>
  (kind === 'file' ? FILE_ENDS_BEFORE : OPENING).test(line)

/**
 * Where the block opened at `i` closes, or -1 when it does not. A case, a
 * version or an edited file closes at the first line of four tildes. A file
 * or an edit closes at the last one before the next block opens or the reply
 * ends: its text may hold a tilde fence of its own, and the first would cut
 * it short. A file ends before a file, a case or a version only.
 */
function closingOf(lines: readonly string[], i: number, kind: string): number {
  if (!holdsFences(kind)) return lines.findIndex((line, k) => k > i && isClosing(line))
  let next = lines.findIndex((line, k) => k > i && endsBefore(kind, line))
  if (next < 0) next = lines.length
  for (let k = next - 1; k > i; k -= 1) if (isClosing(lines[k])) return k
  return -1
}

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
  if (!prompt) return null
  const given = text(raw.id)
  // An id that is not one names no case: guessing another from the title could replace the wrong one.
  if (given && !isSlug(given)) return null
  const id = given || newCaseId({ title, prompt }, [])
  return {
    kind: 'case',
    id,
    idGiven: Boolean(given),
    title,
    prompt,
    expected: text(raw.expected),
    checks,
  }
}

/** An edited file's block as a change: its whole text, one JSON string, read exactly. */
function editedChange(path: string, body: string[]): SkillChange | null {
  try {
    const text: unknown = JSON.parse(body.join('\n'))
    return path && typeof text === 'string' ? { kind: 'file', path, text } : null
  } catch {
    return null
  }
}

function changeOf(kind: string, rest: string, body: string[]): SkillChange | null {
  if (kind === 'file') {
    const path = rest.trim()
    if (!path) return null
    const text = `${body.join('\n').trimEnd()}\n`
    // A SKILL.md the model wrote keeps its description whole wherever the skill is loaded.
    return { kind: 'file', path, text: path === 'SKILL.md' ? withFrontMatterQuoted(text) : text }
  }
  if (kind === 'edited') return editedChange(rest.trim(), body)
  // An edit still here was not applied when the reply ended: it is no change to offer.
  if (kind === 'edit') return null
  if (kind === 'case') return caseChange(body.join('\n'))
  const name = body.join(' ').replace(/\s+/g, ' ').trim()
  return name ? { kind: 'version', name } : null
}

/** What the panel says while a block of this kind is still arriving. */
const writingLabel = (kind: string, rest: string): string =>
  kind === 'case'
    ? 'New case'
    : kind === 'version'
      ? 'New version'
      : rest.trim() || (kind === 'file' ? 'New file' : 'Change to a file')

/**
 * A reply split into prose and changes, in order. A block that does not hold
 * up, such as a case whose JSON is malformed, stays in the prose as code, so
 * nothing broken is offered. `partial` is for a reply still being written: an
 * open block at its end, or a file or edit block with no block after it, is a
 * change on its way, where a finished reply's open block was cut off and stays
 * as code. An edit is on its way until the reply has ended and it is applied;
 * one a finished reply still holds was not, and stays as code.
 */
export function replyParts(reply: string, { partial = false } = {}): ReplyPart[] {
  const parts: ReplyPart[] = []
  let prose: string[] = []
  const flush = () => {
    const joined = prose.join('\n').trim()
    if (joined) parts.push({ kind: 'prose', text: joined })
    prose = []
  }
  // A reply may come with Windows line endings: a `\r` left on a line would hide every block.
  const lines = normalizeNewlines(reply).split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const opening = OPENING.exec(lines[i])
    if (!opening) {
      prose.push(lines[i])
      continue
    }
    const { part, body, end } = blockAt(lines, i, opening, partial)
    if (!part) prose.push('```', ...body, '```')
    else {
      flush()
      parts.push(part)
      // A block still arriving takes the rest of the reply so far.
      if (end < 0) return parts
    }
    i = end < 0 ? lines.length : end
  }
  flush()
  return parts
}

/** A block in a reply as `replyParts` reads it. */
interface Block {
  /** The change it holds, or the change on its way; null when it stays in the prose as code. */
  part: ReplyPart | null
  body: string[]
  /** The line that closes it, -1 when none does yet. */
  end: number
}

/** The block that `opening`, the line at `at`, opens. */
function blockAt(lines: string[], at: number, opening: RegExpExecArray, partial: boolean): Block {
  const [, kind, rest] = opening
  const end = closingOf(lines, at, kind)
  const body = lines.slice(at + 1, end < 0 ? undefined : end)
  const writing: ReplyPart = { kind: 'writing', label: writingLabel(kind, rest) }
  // A file or an edit closes at its last line of tildes, and while the reply is arriving the last
  // one so far may be a fence inside its text: the last such block is on its way until the reply ends.
  const arriving = holdsFences(kind) && !lines.some((line, k) => k > at && endsBefore(kind, line))
  if (partial && (end < 0 || arriving)) return { part: writing, body, end: -1 }
  // A closed edit is applied once the reply has ended: until then it is on its way.
  if (partial && kind === 'edit') return { part: writing, body, end }
  // While a reply arrives, an edited file can only be one the model wrote: never a change.
  const change = end < 0 || (partial && kind === 'edited') ? null : changeOf(kind, rest, body)
  return { part: change && { kind: 'change', change }, body, end }
}

/** A closed block of a finished reply, by the lines it spans: its opening line and its closing one. */
interface Span {
  kind: string
  /** The opening line past its kind, such as a file's path. */
  rest: string
  from: number
  to: number
}

/**
 * The closed blocks of a finished reply's `lines`, read as `replyParts` reads
 * them. A block cut off by the reply's end is not among them: it stays as
 * code, as any block does.
 */
function spansOf(lines: readonly string[]): Span[] {
  const out: Span[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const opening = OPENING.exec(lines[i])
    if (!opening) continue
    const [, kind, rest] = opening
    const end = closingOf(lines, i, kind)
    if (end < 0) break
    out.push({ kind, rest: rest.trim(), from: i, to: end })
    i = end
  }
  return out
}

/** An edit block of a finished reply, by the lines it spans. */
type EditBlock = Span & { path: string }

const editBlocks = (lines: readonly string[]): EditBlock[] =>
  spansOf(lines).flatMap((span) =>
    span.kind === 'edit' && span.rest ? [{ ...span, path: span.rest }] : [],
  )

/**
 * A finished reply with each edited file the model wrote itself read as
 * code, as a block that does not hold up reads: an edited file is the
 * backend's own block (`withEdits`), so the model cannot offer a change
 * through one that was never checked.
 */
export function withoutEdited(reply: string): string {
  const lines = normalizeNewlines(reply).split('\n')
  const spans = spansOf(lines).filter((span) => span.kind === 'edited')
  if (!spans.length) return reply
  const out: string[] = []
  let at = 0
  for (const { from, to } of spans) {
    out.push(...lines.slice(at, from), '```', ...lines.slice(from + 1, to), '```')
    at = to + 1
  }
  out.push(...lines.slice(at))
  return out.join('\n')
}

/**
 * One edit block: each way its lines part at a line of `~~~~ with` into the
 * text to find and the text to put in its place. One way, unless one of the
 * texts holds such a line itself; none when the block has no such line.
 */
export interface Edit {
  splits: Array<{ find: string; put: string }>
}

/** A reply's edits to one file, in the order they come. */
export interface FileEdits {
  path: string
  edits: Edit[]
  /** Each block as the model wrote it, from its opening line to its closing one. */
  written: string[]
}

/** The edits of a finished reply, a file at a time, in the order each file is first edited. */
export function editsOf(reply: string): FileEdits[] {
  const lines = normalizeNewlines(reply).split('\n')
  const files = new Map<string, FileEdits>()
  for (const { path, from, to } of editBlocks(lines)) {
    const body = lines.slice(from + 1, to)
    const splits = body.flatMap((line, k) =>
      WITH.test(line)
        ? [{ find: body.slice(0, k).join('\n'), put: body.slice(k + 1).join('\n') }]
        : [],
    )
    const file = files.get(path) ?? { path, edits: [], written: [] }
    file.edits.push({ splits })
    file.written.push(lines.slice(from, to + 1).join('\n'))
    files.set(path, file)
  }
  return [...files.values()]
}

/**
 * Why a file's edits could not be applied: the file is not in the skill, or
 * one edit's text to find is in it nowhere, more than once, is empty, or the
 * edit can be read as no one text to find.
 */
export type EditProblem = 'no-file' | 'not-found' | 'found-twice' | 'nothing-to-find' | 'unclear'

/** A file as its edits leave it, or which edit, from 1, could not be applied and why. */
export type Applied = { text: string } | { problem: EditProblem; edit: number }

/** One edit's result: the new text, or why there is none. */
type Tried = { text: string } | { problem: EditProblem }

/** One line of a text with the line end it has: `\r\n`, `\n`, or none for a last line without one. */
interface Line {
  text: string
  end: string
}

/** A text as its lines, each with its own line end. */
function linesOf(text: string): Line[] {
  const out: Line[] = []
  let at = 0
  for (const match of text.matchAll(/\r?\n/g)) {
    out.push({ text: text.slice(at, match.index), end: match[0] })
    at = match.index + match[0].length
  }
  out.push({ text: text.slice(at), end: '' })
  return out
}

/** The line end most of `lines` have, `\n` when none has one. */
function mostEnds(lines: readonly Line[]): string {
  const crlf = lines.filter((line) => line.end === '\r\n').length
  const lf = lines.filter((line) => line.end === '\n').length
  return crlf > lf ? '\r\n' : '\n'
}

/**
 * `text` with `find` replaced by `put`, where `find` is in it exactly once.
 * `find` and `put` hold `\n` between their lines, and `find` is matched
 * whatever each of the file's lines ends with. Every line the match does not
 * reach keeps its own end, and the new lines take the end of the line the
 * match starts on. An empty `put` deletes: when what it deletes is whole
 * lines, their line end goes too, so no empty line is left where they were.
 */
function replaced(text: string, find: string, put: string): Tried {
  if (!find) return { problem: 'nothing-to-find' }
  const lines = linesOf(text)
  const plain = lines.map((line) => line.text).join('\n')
  const at = plain.indexOf(find)
  if (at < 0) return { problem: 'not-found' }
  if (plain.indexOf(find, at + 1) >= 0) return { problem: 'found-twice' }
  // Where each line starts, in `plain` and in `text`.
  const starts: Array<{ plain: number; text: number }> = []
  let p = 0
  let t = 0
  for (const line of lines) {
    starts.push({ plain: p, text: t })
    p += line.text.length + 1
    t += line.text.length + line.end.length
  }
  const lineAt = (pos: number) =>
    lines.findIndex((line, i) => pos <= starts[i].plain + line.text.length)
  const textAt = (pos: number, i: number) => starts[i].text + pos - starts[i].plain
  const first = lineAt(at)
  const last = lineAt(at + find.length)
  let from = textAt(at, first)
  let to = textAt(at + find.length, last)
  const eol = lines[first].end || lines[first - 1]?.end || mostEnds(lines)
  const wholeLines =
    at === starts[first].plain && at + find.length === starts[last].plain + lines[last].text.length
  if (!put && wholeLines) {
    if (lines[last].end) to += lines[last].end.length
    else if (first > 0) from -= lines[first - 1].end.length
  }
  return { text: text.slice(0, from) + put.replace(/\n/g, eol) + text.slice(to) }
}

/**
 * One edit applied to `text`. Of its splits, the one whose text to find is
 * in `text` exactly once is taken; when more than one is, the edit is unclear.
 */
function editApplied(text: string, { splits }: Edit): Tried {
  const tried = splits.map(({ find, put }) => replaced(text, find, put))
  const found = tried.filter((t) => 'text' in t)
  if (found.length === 1) return found[0]
  return found.length || !tried.length ? { problem: 'unclear' } : tried[0]
}

const BOM = '﻿'

/**
 * A file's edits applied to `text`, the file as it stands, one after another:
 * each to the text the ones before it left, and each only where its text to
 * find is found exactly once, so an edit never lands where it was not meant.
 * The text is matched as written, white space and all, whatever line end
 * each of the file's lines has. Every byte the edits do not reach stays as
 * it was: each line's own end, the byte-order mark, which no edit reaches,
 * and the end of the file. Undefined `text` is a file the skill does not
 * have. A SKILL.md gets quotes where an edit made a value of the `---` lines
 * need them, as the editor adds.
 */
export function applyEdits(
  path: string,
  text: string | undefined,
  edits: readonly Edit[],
): Applied {
  if (text === undefined) return { problem: 'no-file', edit: 1 }
  const bom = text.startsWith(BOM) ? BOM : ''
  let now = text.slice(bom.length)
  for (const [i, edit] of edits.entries()) {
    const next = editApplied(now, edit)
    if ('problem' in next) return { problem: next.problem, edit: i + 1 }
    now = next.text
  }
  return { text: path === 'SKILL.md' ? quotesAfterEdit(text, bom + now) : bom + now }
}

/** What became of a reply's edits to one file: its whole new text, or the line that says why it has none. */
export type EditOutcome = { text: string } | { notMade: string }

/**
 * The reply as the panel reads it, once its edits are settled: each file with
 * a new text has one `edited` block in place of its first edit and none for
 * the others, its whole text as a JSON string, so every byte reads back as
 * it is. A file with none keeps its edits, which read as code, with the
 * line that says why after the last. Every other line stays as it was.
 */
export function withEdits(reply: string, outcomes: ReadonlyMap<string, EditOutcome>): string {
  const lines = normalizeNewlines(reply).split('\n')
  const blocks = editBlocks(lines)
  const last = new Map(blocks.map((block) => [block.path, block]))
  const placed = new Set<string>()
  const out: string[] = []
  let at = 0
  for (const block of blocks) {
    out.push(...lines.slice(at, block.from))
    at = block.to + 1
    const outcome = outcomes.get(block.path)
    if (outcome && 'text' in outcome) {
      if (!placed.has(block.path))
        out.push(`${CHANGE_FENCE} edited ${block.path}`, JSON.stringify(outcome.text), CHANGE_FENCE)
      placed.add(block.path)
      continue
    }
    out.push(...lines.slice(block.from, at))
    if (outcome && last.get(block.path) === block) out.push('', outcome.notMade)
  }
  out.push(...lines.slice(at))
  return out.join('\n')
}

/** Why the edits could not be applied, as the model is told it. */
const PROBLEM_FOR_MODEL: Record<EditProblem, (edit: number) => string> = {
  'no-file': () => 'the skill has no such file',
  'not-found': (n) => `the text to find in edit ${n} is not in the file`,
  'found-twice': (n) => `the text to find in edit ${n} is in the file more than once`,
  'nothing-to-find': (n) => `edit ${n} has no text to find`,
  unclear: (n) => `edit ${n} does not hold one clear text to find and one to put in its place`,
}

/**
 * The one more request for a file whose edits could not be applied: why,
 * what the model wrote, the file as it stands, and the ask for the file whole.
 */
export function wholeFileRequest(
  file: FileEdits,
  { problem, edit }: Extract<Applied, { problem: EditProblem }>,
  text: string | undefined,
): string {
  const { path } = file
  return [
    `Your ${file.written.length === 1 ? 'edit' : 'edits'} to ${path} could not be applied to the file as it is now: ${PROBLEM_FOR_MODEL[problem](edit)}.`,
    `Write ${path} whole instead, with the change you meant: "${CHANGE_FENCE} file ${path}", then the whole new text of the file, then "${CHANGE_FENCE}". Reply with that block and nothing else.`,
    `What you wrote:\n${file.written.join('\n\n')}`,
    text === undefined
      ? `The skill has no file ${path}.`
      : `${path} as it is now:\n<file name="${path.replace(/"/g, "'")}">\n${normalizeNewlines(text)}\n</file>`,
  ].join('\n\n')
}

/**
 * `text`, a whole new file with `\n` between its lines, in the form of `old`,
 * the file as it stands: its byte-order mark, and its line ends. The lines
 * `old` has at its start and its end keep their own ends; of the lines
 * between, each that `old` has further on, in order, keeps that line's end,
 * and a new line takes the end of the line before it. The last line ends as
 * the last line of `old` does, with a line end or without.
 */
function inFormOf(old: string, text: string): string {
  const bom = old.startsWith(BOM) ? BOM : ''
  const before = linesOf(old.slice(bom.length))
  const ended = before.length > 1 && before.at(-1)?.text === ''
  if (ended) before.pop()
  const after = text.split('\n')
  if (after.at(-1) === '') after.pop()
  const ends: string[] = after.map(() => '')
  let head = 0
  while (head < after.length && head < before.length && after[head] === before[head].text) {
    ends[head] = before[head].end
    head += 1
  }
  let tail = 0
  while (
    tail < after.length - head &&
    tail < before.length - head &&
    after[after.length - 1 - tail] === before[before.length - 1 - tail].text
  ) {
    ends[after.length - 1 - tail] = before[before.length - 1 - tail].end
    tail += 1
  }
  let seen = head
  for (let i = head; i < after.length - tail; i += 1) {
    const k = before.findIndex(
      (line, j) => j >= seen && j < before.length - tail && line.text === after[i],
    )
    if (k < 0) continue
    ends[i] = before[k].end
    seen = k + 1
  }
  // A line with no end of its own takes the one before it; the last ends as the old file's last does.
  let previous = mostEnds(before)
  const out = after.map((line, i) => {
    const end = ends[i] || previous
    previous = end
    return i < after.length - 1 || ended ? `${line}${end}` : line
  })
  return bom + out.join('')
}

/**
 * The file a reply to `wholeFileRequest` holds: the text of its last file
 * block for `path` as the model wrote it, blank lines at its end and all,
 * in the form of `text`, the file as it stands (`inFormOf`). A SKILL.md gets
 * quotes where the new text made a value of the `---` lines need them, as
 * an edit's does. Null when the reply holds no whole text for that path.
 */
export function wholeFileOf(answer: string, path: string, text: string | undefined): string | null {
  const lines = normalizeNewlines(answer).split('\n')
  const span = spansOf(lines)
    .filter((s) => s.kind === 'file' && s.rest === path)
    .at(-1)
  if (!span) return null
  const whole = `${lines.slice(span.from + 1, span.to).join('\n')}\n`
  if (text === undefined) return path === 'SKILL.md' ? withFrontMatterQuoted(whole) : whole
  const formed = inFormOf(text, whole)
  return path === 'SKILL.md' ? quotesAfterEdit(text, formed) : formed
}

/** Why a change to a file was not made, as the reader is told it under the change. */
const PROBLEM_FOR_READER: Record<EditProblem, string> = {
  'no-file': 'the skill has no such file',
  'not-found': 'the text it replaces is not in the file',
  'found-twice': 'the text it replaces is in the file more than once',
  'nothing-to-find': 'it does not say which text to replace',
  unclear: 'it does not say clearly which text to replace',
}

/** The line under a change to `path` that was not made because of `problem`, with the next step. */
export const notMadeLine = (path: string, problem: EditProblem): string =>
  `This change to ${path} was not made: ${PROBLEM_FOR_READER[problem]}. Ask for it again.`

/** The line under a change to a path the skill's files cannot have, in the words its save refuses it with. */
export const refusedLine = (refusal: string): string => `This change was not made. ${refusal}`

/** The part of the brief that teaches an edit block. */
const EDIT_GUIDE = `- An edit to part of a file the skill has: open with "${CHANGE_FENCE} edit <path>", then the text to replace, copied exactly from the file as you see it here, then a line "${CHANGE_FENCE} with", then the new text, then "${CHANGE_FENCE}". The text to replace must be in the file exactly once: copy whole lines, and enough of them that they are found nowhere else. Leave the new text empty to delete those lines. Write one edit block for each place you change; they apply one after another. An edit block ends at the last line of four tildes before the next block or the end of your reply. Put every edit block before the first file block, since a file block holds everything up to the next file, case or version block. Change part of a file with edit blocks, so the reader sees only what changes; write the whole file only for a new file or when most of it changes, and never both for one file.`

/** The brief that teaches the model the blocks, from the same fence the parser reads. */
export const CHANGES_GUIDE = [
  'You can propose changes to the open skill. The reader applies each one with a button under it, and can undo it, so never tell them to copy or paste. Write each change as a block that opens and closes with a line of four tildes, outside any other fence:',
  `- A file: open with "${CHANGE_FENCE} file SKILL.md", or "${CHANGE_FENCE} file references/<name>.md" for a reference, or the path of another file of the skill such as "scripts/<name>.py", then the whole new text of the file, never a part of it, then "${CHANGE_FENCE}". A new path creates the file. Any text file of the skill can be written, but nothing under evals/ and no hidden file. The file block ends at the last line of four tildes before the next file, case or version block or the end of your reply, so a tilde fence inside the file is kept; put no prose made of four tildes after it.`,
  EDIT_GUIDE,
  `- A case: open with "${CHANGE_FENCE} case", then one JSON object {"title": "…", "prompt": "…", "expected": "…", "checks": […]}, then "${CHANGE_FENCE}". Add "id" with an existing case's id to replace that case; leave it out to add a new one. A check is a string, or {"statement": "…", "weight": 2} for one that counts double. A string keeps the weight the saved check has, so to change one, write the case again with every check and the new weight on that one.`,
  `- A version: "${CHANGE_FENCE} version", one line naming the version, such as "Before the voice rewrite", then "${CHANGE_FENCE}". It keeps the skill's files as they stand, as a version. Put it before a file change when the reader will want to compare the two later.`,
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
