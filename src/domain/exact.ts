/**
 * The answer code gives on a rule or a check read as `exact` (`rule-reading.ts`):
 * met, missed, or no answer, each with what it saw. It gives no answer rather
 * than guess: on an output of a kind the reading does not read, on an empty
 * output, where the part to read or the values to look for are not there,
 * where two ordinary ways of counting would answer differently, where a value
 * is written in a way it does not read, and where the measured page lists
 * only part of what the answer rests on.
 *
 * What it saw is data for a reader to be shown later: counts and their
 * bound, and the values found or missing with the piece and the place they
 * were found at. No display copy is made here.
 *
 * Pure: it takes strings and a measured layout, never a path to read.
 */
import type { PageLayout } from './layout.ts'
import type {
  At,
  CaseRule,
  Compare,
  ExactTest,
  Match,
  Part,
  ReadOutput,
  RuleReading,
  Take,
  Thing,
  Values,
} from './rule-reading.ts'
import type { ArtifactKind } from './schemas.ts'
import {
  copyOf,
  LIST_MARKER,
  normalizeNewlines,
  pageText,
  stripComments,
  tokens,
  unitsOf,
  withoutCode,
  words,
} from './text.ts'

/** One output and what it was made from, as strings. */
export interface ExactSubject {
  /** The output's main file, as written. */
  output: string
  kind: ArtifactKind
  /** The other text files the agent wrote, whole, by their path in the output folder (`outputs/sum.test.mjs`). */
  others: Readonly<Record<string, string>>
  /** The request's text. */
  request: string
  /** The text files the request came with, whole, by the name the agent got each under (`brief.md`). */
  files: Readonly<Record<string, string>>
  /** The main file drawn and measured, when it is a page and the host could draw it. */
  layout: PageLayout | null
}

/**
 * Why there is no answer.
 * - `kind`: the output is of a kind the reading or the test does not read.
 * - `empty`: the output holds nothing but white space.
 * - `not there`: the part to read, or the values to look for, are not there.
 * - `convention`: ordinary ways of counting it fall on both sides of the bound.
 * - `other notation`: a value of the kind is written in a way this does not read.
 * - `differ`: under `same`, the readings that could be read disagree.
 * - `not measured`: the page was not measured.
 * - `not listed`: the measured layout leaves out elements the answer rests on.
 */
export type NoAnswer =
  | 'kind'
  | 'empty'
  | 'not there'
  | 'convention'
  | 'other notation'
  | 'differ'
  | 'not measured'
  | 'not listed'

/** A value as it was found: in which piece of the part, where in it, and the words there. */
export interface Found {
  value: string
  /** The piece of the part, from 0: the element, the line or the file. */
  piece: number
  /** Where in the piece it starts, in characters of the piece as read (white space runs made one space when matched by characters). */
  at: number
  /** The text found there, as the piece has it. */
  text: string
}

/** What one test saw. Lists hold the first `EVIDENCE_MAX`; the totals count them all. */
export type Seen = { answer: Outcome; why: NoAnswer | null } & (
  | {
      test: 'count'
      /** The count the app shows, and then every other way it was counted. */
      counts: number[]
      compare: Compare
      n: number
    }
  | { test: 'has'; found: Found[]; missing: string[]; foundTotal: number; missingTotal: number }
  | {
      test: 'order'
      found: Found[]
      missing: string[]
      /** A value found out of place: after the one that should come last, before the one that should come first, or only before the one listed ahead of it. */
      out: Found | null
    }
  | { test: 'only'; outside: Found[]; otherNotation: Found[]; outsideTotal: number }
  | {
      test: 'measure'
      elements: Array<{ id: number; name: string; value: number | null }>
      compare: Compare
      px: number
      /** How many elements the layout does not list. */
      leftOut: number
    }
  | { test: 'none' }
)

type Outcome = 'met' | 'missed' | 'none'

export type ExactAnswer =
  | { answer: 'met' | 'missed'; saw: Seen[] }
  | { answer: 'none'; why: NoAnswer; saw: Seen[] }

/** The most found or missing values one test keeps as evidence. */
const EVIDENCE_MAX = 20

const OUTPUT_OF: Partial<Record<ArtifactKind, ReadOutput>> = {
  markdown: 'text',
  html: 'page',
  code: 'code',
}

/** The kind of output an exact reading reads a file of `kind` as; null for one it reads none of, such as a picture. */
export const outputOf = (kind: ArtifactKind): ReadOutput | null => OUTPUT_OF[kind] ?? null

/**
 * The version of how code answers a reading (`answerExact`), kept in the key
 * a pack's answer is kept by wherever a rule or check is read by code (`judgeKey`
 * in `application/grade.ts`). Raise it when an answer code gives, or what it
 * keeps of what it saw, changes, so an answer kept from before is worked out
 * again rather than taken as one code would give now.
 */
