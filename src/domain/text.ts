/** Text helpers shared by packs and the UI. Ported from bench-core.mjs. */
import { parse as parseYaml, stringify as toYaml } from 'yaml'

/** Unix line endings, no byte-order mark: every parser below splits on `\n`. */
export const normalizeNewlines = (raw: string): string =>
  raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

/** The largest file the editor opens as text, in bytes. */
export const TEXT_MAX_BYTES = 1_000_000

/**
 * A file's bytes as text an editor can write back, exactly: every byte is
 * UTF-8 and a byte-order mark stays, so a save changes only what was typed.
 * Null for bytes that are not UTF-8 text (a picture, a font, an archive, a
 * file in an older encoding, which a save would damage) and for a file past
 * `TEXT_MAX_BYTES`: the editor lists those and does not open them. Reading
 * an output for grading is more forgiving (`textOf` in `infrastructure/fs.ts`).
 */
export function editableText(bytes: Uint8Array): string | null {
  if (bytes.length > TEXT_MAX_BYTES || bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return null
  }
}

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

/** A front matter block's text as a YAML mapping; null when it is not valid YAML or not a mapping. */
function mappingOf(yaml: string): Record<string, unknown> | null {
  let parsed: unknown = null
  try {
    parsed = parseYaml(yaml)
  } catch {
    return null
  }
  if (parsed === null) return {}
  return typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
}

/**
 * A top-level `key: value` line whose value is plain: not quoted, not a block
 * (`|`, `>`), a list, a map, an anchor, an alias or a tag.
 */
