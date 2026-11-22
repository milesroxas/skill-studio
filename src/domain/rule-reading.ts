/**
 * How a rule or a check is read: answered by code (`exact`), asked of Jev
 * (`judged`), or not markable as written (`unmarkable`). An assistant reads
 * each rule of a skill version and each check of a case once and fills this
 * shape; code answers an exact one (`answerExact` in `exact.ts`).
 *
 * Nothing a model writes runs. An exact reading picks tests from a closed set
 * and fills in their values, and every value is data held to this shape by
 * `readRuleReading`: an enum is one of its members, a number is a whole
 * number in bounds, a string is short, and there is no pattern of the
 * model's own. Text is looked for as words or as characters, never as a
 * regular expression, and the patterns that find a number, a link, an
 * address, a colour or an amount are this file's, fixed and linear.
 *
 * Pure data and functions.
 */
import type { Span } from './span.ts'

/** The kinds of output an exact reading can read: text (Markdown or plain), a page, code. */
const READ_OUTPUTS = ['text', 'page', 'code'] as const
export type ReadOutput = (typeof READ_OUTPUTS)[number]

/**
 * How the answers of an exact reading's tests make one answer.
 * - `all`: met when every test is met, missed when any is missed.
 * - `any`: met when any test is met, missed when every one is missed.
 * - `same`: the tests are the readings two people could hold of one rule (an
 *   email opens with its subject or with its first line): the answer of those
 *   that could be read, when they agree, and none when they differ.
 */
const JOINS = ['all', 'any', 'same'] as const
export type Join = (typeof JOINS)[number]

/**
 * What part of the output a test reads, as pieces of text.
 * - `file`: the output as written, tags, marks and front matter included. One piece.
 * - `text`: what a reader sees. A page's visible text; a Markdown or text file
 *   without its front matter and comments; code as written. With `skip`, a
 *   first line labelled `skip:` is left out (an email's body under its
 *   `Subject:`). One piece.
 * - `line`: one line of the text: the first labelled `label:` (its value,
 *   after the colon), or the `number`th line that is not blank, from 1, or
 *   from the end when negative. Text and code only. One piece.
 * - `lines`: every line of the text that is not blank, each a piece. Text and code only.
 * - `styles`: a page's `<style>` tags and `style` attributes. One piece.
 * - `elements`: a page's elements with the tag, each a piece: its visible
 *   text, or with `attribute` that attribute's value (an element without it is
 *   no piece). `which` keeps every one, the first or the last.
 * - `after`: a page's visible text after the last element with the tag closes. One piece.
 * - `other file`: another file the agent wrote, by its path in the output
 *   folder (`outputs/sum.test.mjs`); a `*` stands for any characters but `/`.
 *   Each file that matches is a piece, as written.
 */
export type Part =
  | { part: 'file' }
  | { part: 'text'; skip: string | null }
  | { part: 'line'; label: string | null; number: number | null }
  | { part: 'lines' }
  | { part: 'styles' }
  | { part: 'elements'; tag: string; attribute: string | null; which: Which }
  | { part: 'after'; tag: string }
  | { part: 'other file'; path: string }

export const PARTS = [
  'file',
  'text',
  'line',
  'lines',
  'styles',
  'elements',
  'after',
  'other file',
] as const
const WHICH = ['every', 'first', 'last'] as const
export type Which = (typeof WHICH)[number]

/** Kinds of value with a fixed pattern of this app's, which a test can count or hold to a source. */
const THINGS = ['numbers', 'links', 'addresses', 'hex colours', 'amounts'] as const
export type Thing = (typeof THINGS)[number]

/**
 * What is taken from where values are drawn:
 * - `whole`: the region as one value; several labelled lines joined by a space.
 * - `items`, `item names`: each Markdown list item in it (under a labelled
 *   line, the list that follows it), whole or up to its first `: `.
 * - `headings`: each Markdown heading's text, without a leading number such as
 *   `12.`; `level` keeps one level.
 * - `quoted`: each run of words in double quotes, straight or curly.
 * - a `Thing`: each one found in it.
 */
export const TAKES = ['whole', 'items', 'item names', 'headings', 'quoted', ...THINGS] as const
export type Take = (typeof TAKES)[number]

/** Where request values come from: the request's own text, one file it came with, or all of them. */
const SOURCES = ['request', 'file', 'request and files'] as const
export type SourceIn = (typeof SOURCES)[number]