export const EXACT_VERSION = 2

/** The answer on one output of a reading that is `exact`. */
export function answerExact(
  reading: Extract<RuleReading, { reading: 'exact' }>,
  subject: ExactSubject,
): ExactAnswer {
  const output = OUTPUT_OF[subject.kind]
  if (!output || !reading.outputs.includes(output)) return { answer: 'none', why: 'kind', saw: [] }
  if (!subject.output.trim()) return { answer: 'none', why: 'empty', saw: [] }
  const reader = new Reader(subject, output)
  const saw = reading.tests.map((test) => answerTest(test, reader))
  return joined(reading.join, saw)
}

function joined(join: 'all' | 'any' | 'same', saw: Seen[]): ExactAnswer {
  const firstWhy = saw.find((s) => s.why)?.why ?? 'not there'
  const has = (outcome: Outcome) => saw.some((s) => s.answer === outcome)
  if (join === 'all') {
    if (has('missed')) return { answer: 'missed', saw }
    return has('none') ? { answer: 'none', why: firstWhy, saw } : { answer: 'met', saw }
  }
  if (join === 'any') {
    if (has('met')) return { answer: 'met', saw }
    return has('none') ? { answer: 'none', why: firstWhy, saw } : { answer: 'missed', saw }
  }
  const answered = saw.filter((s) => s.answer !== 'none')
  if (!answered.length) return { answer: 'none', why: firstWhy, saw }
  const first = answered[0].answer as 'met' | 'missed'
  return answered.every((s) => s.answer === first)
    ? { answer: first, saw }
    : { answer: 'none', why: 'differ', saw }
}

// ---------------------------------------------------------------- reading the output

/** One piece of a part: its text as read, and for a file its path. */
interface Piece {
  text: string
  file?: string
}

/** What a part reads: its pieces, or why it cannot be read. `counted` is the text the app counts words in, for `text`. */
type Read =
  | { pieces: Piece[]; counted?: { app: string; whole: string } }
  | { none: 'kind' | 'not there' }

/** HTML elements with no closing tag. */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

/** An HTML tag, opening or closing, with its attributes. `[^>]*` runs to the next `>`, as `pageText` reads a tag. */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g
/** One attribute in an opening tag: its name and its value in either quote, or bare. */
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
/** Elements whose content is no text a reader sees, and no tag. */
const RAW_CONTENT = /<(script|style|template|textarea)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi

interface Element {
  tag: string
  attributes: Map<string, string>
  /** Where its content starts and ends, and where the element ends, in the page as written. */
  inner: [number, number]
  end: number
}

class Reader {
  readonly kind: ReadOutput
  private readonly subject: ExactSubject
  private seenCache: string | null = null
  private maskedCache: string | null = null
  private elementsCache: Element[] | null = null

  constructor(subject: ExactSubject, kind: ReadOutput) {
    this.subject = subject
    this.kind = kind
  }

  get raw(): string {
    return normalizeNewlines(this.subject.output)
  }

  get from(): ExactSubject {
    return this.subject
  }

  /** What a reader sees: a page's visible text, a Markdown file's copy, code as written. */
  get seen(): string {
    this.seenCache ??=
      this.kind === 'page'
        ? visibleText(this.raw)
        : this.kind === 'text'
          ? copyOf(this.raw)
          : this.raw
    return this.seenCache
  }