const PLAIN_FIELD = /^([A-Za-z_][\w.-]*):[ \t]+([^\s"'|>[\]{}&*!%@`#].*?)[ \t]*$/

/**
 * A one-line value in YAML quotes, written as a person would: double quotes,
 * or single quotes when it holds a double quote or a backslash, which single
 * quotes keep as they are. Inside single quotes only `'` is doubled.
 */
const inQuotes = (value: string): string =>
  /["\\]/.test(value) ? `'${value.replace(/'/g, "''")}'` : `"${value}"`

/**
 * The block's text with each one-line plain value that holds `: ` (or ends
 * in `:`) put in quotes, and the keys it quoted. Strict YAML refuses
 * such a value, but people and models write them all the time, as in
 * `description: Use when: a release ships`, and Claude Code reads them by
 * quoting them the same way. A value that runs on to an indented line is
 * left as it is: quoting its first line alone would change it.
 */
function quotedFields(yaml: string): { yaml: string; keys: string[] } {
  const lines = yaml.split('\n')
  const keys: string[] = []
  const out = lines.map((line, i) => {
    const match = PLAIN_FIELD.exec(line)
    if (!match) return line
    const [, key, value] = match
    if (!/:(?:[ \t]|$)/.test(value)) return line
    if (/^[ \t]+\S/.test(lines[i + 1] ?? '')) return line
    keys.push(key)
    return `${key}: ${inQuotes(value)}`
  })
  return { yaml: out.join('\n'), keys }
}

/**
 * How the front matter block reads: its fields, and the keys whose values
 * had to be put in quotes before it would read. `meta` is null when the
 * block cannot be read even then.
 */
function frontMatterOf(raw: string): {
  match: RegExpExecArray | null
  meta: Record<string, unknown> | null
  quoted: string[]
} {
  const match = FRONT_MATTER.exec(normalizeNewlines(raw))
  if (!match) return { match, meta: {}, quoted: [] }
  const block = match[1] ?? ''
  const strict = mappingOf(block)
  if (strict) return { match, meta: strict, quoted: [] }
  const { yaml, keys } = quotedFields(block)
  const meta = keys.length ? mappingOf(yaml) : null
  return { match, meta, quoted: meta ? keys : [] }
}

/**
 * Split YAML front matter from the body. `meta` is the parsed mapping; it is
 * empty when there is no block, or when the block cannot be read as a YAML
 * mapping even with its colon-holding values put in quotes.
 */
export function readFrontMatter(raw: string): { meta: Record<string, unknown>; text: string } {
  const source = normalizeNewlines(raw)
  const { match, meta } = frontMatterOf(source)
  if (!match) return { meta: {}, text: source.trim() }
  return { meta: meta ?? {}, text: source.slice(match[0].length).trim() }
}

/** True when the file has a front matter block that cannot be read as a YAML mapping, so none of its fields can be read. */
export const frontMatterUnreadable = (raw: string): boolean => frontMatterOf(raw).meta === null

/**
 * The fields of the front matter block that read only once their values are
 * put in quotes, and the file's text with those quotes added. Null when every
 * field reads as written, or when quotes do not make the block readable.
 */
export function frontMatterQuotes(raw: string): { keys: string[]; text: string } | null {
  const source = normalizeNewlines(raw)
  const { match, quoted } = frontMatterOf(source)
  if (!match || !quoted.length) return null
  const { yaml } = quotedFields(match[1] ?? '')
  const end = match[0].endsWith('\n') ? '\n' : ''
  const text = `---\n${yaml}\n---${end}${source.slice(match[0].length)}`
  // The file keeps its own line endings and byte-order mark, so only the quoted lines change.
  const eol = raw.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text
  return { keys: quoted, text: raw.startsWith('\uFEFF') ? `\uFEFF${eol}` : eol }
}

/** The file's text with any front matter value that needs quotes in them. */
export const withFrontMatterQuoted = (raw: string): string => frontMatterQuotes(raw)?.text ?? raw

/**
 * `after`, an edit of `before`, with quotes added where the edit made a front
 * matter value need them. A value that needed them before the edit is the
 * writer's to fix, so an edit elsewhere in the file does not reach it.
 */
export const quotesAfterEdit = (before: string, after: string): string =>
  frontMatterQuotes(before) ? after : withFrontMatterQuoted(after)

/**
 * Front matter fields as YAML, one line each, quoted where a value needs it.
 * Folding a long description over several lines is valid YAML, but it is not
 * how skills are written, and a reader that goes line by line keeps only the first.
 */
export const frontMatterYaml = (meta: Record<string, unknown>): string =>
  toYaml(meta, { lineWidth: 0 })

/** The limits agent skills set on the two fields every skill needs. */
const NAME_MAX = 64
const DESCRIPTION_MAX = 1024

/** The words Anthropic keeps out of the name of a skill uploaded to it. */
const RESERVED_WORD = /anthropic|claude/i
/** An XML tag, which Anthropic takes in neither field: `<example>`, `</b>`. */
const TAG = /<\/?[A-Za-z][^<>]*>/

/** One thing about a skill's name or description that some apps will not take, as the editor says it. */
export interface HeadProblem {
  title: string
  detail: string
}

/**
 * Where the name and the description in a SKILL.md's front matter go past
 * what the agent skills format allows: a name of 64 characters at most, in
 * lowercase letters, digits and single dashes, the same as its folder's
 * name, and a description of 1,024 characters at most. Anthropic's own limits
 * add two: no `anthropic` or `claude` in the name, and no XML tag in either
 * field (one in a name is already a character it may not hold). An app that holds a
 * skill to the format refuses one past it, and others load it all the same:
 * skills named `plugin:skill`, named apart from their folder or described at
 * length are in daily use. So each line says what some apps will not take,
 * never that the skill cannot be used. A block that cannot be read says so
 * alone; a field that is missing is not checked here.
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
      title: 'The skill’s name is longer than some apps accept',
      detail: `Some take ${NAME_MAX} characters at most, and this one has ${name.length}.`,
    })
  else if (name && !isSlug(name))
    problems.push({
      title: 'The skill’s name has characters some apps refuse',
      detail: 'Some take only lowercase letters, digits and single dashes, like release-notes.',
    })
  else if (name && RESERVED_WORD.test(name))
    problems.push({
      title: 'The skill’s name has a word some apps refuse',
      detail: 'Some take no name with “anthropic” or “claude” in it.',
    })
  else if (name && folder && name !== folder)
    problems.push({
      title: 'The skill’s name is not the name of its folder',
      detail: `Some apps ask that the two match: name it ${folder}, or rename the folder to ${name}.`,
    })
  if (description && description.length > DESCRIPTION_MAX)
    problems.push({
      title: 'The description is longer than some apps accept',
      detail: `Some take ${DESCRIPTION_MAX.toLocaleString('en')} characters at most, and this one has ${description.length.toLocaleString('en')}.`,
    })
  const tag = description ? TAG.exec(description)?.[0] : undefined
  if (tag)
    problems.push({
      title: 'The description has angle brackets some apps refuse',
      detail: `Some take no text like ${tag} in a description.`,
    })
  return problems
}

/** A field of a file anyone may have written, read as text: a string, and anything else as none (''). */
export const textIn = (value: unknown): string => (typeof value === 'string' ? value : '')

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
 * A text's words as a person counts them: split on white space, so a dash
 * between spaces is one and "v2.3" is one. The one count the app shows a
 * person or holds their text to: a rule's length, the Improve panel's draft,
 * a description Write with AI writes. Text written without spaces, such as
 * Chinese or Japanese, is one word to it.
 */
export const wordCount = (text: string): number => tokens(text).length

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