/**
 * The values a test looks for: written into the reading (`listed`), or drawn
 * from the request when the output is answered, since a rule is read once per
 * skill version and each case's request differs. `labels` narrows the region
 * to the value of the lines labelled so (`Headline: ...`); none keeps it
 * whole. A label the region does not have leaves the values not there, and
 * so the test without an answer: "when the brief gives a Price".
 */
export type Values =
  | { from: 'listed'; items: string[] }
  | {
      from: 'request'
      in: SourceIn
      /** The file's name as the agent got it, such as `brief.md`, for `in: 'file'`; null otherwise. */
      file: string | null
      labels: string[]
      take: Take
      /** The heading level `headings` keeps, 1 to 6; null for every level, and for any other take. */
      level: number | null
    }

/**
 * How text is looked for. `words` compares the words alone, as the app counts
 * them, so punctuation, spacing and markup between words do not count;
 * `characters` compares the characters, with runs of white space as one
 * space. Either way a value that starts or ends with a letter or a digit is
 * found only where no letter or digit runs on from it, so `user` is not found
 * in `username`. `case` is `any` or `exact`.
 */
const MATCHES = ['words', 'characters'] as const
export type Match = (typeof MATCHES)[number]
const CASES = ['any', 'exact'] as const
export type CaseRule = (typeof CASES)[number]

/** Whether the values are all found, any is, or none is. */
const NEEDS = ['all', 'any', 'none'] as const
export type Need = (typeof NEEDS)[number]

/** Where in a piece a value is looked for: anywhere, at its start or end, or as the whole of it. */
export const ATS = ['anywhere', 'start', 'end', 'whole'] as const
export type At = (typeof ATS)[number]

const COMPARES = ['at most', 'at least', 'exactly'] as const
export type Compare = (typeof COMPARES)[number]

/**
 * What a count counts: words (as the app counts them, beside the other ways
 * two people count them), characters, the pieces the part reads (its
 * elements, lines or files: `items`), or a `Thing`.
 */
export const COUNTED = ['words', 'characters', 'items', ...THINGS] as const
export type Counted = (typeof COUNTED)[number]

/**
 * An order among values: `in order` finds them in the order listed, one after
 * another; `last` finds the last listed after every other (by where each is
 * last found), `first` the first listed before every other (by where each is
 * first found).
 */
const ORDERS = ['in order', 'first', 'last'] as const
export type OrderMode = (typeof ORDERS)[number]

/** What a measured page holds of an element, in CSS px. */
const PROPERTIES = ['width', 'height', 'font size'] as const
export type Property = (typeof PROPERTIES)[number]

/** Every element measured (`every`), or at least one (`any`). */
const EACH = ['every', 'any'] as const
export type Each = (typeof EACH)[number]

/** One test from the closed set. */
export type ExactTest =
  | { test: 'count'; read: Part; what: Counted; compare: Compare; n: number }
  | {
      test: 'has'
      read: Part
      values: Values
      need: Need
      at: At
      match: Match
      case: CaseRule
    }
  | { test: 'order'; read: Part; values: Values; mode: OrderMode; match: Match; case: CaseRule }
  | { test: 'only'; read: Part; what: Thing; allowed: Values }
  | {
      test: 'measure'
      tag: string
      property: Property
      each: Each
      compare: Compare
      px: number
    }

export const TESTS = ['count', 'has', 'order', 'only', 'measure'] as const

/** Why nobody can mark a rule as written. */
const UNMARKABLE = ['vague', 'conflict'] as const
export type Unmarkable = (typeof UNMARKABLE)[number]

/** How a rule or a check is read. */
export type RuleReading =
  | {
      reading: 'exact'
      /** The kinds of output it reads; another kind has no answer. */
      outputs: ReadOutput[]
      join: Join
      tests: ExactTest[]
    }
  | {
      reading: 'judged'
      /** How Jev's answers about the parts of a long output make one answer. */
      span: Span
    }
  | {
      reading: 'unmarkable'
      /** `vague`, or for a rule only, `conflict`: a check is never in conflict (`CannotHold` in `sorting.ts`). */
      why: Unmarkable
      /**
       * For `conflict`, the rule it cannot hold beside, by its id (`r4`), or on
       * one case alone the check (`c2`, set by `currentReadings`); null for `vague`.
       */
      with: string | null
      /** The words that would make it markable; null when the reader has none. */
      fix: string | null
    }