  /** The page with its comments blanked and the content of its scripts and styles blanked, each to the same length. */
  get masked(): string {
    this.maskedCache ??= this.raw
      .replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => ' '.repeat(m.length))
      .replace(RAW_CONTENT, (m) => {
        const open = m.indexOf('>') + 1
        const close = m.lastIndexOf('</')
        const end = close > open ? close : m.length
        return m.slice(0, open) + ' '.repeat(end - open) + m.slice(end)
      })
    return this.maskedCache
  }

  get elements(): Element[] {
    this.elementsCache ??= elementsOf(this.masked)
    return this.elementsCache
  }

  read(part: Part): Read {
    const page = this.kind === 'page'
    switch (part.part) {
      case 'file':
        return { pieces: [{ text: this.raw }] }
      case 'text': {
        const text = part.skip ? withoutLabelled(this.seen, part.skip) : this.seen
        return { pieces: [{ text }], counted: this.counted(text, part.skip) }
      }
      case 'line': {
        if (page) return { none: 'kind' }
        const lines = linesOf(this.seen)
        if (part.label !== null) {
          const value = labelled(lines, part.label)
          return value === null ? { none: 'not there' } : { pieces: [{ text: value }] }
        }
        const n = part.number ?? 0
        const line = n > 0 ? lines[n - 1] : lines[lines.length + n]
        return line === undefined ? { none: 'not there' } : { pieces: [{ text: line }] }
      }
      case 'lines':
        return page ? { none: 'kind' } : { pieces: linesOf(this.seen).map((text) => ({ text })) }
      case 'styles': {
        if (!page) return { none: 'kind' }
        const tags = [...this.raw.matchAll(/<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi)].map(
          (m) => m[1],
        )
        const inline = this.elements.flatMap((e) => {
          const style = e.attributes.get('style')
          return style === undefined ? [] : [style]
        })
        return { pieces: [{ text: [...tags, ...inline].join('\n') }] }
      }
      case 'elements': {
        if (!page) return { none: 'kind' }
        let found = this.elements.filter((e) => e.tag === part.tag)
        if (part.which === 'first') found = found.slice(0, 1)
        if (part.which === 'last') found = found.slice(-1)
        return {
          pieces: found.flatMap((e) => {
            if (part.attribute === null)
              return [{ text: visibleText(this.masked.slice(e.inner[0], e.inner[1])).trim() }]
            const value = e.attributes.get(part.attribute)
            return value === undefined ? [] : [{ text: decodeEntities(value) }]
          }),
        }
      }
      case 'after': {
        if (!page) return { none: 'kind' }
        const last = this.elements.filter((e) => e.tag === part.tag).at(-1)
        return last
          ? { pieces: [{ text: visibleText(this.masked.slice(last.end)) }] }
          : { none: 'not there' }
      }
      case 'other file': {
        // No file the path names is no file read: not a count of none, and nothing found in none.
        const match = globOf(part.path)
        const files = Object.entries(this.subject.others)
          .filter(([path]) => match(path))
          .sort(([a], [b]) => a.localeCompare(b))
        return files.length
          ? { pieces: files.map(([file, text]) => ({ text: normalizeNewlines(text), file })) }
          : { none: 'not there' }
      }
    }
  }

  /**
   * The text the app counts words in, beside the whole of what a reader
   * sees: a Markdown file's words are counted in its paragraphs and lists,
   * without its headings and code (`countedText` in `application/grade.ts`),
   * a page's in its text without entities (`pageText`).
   */
  private counted(text: string, skip: string | null): { app: string; whole: string } {
    if (this.kind === 'text')
      return {
        app: unitsOf(text)
          .map((unit) => unit.text)
          .join(' '),
        whole: text,
      }
    if (this.kind === 'page') {
      const app = pageText(this.raw)
      return { app: skip ? withoutLabelled(app, skip) : app, whole: text }
    }
    return { app: text, whole: text }
  }
}

/** Elements a new one of the same name closes when left open, as a browser reads them. */
const CLOSED_BY_SIBLING = new Set(['p', 'li', 'dt', 'dd', 'option', 'tr', 'td', 'th'])

/**
 * A page's elements, in the order they open, each with where its content
 * runs. A closing tag closes the nearest open element of its name. One left
 * open runs to the end of the page, or, for a `<p>`, an `<li>` and the like,
 * to where the next of its name opens.
 */
function elementsOf(masked: string): Element[] {
  const elements: Element[] = []
  const open = new Map<string, Element[]>()
  for (const m of masked.matchAll(TAG)) {
    const tag = m[2].toLowerCase()
    const at = m.index ?? 0
    const end = at + m[0].length
    const stack = open.get(tag) ?? []
    open.set(tag, stack)
    if (m[1]) {
      const element = stack.pop()
      if (element) {
        element.inner[1] = at
        element.end = end
      }
      continue
    }
    if (CLOSED_BY_SIBLING.has(tag)) {
      const sibling = stack.pop()
      if (sibling) {
        sibling.inner[1] = at
        sibling.end = at
      }
    }
    const element: Element = { tag, attributes: attributesOf(m[3]), inner: [end, end], end }
    elements.push(element)
    if (VOID.has(tag) || /\/\s*$/.test(m[3])) continue
    element.inner[1] = masked.length
    element.end = masked.length
    stack.push(element)
  }
  return elements
}

function attributesOf(source: string): Map<string, string> {
  const attributes = new Map<string, string>()
  for (const m of source.matchAll(ATTRIBUTE)) {
    const name = m[1].toLowerCase()
    if (!attributes.has(name)) attributes.set(name, m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attributes
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  times: '×',
  divide: '÷',
  deg: '°',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  ouml: 'ö',
  uuml: 'ü',
  auml: 'ä',
  szlig: 'ß',
}

/** Character references read; a named one this does not know stays as written. */
const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[ref.toLowerCase()] ?? whole
  })

/**
 * The text a reader sees on a page, as `pageText` reads it, but with its
 * character references read rather than blanked, so `Slate &amp; Pine`
 * reads as `Slate & Pine`.
 */
