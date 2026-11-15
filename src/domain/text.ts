/** Text helpers shared by packs and the UI. Ported from bench-core.mjs. */
import { parse as parseYaml } from 'yaml'

/** Unix line endings, no byte-order mark: every parser below splits on `\n`. */
export const normalizeNewlines = (raw: string): string =>
  raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

/** A code fence as a line opens it: three or more backticks or tildes, indented or not. */
export interface Fence {
  char: '`' | '~'
  length: number
}

/**
 * The fence a line opens, or null for any other line. A run of backticks with
 * another backtick after it on the line is inline code, as in CommonMark, so a
 * line that starts with one opens nothing. A line of a CRLF text, split at
 * `\n`, still ends in `\r`, and opens a fence all the same.
 */
export function fenceOf(line: string): Fence | null {
  const match = /^\s*(`{3,}|~{3,})(.*)\r?$/.exec(line)
  if (!match) return null
  const char = match[1][0] as Fence['char']
  if (char === '`' && match[2].includes('`')) return null
  return { char, length: match[1].length }
}

/** Whether the line closes `fence`: the same character, at least as many, and nothing else. */
export const closesFence = (line: string, fence: Fence): boolean => {
  const match = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
  return match !== null && match[1][0] === fence.char && match[1].length >= fence.length
}

/**
 * `text` with its fenced code taken out, line for line: every line of a fenced
 * block, the fence lines included, comes back empty, so the lines around it
 * keep their numbers. A fence left open runs to the end, as Markdown reads
 * it. With `keepLength` each such line is spaces of the same length instead,
 * for a caller that reports a position in the text.
 */
export function withoutCode(text: string, { keepLength = false } = {}): string {
  let fence: Fence | null = null
  const blank = (line: string): string => (keepLength ? line.replace(/[^\r]/g, ' ') : '')
  return text
    .split('\n')
    .map((line) => {
      if (fence) {
        if (closesFence(line, fence)) fence = null
        return blank(line)
      }
      fence = fenceOf(line)
      return fence ? blank(line) : line
    })
    .join('\n')
}

const FRONT_MATTER = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/

/** The front matter block of a Markdown file, delimiters included; empty when it has none. */
export const frontMatterBlock = (raw: string): string =>
  FRONT_MATTER.exec(normalizeNewlines(raw))?.[0] ?? ''

/** The body of a Markdown file, without its front matter block. */
export const stripFrontMatter = (raw: string): string =>
  normalizeNewlines(raw).replace(FRONT_MATTER, '')

/**
 * Split YAML front matter from the body. `meta` is the parsed mapping; it is
 * empty when there is no block, or when the block is not a valid YAML mapping.
 */
export function readFrontMatter(raw: string): { meta: Record<string, unknown>; text: string } {
  const source = normalizeNewlines(raw)
  const match = FRONT_MATTER.exec(source)
  if (!match) return { meta: {}, text: source.trim() }
  let parsed: unknown = null
  try {
    parsed = parseYaml(match[1] ?? '')
  } catch {
    // Invalid YAML carries no fields we can trust; the block is still not body text.
  }
  const meta =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  return { meta, text: source.slice(match[0].length).trim() }
}

/** True when the file has a front matter block that is not a YAML mapping, so none of its fields can be read. */
export function frontMatterUnreadable(raw: string): boolean {
  const match = FRONT_MATTER.exec(normalizeNewlines(raw))
  if (!match) return false
  try {
    const parsed: unknown = parseYaml(match[1] ?? '')
    // An empty block holds no fields, and is not broken.
    return parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))
  } catch {
    return true
  }
}

/** The limits agent skills set on the two fields every skill needs. */
const NAME_MAX = 64
const DESCRIPTION_MAX = 1024

/** One thing about a skill's name or description agents will not take, as the editor says it. */
export interface HeadProblem {
  title: string
  detail: string
}

/**
 * What is wrong with the name and the description in a SKILL.md's front
 * matter, by the limits the agent skills format sets: a name of 64 characters at most, in
 * lowercase letters, digits and single dashes, the same as its folder's
 * name, and a description of 1,024 characters at most. A block that cannot
 * be read says so alone; a field that is missing is not checked here.
 */
export function headProblems(raw: string, folder: string): HeadProblem[] {
  if (frontMatterUnreadable(raw))
    return [
      {
        title: 'The lines at the top of the file cannot be read',
        detail:
          'Write each one as a name, a colon and its value, and put a value that holds a colon in quotes.',
      },
    ]
  const { meta } = readFrontMatter(raw)
  const name = metaText(meta, 'name')
  const description = metaText(meta, 'description')
  const problems: HeadProblem[] = []
  if (name && name.length > NAME_MAX)
    problems.push({
      title: 'The skill’s name is too long',
      detail: `A name can be ${NAME_MAX} characters at most, and this one has ${name.length}.`,
    })
  else if (name && !isSlug(name))
    problems.push({
      title: 'The skill’s name cannot be used as it is written',
      detail: SLUG_RULE,
    })
  else if (name && folder && name !== folder)
    problems.push({
      title: 'The skill’s name is not the name of its folder',
      detail: `The skill is found by its folder, so name it ${folder}, or rename the folder to ${name}.`,
    })
  if (description && description.length > DESCRIPTION_MAX)
    problems.push({
      title: 'The description is too long',
      detail: `A description can be ${DESCRIPTION_MAX.toLocaleString('en')} characters at most, and this one has ${description.length.toLocaleString('en')}.`,
    })
  return problems
}

/** A front matter field as text: strings, numbers and booleans; null for anything else. */
export const metaText = (meta: Record<string, unknown>, key: string): string | null => {
  const value = meta[key]
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : null
}

/** A front matter field as a list: a YAML sequence, or a comma-separated string. */
export const metaList = (meta: Record<string, unknown>, key: string): string[] | null => {
  const value = meta[key]
  if (Array.isArray(value)) return value.map(String)
  const text = metaText(meta, key)
  return text === null
    ? null
    : text
        .split(/,\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
}

/**
 * `text` with every match of `pattern` taken out, repeated until a pass finds
 * none: taking one match out can join the text around it into another, as in
 * `<!-<!-- a -->- b -->`.
 */
function without(text: string, pattern: RegExp): string {
  let rest = text
  let before: string
  do {
    before = rest
    rest = rest.replace(pattern, '')
  } while (rest !== before)
  return rest
}

/** `text` with its HTML comments removed. */
export const stripComments = (text: string): string => without(text, /<!--[\s\S]*?-->/g)

/** `text` with its HTML tags removed, `<b>` and `</b>` alike. */
export const stripTags = (text: string): string => without(text, /<[^>]*>/g)

/** A line of front matter: blank, a comment, `key:` with or without a value, or a line indented under one. */
const FIELD_LINE = /^(?:\s*$|#|[\w.-]+:(?:\s|$)|\s+\S|- )/

/**
 * Whether a piece opens with front matter: a block between two `---` lines
 * that holds a field and nothing but fields. It is told by its shape, not by
 * whether it parses, so a title with a colon in it is front matter still, and
 * a section of prose between two rules (`---`) is not.
 */
function hasFrontMatter(source: string): boolean {
  const lines = FRONT_MATTER.exec(source)?.[1]?.split('\n') ?? []
  return lines.some((line) => /^[\w.-]+:/.test(line)) && lines.every((l) => FIELD_LINE.test(l))
}

/**
 * The copy a piece is judged on: front matter and HTML comments removed. A
 * piece that opens with a rule (`---`) and has another further down keeps the
 * section between them (`hasFrontMatter`).
 */
export function copyOf(raw: string): string {
  const source = normalizeNewlines(raw)
  const body = hasFrontMatter(source) ? source.replace(FRONT_MATTER, '') : source
  return without(body, /<!--[\s\S]*?-->\s*/g).trim()
}

/**
 * The text a reader sees on a page: no comment, nothing of its `<head>`,
 * scripts, styles or templates, no tag and no entity. A tag or an entity
 * leaves a space, so the words on either side of it stay two words.
 */
export const pageText = (html: string): string =>
  stripComments(html)
    // A head may be left open: it ends where the body begins.
    .replace(/<head\b[\s\S]*?(?:<\/head\s*>|(?=<body\b)|$)/gi, ' ')
    .replace(/<(script|style|template)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
    .replace(/<[^>]*>|&#?\w+;/g, ' ')

export interface Unit {
  text: string
  items: string[]
  list: boolean
}

/**
 * A list marker as a line opens with one: a dash, star or plus, or a number
 * with a dot or bracket. The source of every pattern that reads one, so a
 * bullet is the same thing wherever it is looked for.
 */
export const LIST_MARK = '(?:[-*+]|\\d+[.)])'

/** A list marker at the start of a line, with the space after it. */
export const LIST_MARKER = new RegExp(`^\\s*${LIST_MARK}\\s+`)

const LIST_LINE = new RegExp(`^\\s*${LIST_MARK}\\s`)
const HEADING_LINE = /^#{1,6}\s/

/** Prose paragraphs and list blocks, in order; headings, figures and code are left out. */
export function unitsOf(text: string): Unit[] {
  const units: Unit[] = []
  const blocks = withoutCode(normalizeNewlines(text))
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
  for (const whole of blocks) {
    // A paragraph may follow its heading with no blank line between: the heading goes, the paragraph stays.
    const body = whole.split('\n')
    while (body.length && HEADING_LINE.test(body[0].trimStart())) body.shift()
    const block = body.join('\n').trim()
    if (!block || /^\[(?:figure|caption)\]/i.test(block)) continue
    if (/^<!--/.test(block) || /^!\[/.test(block)) continue
    const lines = block.split('\n')
    const isList = lines.every((line) => LIST_LINE.test(line))
    const items = isList
      ? lines.map((line) => line.replace(LIST_MARKER, ''))
      : [block.replace(/\n/g, ' ')]
    units.push({ text: items.join(' ').replace(/^>\s?/, ''), items, list: isList })
  }
  return units
}

/** Runs of letters and digits; an apostrophe or hyphen joins two runs but is never a word alone. */
export const words = (text: string): string[] =>
  text.match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu) ?? []

/** Whitespace-delimited tokens: the count a rule's length and the writing pack's shape are measured in. */
export const tokens = (text: string): string[] => text.match(/\S+/g) ?? []

/**
 * The sentences of `text`. A sentence ends at a full stop, question mark or
 * exclamation mark followed by space. With `capital` the next one must also
 * open as a sentence does (a capital, a quote, a bracket or a digit), so
 * "e.g. this" stays whole, and a piece with no letter in it is dropped: the
 * reading the writing pack's measures were drawn with.
 */
export function sentencesOf(text: string, { capital = false } = {}): string[] {
  const parts = capital
    ? text.replace(/\s+/g, ' ').split(/(?<=[.?!])\s+(?=[A-Z"'“‘(\d[])/)
    : text.split(/(?<=[.!?])\s+/)
  const trimmed = parts.map((sentence) => sentence.trim())
  return capital ? trimmed.filter((s) => /[A-Za-z]/.test(s)) : trimmed.filter(Boolean)
}

export const titleOf = (text: string): string | null =>
  /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? null

export const slug = (text: string, max = 48): string =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '')

/** Skill names and case ids: what `slug` produces, so either can be typed or derived. */
export const isSlug = (text: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)
export const SLUG_RULE = 'Use lowercase letters, digits and single dashes, like release-notes.'

export function round(value: number, places?: number): number
export function round(value: null, places?: number): null
export function round(value: number | null, places?: number): number | null
export function round(value: number | null, places = 2): number | null {
  return roundValue(value, places)
}
const roundValue = (value: number | null, places: number): number | null =>
  value === null || Number.isNaN(value) ? null : Number(value.toFixed(places))