export const SPANS: readonly Span[] = ['any', 'every', 'start', 'end', 'whole']

/** The most tests one reading joins. */
const TESTS_MAX = 6
/** The most values a reading lists, and the longest one. */
const LISTED_MAX = 50
const VALUE_MAX = 300
/** The most labels one source names, and the longest. */
const LABELS_MAX = 4
const LABEL_MAX = 60
/** The longest rule or check id, fix and path a reading holds. */
const ID_MAX = 200
export const FIX_MAX = 600
const PATH_MAX = 200
/** The largest count and the largest length a test compares with. */
const COUNT_MAX = 1_000_000
const PX_MAX = 100_000

const TAG = /^[a-z][a-z0-9-]{0,31}$/
const ATTRIBUTE = /^[a-z][a-z0-9_:.-]{0,39}$/
/** A name as a request's file or an output's path is given: no `..`, no root, no backslash, no control character. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused
const UNSAFE_PATH = /(^|\/)\.\.(\/|$)|^\/|\\|[\u0000-\u001f\u007f]/

/** One refusal: what in the reading is wrong, by its path in it. Not display copy. */
class Refused extends Error {}

const refuse = (path: string, problem: string): never => {
  throw new Refused(`${path}: ${problem}`)
}

const objectAt = (value: unknown, path: string): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : refuse(path, 'is not an object')

/** `value` as an object holding exactly `keys`: a key missing or one more is refused. */
function fields(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  const record = objectAt(value, path)
  for (const key of Object.keys(record))
    if (!keys.includes(key)) refuse(`${path}.${key}`, 'is not a field of this shape')
  for (const key of keys) if (!Object.hasOwn(record, key)) refuse(`${path}.${key}`, 'is missing')
  return record
}

const oneOf = <T extends string>(value: unknown, path: string, set: readonly T[]): T =>
  (set as readonly unknown[]).includes(value)
    ? (value as T)
    : refuse(path, `is not one of ${set.join(', ')}`)

/** A string in bounds, trimmed, or as written for a value whose spaces count (`- `, a list mark). */
function text(value: unknown, path: string, max: number, { trim = true } = {}): string {
  if (typeof value !== 'string') return refuse(path, 'is not a string')
  if (!value.trim()) return refuse(path, 'is blank')
  const kept = trim ? value.trim() : value
  if (kept.length > max) return refuse(path, `is longer than ${max} characters`)
  return kept
}

const textOrNull = (value: unknown, path: string, max: number): string | null =>
  value === null ? null : text(value, path, max)

function whole(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value))
    return refuse(path, 'is not a whole number')
  if (value < min || value > max) return refuse(path, `is not between ${min} and ${max}`)
  return value
}

function list<T>(
  value: unknown,
  path: string,
  min: number,
  max: number,
  item: (v: unknown, p: string) => T,
): T[] {
  if (!Array.isArray(value)) return refuse(path, 'is not a list')
  if (value.length < min || value.length > max)
    return refuse(path, `does not hold ${min} to ${max} items`)
  return value.map((v, i) => item(v, `${path}[${i}]`))
}

function pattern(value: unknown, path: string, shape: RegExp, what: string): string {
  const name = text(value, path, 64).toLowerCase()
  return shape.test(name) ? name : refuse(path, `is not ${what}`)
}

function pathOf(value: unknown, path: string): string {
  const name = text(value, path, PATH_MAX)
  if (UNSAFE_PATH.test(name)) refuse(path, 'is not a path inside the folder')
  if ((name.match(/\*/g) ?? []).length > 3) refuse(path, 'has more than three *')
  return name
}