function visibleText(html: string): string {
  return decodeEntities(
    stripComments(html)
      .replace(/<head\b[\s\S]*?(?:<\/head\s*>|(?=<body\b)|$)/gi, ' ')
      .replace(/<(script|style|template)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
}

/** The lines of a text that are not blank, trimmed. */
const linesOf = (text: string): string[] =>
  normalizeNewlines(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** Whether a line is labelled `label:`, in any case; its value after the colon, trimmed. */
function labelOf(line: string, label: string): string | null {
  const head = line.slice(0, label.length)
  if (head.toLowerCase() !== label.toLowerCase()) return null
  const rest = line.slice(label.length)
  const colon = /^\s*:/.exec(rest)
  return colon ? rest.slice(colon[0].length).trim() : null
}

/** The value of the first line labelled `label`; null when no line is. */
function labelled(lines: readonly string[], label: string): string | null {
  for (const line of lines) {
    const value = labelOf(line, label)
    if (value !== null) return value
  }
  return null
}

/** `text` without its first line that is not blank, when that line is labelled `label`. */
function withoutLabelled(text: string, label: string): string {
  const lines = normalizeNewlines(text).split('\n')
  const first = lines.findIndex((line) => line.trim())
  if (first < 0 || labelOf(lines[first].trim(), label) === null) return text
  return lines.slice(first + 1).join('\n')
}

/** A path with `*` for any characters but `/`, as a test: no pattern of the reading's own is run. */
function globOf(pattern: string): (path: string) => boolean {
  const parts = pattern.split('*')
  return (path) => {
    if (parts.length === 1) return path === pattern
    if (!path.startsWith(parts[0]) || !path.endsWith(parts[parts.length - 1])) return false
    let at = parts[0].length
    const stop = path.length - parts[parts.length - 1].length
    if (stop < at) return false
    for (const middle of parts.slice(1, -1)) {
      const found = path.indexOf(middle, at)
      if (found < 0 || found + middle.length > stop) return false
      if (path.slice(at, found).includes('/')) return false
      at = found + middle.length
    }
    return !path.slice(at, stop).includes('/')
  }
}

// ---------------------------------------------------------------- values from the request

type Drawn = { values: string[] } | { none: 'not there' }

/** Where values are drawn from: the request's text and the files it came with. */
type Source = Pick<ExactSubject, 'request' | 'files'>

/**
 * The values a `has` or an `order` test looks for, each once and none blank:
 * written into the reading, or drawn from `from`. Null where they are not
 * there, so the test has no answer.
 */
export function lookedFor(values: Values, from: Source): string[] | null {
  const drawn = valuesOf(values, from)
  if ('none' in drawn) return null
  const found = [...new Set(drawn.values.filter((v) => v.trim()))]
  return found.length ? found : null
}

/** The values a test looks for, from the reading or from the request. */
function valuesOf(values: Values, subject: Source): Drawn {
  if (values.from === 'listed') return { values: values.items }
  const regions =
    values.in === 'request'
      ? [subject.request]
      : values.in === 'file'
        ? values.file !== null && Object.hasOwn(subject.files, values.file)
          ? [subject.files[values.file]]
          : []
        : [subject.request, ...Object.values(subject.files)]
  if (!regions.length) return { none: 'not there' }
  const texts = regions.map(normalizeNewlines)
  if (!values.labels.length) {
    const all = texts.flatMap((text) => take(values.take, text, null, values.level))
    return { values: all }
  }
  const found = values.labels.map((label) => labelledIn(texts, label))
  if (found.some((f) => f === null)) return { none: 'not there' }
  const lines = found as Array<{ value: string; after: string[] }>
  if (values.take === 'whole') return { values: [lines.map((l) => l.value).join(' ')] }
  return {
    values: lines.flatMap(({ value, after }) => take(values.take, value, after, values.level)),
  }
}

/** The first labelled line among `texts`: its value, and the lines after it. */
function labelledIn(
  texts: readonly string[],
  label: string,
): { value: string; after: string[] } | null {
  for (const text of texts) {
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const value = labelOf(lines[i].trim(), label)
      if (value !== null) return { value, after: lines.slice(i + 1) }
    }
  }
  return null
}

const HEADING = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/

/** What `take` draws from a region's text; `under` holds the lines after a labelled line, for a list under it. */
function take(
  kind: Take,
  text: string,
  under: readonly string[] | null,
  level: number | null,
): string[] {
  switch (kind) {
    case 'whole':
      return text.trim() ? [text.trim()] : []
    case 'items':
    case 'item names': {
      const items = listItems(under ?? text.split('\n'), under !== null)
      return kind === 'items'
        ? items
        : items.map((item) => /^(.*?):(?:\s|$)/.exec(item)?.[1]?.trim() || item)
    }
    case 'headings':
      return withoutCode(text)
        .split('\n')
        .flatMap((line) => {
          const m = HEADING.exec(line)
          if (!m || (level !== null && m[1].length !== level)) return []
          const title = m[2].replace(/^\d+[.)]\s+/, '').trim()
          return title ? [title] : []
        })
    case 'quoted':
      return [...text.matchAll(/"([^"\n]+)"|“([^”\n]+)”/g)].map((m) => (m[1] ?? m[2]).trim())
    default:
      return thingsIn(kind, text).map((t) => t.value)
  }
}

/**
 * The list items of `lines`. Under a labelled line, the list that follows it,
 * up to the first line that is neither blank nor an item; in a whole region,
 * every item.
 */
function listItems(lines: readonly string[], underLabel: boolean): string[] {
  const items: string[] = []
  for (const line of lines) {
    const mark = LIST_MARKER.exec(line)
    if (mark) items.push(line.slice(mark[0].length).trim())
    else if (underLabel && line.trim()) break
  }
  return items
}

// ---------------------------------------------------------------- named patterns

const LINK = /https?:\/\/[^\s<>"'()]+/g
/**
 * A link written without its scheme, as a page shows one: a host whose last
 * part is letters, then a path (`ferry.example/4-0`). Only the numbers read
 * it, so a number in it is not one of the writer's own; a link is counted
 * only with its scheme, since whether a bare host is a link is a reader's call.
 */
const BARE_LINK = /(?<![\w@./-])(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'()]*/gi
/** An address starts where no address character runs on before it, so each place is tried once. */
const ADDRESS = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const NUMBER = /\d+(?:[.,:]\d+)*/g
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi
/** A number and the three capitals of a currency code: `12 USD`, `1,200.50 EUR`. */
const AMOUNT = /(?<![\d.,])\d[\d,]*(?:\.\d+)?\s?[A-Z]{3}(?![A-Za-z])/g

interface ThingFound {
  value: string
  at: number
  text: string
}

/** The things of a kind in `text`, each as compared (`value`) and as written. */
function thingsIn(kind: Thing, text: string): ThingFound[] {
  const found = (pattern: RegExp, source: string, value: (raw: string) => string) =>
    [...source.matchAll(pattern)].map((m) => ({
      value: value(m[0]),
      at: m.index ?? 0,
      text: m[0],
    }))
  switch (kind) {
    case 'links':
      return found(LINK, text, (raw) => raw.replace(/[.,;:!?]+$/, '')).map((t) => ({
        ...t,
        text: t.value,
      }))
    case 'addresses':
      return found(ADDRESS, text, (raw) => raw.toLowerCase())
    case 'numbers': {
      // A number in a link (with its scheme or without), an address or a hex colour is part of it.
      const blank = (m: string) => ' '.repeat(m.length)
      const plain = text
        .replace(LINK, blank)
        .replace(ADDRESS, blank)
        .replace(BARE_LINK, blank)
        .replace(HEX, blank)
      return found(NUMBER, plain, (raw) => raw.replace(/,/g, ''))
    }
    case 'hex colours':
      return found(HEX, text, hexOf)
    case 'amounts':
      return found(AMOUNT, text, (raw) => {
        const m = /^([\d,]+(?:\.\d+)?)\s?([A-Z]{3})$/.exec(raw)
        return m ? `${m[1].replace(/,/g, '')} ${m[2]}` : raw
      })
  }
}

/** A hex colour as six lower-case digits: three or four digits doubled, an alpha dropped. */
function hexOf(raw: string): string {
  const digits = raw.slice(1).toLowerCase()
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits
  return `#${full.slice(0, 6)}`
}

/** The CSS colour keywords: a colour written as a word, which `hex colours` does not read. */
const COLOUR_NAMES =
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
/** A colour written as a function, or as a keyword standing as a value. */
const OTHER_COLOUR = new RegExp(
  `\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|(?<=[:\\s,(])(?:${COLOUR_NAMES.split(' ').join('|')})(?=[\\s;},)!]|$)`,
  'gi',
)

// ---------------------------------------------------------------- matching

/** Text as compared: composed, quotes straight, every kind of space a space, and in one case when case does not count. */
function normal(text: string, letterCase: CaseRule): string {
  const plain = text
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[  -   　]/g, ' ')
  return letterCase === 'any' ? plain.toLowerCase() : plain
}

/** A word as the app counts one (`words` in `text.ts`), found with where it is. */
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu
const WORDISH = /[\p{L}\p{M}\p{N}]/u

interface Token {
  word: string
  at: number
}

const tokensOf = (text: string): Token[] =>
  [...text.matchAll(WORD)].map((m) => ({ word: m[0], at: m.index ?? 0 }))

/** One piece made ready to look in: its text as compared, and its words. */
interface Prepared {
  text: string
  words: Token[]
}

interface Occurrence {
  value: number
  piece: number
  /** Its start and end: words for `words`, characters for `characters`. */
  start: number
  end: number
  at: number
  text: string
}

class Matcher {
  private readonly match: Match
  private readonly pieces: Prepared[]
  private readonly values: Array<{ text: string; words: string[] }>

  constructor(
    pieces: readonly Piece[],
    values: readonly string[],
    match: Match,
    letterCase: CaseRule,
  ) {
    this.match = match
    const prepare = (text: string) =>
      match === 'characters'
        ? normal(text, letterCase).replace(/\s+/g, ' ').trim()
        : normal(text, letterCase)
    this.pieces = pieces.map((piece) => {
      const text = prepare(piece.text)
      return { text, words: match === 'words' ? tokensOf(text) : [] }
    })
    // A value keeps a space at its ends: `- ` is a list mark, `-` a dash.
    this.values = values.map((value) => {
      const text =
        match === 'characters'
          ? normal(value, letterCase).replace(/\s+/g, ' ')
          : normal(value, letterCase)
      return { text, words: tokensOf(text).map((t) => t.word) }
    })
  }

  /** The values that can be looked for: a value with no word cannot be found as words. */
  usable(index: number): boolean {
    const value = this.values[index]
    return this.match === 'words' ? value.words.length > 0 : value.text.length > 0
  }

  /**
   * Every place each value is found, in the order of the output. Where two
   * values are found at one place, the longer stands and the shorter is not
   * found there: `Faster search` inside `Faster search, part 2` is not found.
   */
  occurrences(): Occurrence[] {
    const all: Occurrence[] = []
    this.pieces.forEach((piece, p) => {
      this.values.forEach((value, v) => {
        if (!this.usable(v)) return
        for (const [start, end] of this.places(piece, value))
          all.push(this.occurrence(piece, p, v, start, end))
      })
    })
    const longest = new Map<string, Occurrence>()
    for (const o of all) {
      const key = `${o.piece}:${o.start}`
      const held = longest.get(key)
      if (!held || o.end > held.end) longest.set(key, o)
    }
    return [...longest.values()].sort((a, b) => a.piece - b.piece || a.start - b.start)
  }

  /**
   * Whether the value is found at `at` in any piece; the first place it is.
   * As in `occurrences`, a longer value found from the same start, or for
   * `end` to the same end, takes the place: a piece that starts with
   * `Faster search, part 2` does not start with `Faster search`.
   */
  foundAt(index: number, at: At): Occurrence | null {
    if (!this.usable(index)) return null
    const value = this.values[index]
    for (const [p, piece] of this.pieces.entries()) {
      const places = [...this.places(piece, value)]
      const size = this.match === 'words' ? piece.words.length : piece.text.length
      const place = places.find(
        ([start, end]) =>
          (at === 'start'
            ? start === 0
            : at === 'end'
              ? end === size
              : at === 'whole'
                ? start === 0 && end === size
                : true) && !this.longerAt(piece, index, start, end, at === 'end'),
      )
      if (place) return this.occurrence(piece, p, index, place[0], place[1])
    }
    return null
  }

  /** Whether another value is found over `[start, end]` and past it, from the same start (or to the same end). */
  private longerAt(
    piece: Prepared,
    index: number,
    start: number,
    end: number,
    fromEnd: boolean,
  ): boolean {
    return this.values.some((other, v) => {
      if (v === index || !this.usable(v)) return false
      for (const [s, e] of this.places(piece, other))
        if (fromEnd ? e === end && s < start : s === start && e > end) return true
      return false
    })
  }

  private *places(
    piece: Prepared,
    value: { text: string; words: string[] },
  ): Generator<[number, number]> {
    if (this.match === 'words') {
      const n = value.words.length
      for (let i = 0; i + n <= piece.words.length; i++) {
        let same = true
        for (let j = 0; j < n && same; j++) same = piece.words[i + j].word === value.words[j]
        if (same) yield [i, i + n]
      }
      return
    }
    const needle = value.text
    let from = 0
    for (;;) {
      const at = piece.text.indexOf(needle, from)
      if (at < 0) return
      const end = at + needle.length
      const before = at > 0 ? piece.text[at - 1] : ''
      const after = piece.text[end] ?? ''
      // A value that starts or ends with a letter or a digit is not found inside a longer word.
      const open = !WORDISH.test(needle[0]) || !WORDISH.test(before)
      const close = !WORDISH.test(needle[needle.length - 1]) || !WORDISH.test(after)
      if (open && close) yield [at, end]
      from = at + 1
    }
  }

  private occurrence(
    piece: Prepared,
    p: number,
    v: number,
    start: number,
    end: number,
  ): Occurrence {
    if (this.match === 'characters')
      return { value: v, piece: p, start, end, at: start, text: piece.text.slice(start, end) }
    const first = piece.words[start]
    const last = piece.words[end - 1]
    const at = first?.at ?? 0
    const stop = last ? last.at + last.word.length : at
    return { value: v, piece: p, start, end, at, text: piece.text.slice(at, stop) }
  }
}

// ---------------------------------------------------------------- the tests

const none = (why: NoAnswer): Seen => ({ test: 'none', answer: 'none', why })

const compared = (count: number, compare: Compare, n: number): boolean =>
  compare === 'at most' ? count <= n : compare === 'at least' ? count >= n : count === n

function answerTest(test: ExactTest, reader: Reader): Seen {
  if (test.test === 'measure') return measured(test, reader)
  const read = reader.read(test.read)
  if ('none' in read) return none(read.none)
  const { pieces } = read
  if (test.test === 'count') return counted(test, read)
  if (test.test === 'only') return only(test, pieces, reader.from)
  const values = lookedFor(test.values, reader.from)
  if (!values) return none('not there')
  const matcher = new Matcher(pieces, values, test.match, test.case)
  const looked = values.map((_, i) => i).filter((i) => matcher.usable(i))
  if (!looked.length) return none('not there')
  return test.test === 'has'
    ? has(test, matcher, values, looked)
    : ordered(test, matcher, values, looked)
}

const foundOf = (o: Occurrence, values: readonly string[]): Found => ({
  value: values[o.value],
  piece: o.piece,
  at: o.at,
  text: o.text,
})

/**
 * Whether a part of one piece that reads `piece` meets a `has` test looking
 * for `values`, as the test answers it on an output. For working out from two
 * readings alone whether one output can meet both (`both-hold.ts`).
 */
export function hasInPiece(
  test: Extract<ExactTest, { test: 'has' }>,
  values: readonly string[],
  piece: string,
): boolean {
  const matcher = new Matcher([{ text: piece }], values, test.match, test.case)
  const looked = values.map((_, i) => i).filter((i) => matcher.usable(i))
  return looked.length > 0 && has(test, matcher, values, looked).answer === 'met'
}

function has(
  test: Extract<ExactTest, { test: 'has' }>,
  matcher: Matcher,
  values: readonly string[],
  looked: readonly number[],
): Seen {
  let hits: Array<Occurrence | null>
  if (test.at === 'anywhere') {
    const first = new Map<number, Occurrence>()
    for (const o of matcher.occurrences()) if (!first.has(o.value)) first.set(o.value, o)
    hits = looked.map((i) => first.get(i) ?? null)
  } else hits = looked.map((i) => matcher.foundAt(i, test.at))
  const found = hits.filter((h): h is Occurrence => h !== null)
  const missing = looked.filter((_, k) => hits[k] === null).map((i) => values[i])
  const met =
    test.need === 'all'
      ? missing.length === 0
      : test.need === 'any'
        ? found.length > 0
        : found.length === 0
  return {
    test: 'has',
    answer: met ? 'met' : 'missed',
    why: null,
    found: found.slice(0, EVIDENCE_MAX).map((o) => foundOf(o, values)),
    missing: missing.slice(0, EVIDENCE_MAX),
    foundTotal: found.length,
    missingTotal: missing.length,
  }
}

function ordered(
  test: Extract<ExactTest, { test: 'order' }>,
  matcher: Matcher,
  values: readonly string[],
  looked: readonly number[],
): Seen {
  const all = matcher.occurrences()
  const after = (a: Occurrence, b: Occurrence) =>
    a.piece > b.piece || (a.piece === b.piece && a.start >= b.end)
  const seen = (
    answer: Outcome,
    found: Occurrence[],
    missing: number[],
    out: Occurrence | null,
  ): Seen => ({
    test: 'order',
    answer,
    why: null,
    found: found.slice(0, EVIDENCE_MAX).map((o) => foundOf(o, values)),
    missing: missing.slice(0, EVIDENCE_MAX).map((i) => values[i]),
    out: out ? foundOf(out, values) : null,
  })
  if (test.mode === 'in order') {
    const found: Occurrence[] = []
    let last: Occurrence | null = null
    for (const i of looked) {
      const own = all.filter((o) => o.value === i)
      if (!own.length) return seen('missed', found, [i], null)
      const next = own.find((o) => !last || after(o, last))
      if (!next) return seen('missed', found, [], own[0])
      found.push(next)
      last = next
    }
    return seen('met', found, [], null)
  }
  // `last`: the last listed, where it is last found, comes after every other value where that is last found.
  const lastWanted = test.mode === 'last'
  const key = lastWanted ? looked[looked.length - 1] : looked[0]
  const pick = (i: number) => {
    const own = all.filter((o) => o.value === i)
    return lastWanted ? own.at(-1) : own[0]
  }
  const mark = pick(key)
  if (!mark) return seen('missed', [], [key], null)
  const later = (a: Occurrence, b: Occurrence) =>
    a.piece > b.piece || (a.piece === b.piece && a.start > b.start)
  for (const i of looked) {
    if (i === key) continue
    const other = pick(i)
    if (other && (lastWanted ? later(other, mark) : later(mark, other)))
      return seen('missed', [mark], [], other)
  }
  return seen('met', [mark], [], null)
}

function counted(
  test: Extract<ExactTest, { test: 'count' }>,
  read: Extract<Read, { pieces: Piece[] }>,
): Seen {
  const { pieces } = read
  const seen = (counts: number[]): Seen => {
    const answers = new Set(counts.map((count) => compared(count, test.compare, test.n)))
    return {
      test: 'count',
      answer: answers.size > 1 ? 'none' : answers.has(true) ? 'met' : 'missed',
      why: answers.size > 1 ? 'convention' : null,
      counts,
      compare: test.compare,
      n: test.n,
    }
  }
  if (test.what === 'items') return seen([pieces.length])
  const sum = (count: (text: string) => number) =>
    pieces.reduce((total, piece) => total + count(piece.text), 0)
  if (test.what === 'words') {
    // The app's count first; then the other ways two people count words: spaces between, headings in.
    const texts = read.counted ? [read.counted.app, read.counted.whole] : null
    if (texts)
      return seen([
        words(texts[0]).length,
        tokens(texts[0]).length,
        words(texts[1]).length,
        tokens(texts[1]).length,
      ])
    return seen([sum((t) => words(t).length), sum((t) => tokens(t).length)])
  }
  if (test.what === 'characters') {
    const plain = (t: string) => t.normalize('NFC').replace(/\s+/g, ' ').trim()
    const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })
    return seen([
      sum((t) => [...graphemes.segment(plain(t))].length),
      sum((t) => [...plain(t)].length),
      sum((t) => plain(t).length),
    ])
  }
  const thing = test.what
  return seen([sum((t) => thingsIn(thing, t).length)])
}