function readPart(value: unknown, path: string): Part {
  const kind = oneOf(objectAt(value, path).part, `${path}.part`, PARTS)
  switch (kind) {
    case 'file':
    case 'lines':
    case 'styles':
      fields(value, path, ['part'])
      return { part: kind }
    case 'text': {
      const f = fields(value, path, ['part', 'skip'])
      return { part: kind, skip: textOrNull(f.skip, `${path}.skip`, LABEL_MAX) }
    }
    case 'line': {
      const f = fields(value, path, ['part', 'label', 'number'])
      const label = textOrNull(f.label, `${path}.label`, LABEL_MAX)
      const number = f.number === null ? null : whole(f.number, `${path}.number`, -50, 50)
      if ((label === null) === (number === null))
        refuse(path, 'names neither or both of label and number')
      if (number === 0) refuse(`${path}.number`, 'is 0; lines count from 1, or from -1 at the end')
      return { part: kind, label, number }
    }
    case 'elements': {
      const f = fields(value, path, ['part', 'tag', 'attribute', 'which'])
      return {
        part: kind,
        tag: pattern(f.tag, `${path}.tag`, TAG, 'a tag name'),
        attribute:
          f.attribute === null
            ? null
            : pattern(f.attribute, `${path}.attribute`, ATTRIBUTE, 'an attribute name'),
        which: oneOf(f.which, `${path}.which`, WHICH),
      }
    }
    case 'after': {
      const f = fields(value, path, ['part', 'tag'])
      return { part: kind, tag: pattern(f.tag, `${path}.tag`, TAG, 'a tag name') }
    }
    case 'other file': {
      const f = fields(value, path, ['part', 'path'])
      return { part: kind, path: pathOf(f.path, `${path}.path`) }
    }
  }
}

function readValues(value: unknown, path: string): Values {
  const from = oneOf(objectAt(value, path).from, `${path}.from`, ['listed', 'request'] as const)
  if (from === 'listed') {
    const f = fields(value, path, ['from', 'items'])
    return {
      from,
      items: list(f.items, `${path}.items`, 1, LISTED_MAX, (v, p) =>
        text(v, p, VALUE_MAX, { trim: false }),
      ),
    }
  }
  const f = fields(value, path, ['from', 'in', 'file', 'labels', 'take', 'level'])
  const source = oneOf(f.in, `${path}.in`, SOURCES)
  const file = f.file === null ? null : pathOf(f.file, `${path}.file`)
  if ((source === 'file') !== (file !== null))
    refuse(`${path}.file`, 'names a file only when values come from one file')
  const take = oneOf(f.take, `${path}.take`, TAKES)
  const level = f.level === null ? null : whole(f.level, `${path}.level`, 1, 6)
  if (level !== null && take !== 'headings') refuse(`${path}.level`, 'is for headings only')
  return {
    from,
    in: source,
    file,
    labels: list(f.labels, `${path}.labels`, 0, LABELS_MAX, (v, p) => text(v, p, LABEL_MAX)),
    take,
    level,
  }
}

/** Parts a page has no such thing as, and parts only a page has. */
const LINE_PARTS: ReadonlySet<Part['part']> = new Set(['line', 'lines'])
const PAGE_PARTS: ReadonlySet<Part['part']> = new Set(['styles', 'elements', 'after'])

function readTest(value: unknown, path: string): ExactTest {
  const kind = oneOf(objectAt(value, path).test, `${path}.test`, TESTS)
  switch (kind) {
    case 'count': {
      const f = fields(value, path, ['test', 'read', 'what', 'compare', 'n'])
      return {
        test: kind,
        read: readPart(f.read, `${path}.read`),
        what: oneOf(f.what, `${path}.what`, COUNTED),
        compare: oneOf(f.compare, `${path}.compare`, COMPARES),
        n: whole(f.n, `${path}.n`, 0, COUNT_MAX),
      }
    }
    case 'has': {
      const f = fields(value, path, ['test', 'read', 'values', 'need', 'at', 'match', 'case'])
      const test: ExactTest = {
        test: kind,
        read: readPart(f.read, `${path}.read`),
        values: readValues(f.values, `${path}.values`),
        need: oneOf(f.need, `${path}.need`, NEEDS),
        at: oneOf(f.at, `${path}.at`, ATS),
        match: oneOf(f.match, `${path}.match`, MATCHES),
        case: oneOf(f.case, `${path}.case`, CASES),
      }
      wordsListed(test.values, test.match, `${path}.values`)
      return test
    }
    case 'order': {
      const f = fields(value, path, ['test', 'read', 'values', 'mode', 'match', 'case'])
      const test: ExactTest = {
        test: kind,
        read: readPart(f.read, `${path}.read`),
        values: readValues(f.values, `${path}.values`),
        mode: oneOf(f.mode, `${path}.mode`, ORDERS),
        match: oneOf(f.match, `${path}.match`, MATCHES),
        case: oneOf(f.case, `${path}.case`, CASES),
      }
      if (test.values.from === 'listed' && test.values.items.length < 2)
        refuse(`${path}.values.items`, 'lists fewer than two values to order')
      wordsListed(test.values, test.match, `${path}.values`)
      return test
    }
    case 'only': {
      const f = fields(value, path, ['test', 'read', 'what', 'allowed'])
      return {
        test: kind,
        read: readPart(f.read, `${path}.read`),
        what: oneOf(f.what, `${path}.what`, THINGS),
        allowed: readValues(f.allowed, `${path}.allowed`),
      }
    }
    case 'measure': {
      const f = fields(value, path, ['test', 'tag', 'property', 'each', 'compare', 'px'])
      return {
        test: kind,
        tag: pattern(f.tag, `${path}.tag`, TAG, 'a tag name'),
        property: oneOf(f.property, `${path}.property`, PROPERTIES),
        each: oneOf(f.each, `${path}.each`, EACH),
        compare: oneOf(f.compare, `${path}.compare`, COMPARES),
        px: whole(f.px, `${path}.px`, 0, PX_MAX),
      }
    }
  }
}