function only(
  test: Extract<ExactTest, { test: 'only' }>,
  pieces: readonly Piece[],
  subject: ExactSubject,
): Seen {
  const drawn = valuesOf(test.allowed, subject)
  if ('none' in drawn) return none(drawn.none)
  const allowed = new Set(drawn.values.flatMap((v) => thingsIn(test.what, v).map((t) => t.value)))
  const outside: Found[] = []
  const other: Found[] = []
  pieces.forEach((piece, p) => {
    for (const t of thingsIn(test.what, piece.text))
      if (!allowed.has(t.value)) outside.push({ value: t.value, piece: p, at: t.at, text: t.text })
    if (test.what === 'hex colours')
      for (const m of piece.text.matchAll(OTHER_COLOUR))
        other.push({ value: m[0], piece: p, at: m.index ?? 0, text: m[0] })
  })
  const answer: Outcome = outside.length ? 'missed' : other.length ? 'none' : 'met'
  return {
    test: 'only',
    answer,
    why: answer === 'none' ? 'other notation' : null,
    outside: outside.slice(0, EVIDENCE_MAX),
    otherNotation: other.slice(0, EVIDENCE_MAX),
    outsideTotal: outside.length,
  }
}

function measured(test: Extract<ExactTest, { test: 'measure' }>, reader: Reader): Seen {
  if (reader.kind !== 'page') return none('kind')
  const layout = reader.from.layout
  if (!layout) return none('not measured')
  const tagOf = (name: string) => /^[a-z][a-z0-9-]*/.exec(name)?.[0] ?? ''
  const matching = layout.elements.filter((e) => tagOf(e.name) === test.tag)
  const read = matching.flatMap((e) => {
    if (test.property === 'width')
      return [{ id: e.id, name: e.name, value: e.width as number | null }]
    if (test.property === 'height')
      return [{ id: e.id, name: e.name, value: e.height as number | null }]
    if (e.font === null) return []
    const px = /^(\d+(?:\.\d+)?)px$/.exec(e.font)
    return [{ id: e.id, name: e.name, value: px ? Number(px[1]) : null }]
  })
  const elements = read.slice(0, EVIDENCE_MAX)
  const base = {
    test: 'measure' as const,
    elements,
    compare: test.compare,
    px: test.px,
    leftOut: layout.leftOut,
  }
  if (!read.length)
    return { ...base, answer: 'none', why: layout.leftOut ? 'not listed' : 'not there' }
  if (read.some((e) => e.value === null)) return { ...base, answer: 'none', why: 'other notation' }
  const holds = read.map((e) => compared(e.value as number, test.compare, test.px))
  if (test.each === 'every') {
    if (holds.includes(false)) return { ...base, answer: 'missed', why: null }
    return layout.leftOut
      ? { ...base, answer: 'none', why: 'not listed' }
      : { ...base, answer: 'met', why: null }
  }
  if (holds.includes(true)) return { ...base, answer: 'met', why: null }
  return layout.leftOut
    ? { ...base, answer: 'none', why: 'not listed' }
    : { ...base, answer: 'missed', why: null }
}