/** A word as the app counts one (`words` in `text.ts`). */
const HAS_WORD = /[\p{L}\p{M}\p{N}]/u

/** A listed value looked for as words must hold a word: `**` has none, and is looked for as characters. */
function wordsListed(values: Values, match: Match, path: string): void {
  if (match !== 'words' || values.from !== 'listed') return
  values.items.forEach((item, i) => {
    if (!HAS_WORD.test(item))
      refuse(`${path}.items[${i}]`, 'holds no word; look for it as characters')
  })
}

/** The kinds of output each part can be read in. */
function checkOutputs(tests: readonly ExactTest[], outputs: readonly ReadOutput[]): void {
  tests.forEach((test, i) => {
    const part = test.test === 'measure' ? null : test.read.part
    const pageOnly = test.test === 'measure' || (part !== null && PAGE_PARTS.has(part))
    if (pageOnly && !outputs.includes('page'))
      refuse(`reading.tests[${i}]`, 'reads a page, and the reading reads no page')
    if (part !== null && LINE_PARTS.has(part) && outputs.every((o) => o === 'page'))
      refuse(`reading.tests[${i}]`, 'reads lines, and a page has none')
  })
}

/**
 * A reading as a model filled it, held to its shape. A field missing, a field
 * more, a value outside its set or its bounds, and a test that cannot read
 * any output the reading reads are all refused, with where in it the problem
 * is: nothing is guessed back into shape.
 *
 * Read `for` a check, a reading that calls it in conflict is refused too: a
 * check is its writer's own word on what a good answer to its case holds, so
 * it is always markable by its own words. What cannot hold beside it is the
 * rule, on that case (`CannotHold` in `sorting.ts`).
 */
export function readRuleReading(
  value: unknown,
  options: { for?: 'rule' | 'check' } = {},
): { reading: RuleReading } | { refused: string } {
  try {
    const reading = ruleReading(value)
    if (options.for === 'check' && reading.reading === 'unmarkable' && reading.why === 'conflict')
      refuse(
        'reading.why',
        'is conflict, and a check is never in conflict: keep its own reading, and name the rule in against',
      )
    return { reading }
  } catch (error) {
    if (error instanceof Refused) return { refused: error.message }
    throw error
  }
}

function ruleReading(value: unknown): RuleReading {
  const kind = oneOf(objectAt(value, 'reading').reading, 'reading.reading', [
    'exact',
    'judged',
    'unmarkable',
  ] as const)
  if (kind === 'judged') {
    const f = fields(value, 'reading', ['reading', 'span'])
    return { reading: kind, span: oneOf(f.span, 'reading.span', SPANS) }
  }
  if (kind === 'unmarkable') {
    const f = fields(value, 'reading', ['reading', 'why', 'with', 'fix'])
    const why = oneOf(f.why, 'reading.why', UNMARKABLE)
    const other = textOrNull(f.with, 'reading.with', ID_MAX)
    if ((why === 'conflict') !== (other !== null))
      refuse('reading.with', 'names the other rule for a conflict, and only then')
    return { reading: kind, why, with: other, fix: textOrNull(f.fix, 'reading.fix', FIX_MAX) }
  }
  const f = fields(value, 'reading', ['reading', 'outputs', 'join', 'tests'])
  const outputs = list(f.outputs, 'reading.outputs', 1, READ_OUTPUTS.length, (v, p) =>
    oneOf(v, p, READ_OUTPUTS),
  )
  if (new Set(outputs).size !== outputs.length) refuse('reading.outputs', 'names a kind twice')
  const tests = list(f.tests, 'reading.tests', 1, TESTS_MAX, readTest)
  checkOutputs(tests, outputs)
  return { reading: kind, outputs, join: oneOf(f.join, 'reading.join', JOINS), tests }
}

// The shape as JSON Schema, for a model's structured reply. Every field is
// required and none more is allowed, as strict structured output asks; a
// field with nothing to say is null. The reply that holds these readings is
// the caller's to shape: a union cannot be the root of a strict schema.

const str = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength }) as const
const nullable = (maxLength: number) => ({ type: ['string', 'null'], maxLength }) as const
const choice = (set: readonly string[]) => ({ type: 'string', enum: [...set] }) as const
const int = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum }) as const
const shape = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

const PART_SCHEMA = {
  anyOf: [
    shape({ part: choice(['file', 'lines', 'styles']) }),
    shape({ part: choice(['text']), skip: nullable(LABEL_MAX) }),
    shape({
      part: choice(['line']),
      label: nullable(LABEL_MAX),
      number: { type: ['integer', 'null'], minimum: -50, maximum: 50 },
    }),
    shape({
      part: choice(['elements']),
      tag: str(32),
      attribute: nullable(40),
      which: choice(WHICH),
    }),
    shape({ part: choice(['after']), tag: str(32) }),
    shape({ part: choice(['other file']), path: str(PATH_MAX) }),
  ],
}

const VALUES_SCHEMA = {
  anyOf: [
    shape({
      from: choice(['listed']),
      items: { type: 'array', minItems: 1, maxItems: LISTED_MAX, items: str(VALUE_MAX) },
    }),
    shape({
      from: choice(['request']),
      in: choice(SOURCES),
      file: nullable(PATH_MAX),
      labels: { type: 'array', maxItems: LABELS_MAX, items: str(LABEL_MAX) },
      take: choice(TAKES),
      level: { type: ['integer', 'null'], minimum: 1, maximum: 6 },
    }),
  ],
}

const MATCHING = { match: choice(MATCHES), case: choice(CASES) }

const TEST_SCHEMA = {
  anyOf: [
    shape({
      test: choice(['count']),
      read: PART_SCHEMA,
      what: choice(COUNTED),
      compare: choice(COMPARES),
      n: int(0, COUNT_MAX),
    }),
    shape({
      test: choice(['has']),
      read: PART_SCHEMA,
      values: VALUES_SCHEMA,
      need: choice(NEEDS),
      at: choice(ATS),
      ...MATCHING,
    }),
    shape({
      test: choice(['order']),
      read: PART_SCHEMA,
      values: VALUES_SCHEMA,
      mode: choice(ORDERS),
      ...MATCHING,
    }),
    shape({
      test: choice(['only']),
      read: PART_SCHEMA,
      what: choice(THINGS),
      allowed: VALUES_SCHEMA,
    }),
    shape({
      test: choice(['measure']),
      tag: str(32),
      property: choice(PROPERTIES),
      each: choice(EACH),
      compare: choice(COMPARES),
      px: int(0, PX_MAX),
    }),
  ],
}

/** One reading as JSON Schema: what `readRuleReading` takes, less the checks between fields. */
export const RULE_READING_SCHEMA = {
  anyOf: [
    shape({
      reading: choice(['exact']),
      outputs: {
        type: 'array',
        minItems: 1,
        maxItems: READ_OUTPUTS.length,
        items: choice(READ_OUTPUTS),
      },
      join: choice(JOINS),
      tests: { type: 'array', minItems: 1, maxItems: TESTS_MAX, items: TEST_SCHEMA },
    }),
    shape({ reading: choice(['judged']), span: choice(SPANS) }),
    shape({
      reading: choice(['unmarkable']),
      why: choice(UNMARKABLE),
      with: nullable(ID_MAX),
      fix: nullable(FIX_MAX),
    }),
  ],
} as const
