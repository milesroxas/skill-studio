import { describe, expect, it } from 'vitest'
import {
  ATS,
  COUNTED,
  PARTS,
  RULE_READING_SCHEMA,
  type RuleReading,
  readRuleReading,
  SPANS,
  TAKES,
  TESTS,
} from './rule-reading.ts'

const listed = (...items: string[]) => ({ from: 'listed' as const, items })
const TEXT = { part: 'text' as const, skip: null }

/** A reading of every kind of test and part, as a model would fill it. */
const FULL: RuleReading = {
  reading: 'exact',
  outputs: ['text', 'page'],
  join: 'all',
  tests: [
    { test: 'count', read: TEXT, what: 'words', compare: 'at most', n: 120 },
    {
      test: 'has',
      read: { part: 'line', label: 'Subject', number: null },
      values: {
        from: 'request',
        in: 'file',
        file: 'brief.md',
        labels: ['Headline'],
        take: 'whole',
        level: null,
      },
      need: 'all',
      at: 'start',
      match: 'words',
      case: 'any',
    },
    {
      test: 'order',
      read: { part: 'lines' },
      values: listed('date', 'address'),
      mode: 'in order',
      match: 'characters',
      case: 'exact',
    },
    {
      test: 'only',
      read: { part: 'styles' },
      what: 'hex colours',
      allowed: {
        from: 'request',
        in: 'request and files',
        file: null,
        labels: [],
        take: 'hex colours',
        level: null,
      },
    },
    { test: 'measure', tag: 'p', property: 'font size', each: 'every', compare: 'exactly', px: 18 },
    {
      test: 'count',
      read: { part: 'elements', tag: 'h1', attribute: null, which: 'every' },
      what: 'items',
      compare: 'exactly',
      n: 1,
    },
  ],
}

const OTHERS: RuleReading[] = [
  { reading: 'judged', span: 'every' },
  { reading: 'unmarkable', why: 'vague', with: null, fix: 'Say what friendly means.' },
  { reading: 'unmarkable', why: 'conflict', with: 'r2', fix: null },
  {
    reading: 'exact',
    outputs: ['code'],
    join: 'any',
    tests: [
      {
        test: 'has',
        read: { part: 'other file', path: 'outputs/*.test.mjs' },
        values: listed('node:test'),
        need: 'all',
        at: 'anywhere',
        match: 'characters',
        case: 'any',
      },
      {
        test: 'has',
        read: { part: 'file' },
        values: listed('- '),
        need: 'none',
        at: 'start',
        match: 'characters',
        case: 'any',
      },
    ],
  },
  {
    reading: 'exact',
    outputs: ['page'],
    join: 'same',
    tests: [
      {
        test: 'count',
        read: { part: 'after', tag: 'footer' },
        what: 'characters',
        compare: 'exactly',
        n: 0,
      },
      {
        test: 'has',
        read: { part: 'elements', tag: 'html', attribute: 'lang', which: 'first' },
        values: {
          from: 'request',
          in: 'file',
          file: 'changes.md',
          labels: [],
          take: 'headings',
          level: 2,
        },
        need: 'any',
        at: 'whole',
        match: 'words',
        case: 'any',
      },
    ],
  },
]

/** `value` with `change` made at `path`, a list of keys and indexes: a deep copy. */
function changed(value: unknown, path: Array<string | number>, change: (old: unknown) => unknown) {
  const copy = structuredClone(value) as Record<string | number, unknown>
  let at = copy
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  const next = change(at[last])
  if (next === undefined) delete at[last]
  else at[last] = next
  return copy
}

const refused = (value: unknown): string => {
  const result = readRuleReading(value)
  if ('reading' in result) throw new Error(`taken: ${JSON.stringify(value)}`)
  return result.refused
}

describe('a reading held to its shape', () => {
  it('takes every kind of reading, test and part as filled', () => {
    for (const reading of [FULL, ...OTHERS]) expect(readRuleReading(reading)).toEqual({ reading })
  })

  it('refuses a check in conflict, and takes every other reading of one', () => {
    const conflict = { reading: 'unmarkable', why: 'conflict', with: 'r2', fix: null }
    expect(readRuleReading(conflict)).toEqual({ reading: conflict })
    expect(readRuleReading(conflict, { for: 'check' })).toEqual({
      refused: expect.stringMatching(/^reading.why: .*a check is never in conflict/),
    })
    const others = [FULL, ...OTHERS].filter(
      (r) => !(r.reading === 'unmarkable' && r.why === 'conflict'),
    )
    for (const reading of others)
      expect(readRuleReading(reading, { for: 'check' })).toEqual({ reading })
  })

  it('refuses what is not a reading at all', () => {
    for (const value of [null, 'exact', 3, [], {}, { reading: 'maybe' }])
      expect(refused(value)).toMatch(/^reading/)
  })

  it('refuses a field missing and a field more', () => {
    expect(refused({ reading: 'judged' })).toBe('reading.span: is missing')
    expect(refused({ reading: 'judged', span: 'any', why: 'x' })).toBe(
      'reading.why: is not a field of this shape',
    )
    expect(refused(changed(FULL, ['tests', 0, 'read', 'skip'], () => undefined))).toBe(
      'reading.tests[0].read.skip: is missing',
    )
    expect(refused(changed(FULL, ['tests', 0, 'pattern'], () => '.*'))).toBe(
      'reading.tests[0].pattern: is not a field of this shape',
    )
  })

  it('refuses a value out of its set', () => {
    expect(refused({ reading: 'judged', span: 'most' })).toMatch(/^reading.span: is not one of/)
    expect(refused(changed(FULL, ['tests', 0, 'test'], () => 'regex'))).toMatch(
      /^reading.tests\[0\].test: is not one of count, has, order, only, measure/,
    )
    expect(refused(changed(FULL, ['tests', 0, 'read', 'part'], () => 'selector'))).toMatch(
      /^reading.tests\[0\].read.part/,
    )
    expect(refused(changed(FULL, ['tests', 0, 'what'], () => 'sentences'))).toMatch(
      /^reading.tests\[0\].what/,
    )
    expect(refused(changed(FULL, ['tests', 1, 'values', 'take'], () => 'regex'))).toMatch(
      /^reading.tests\[1\].values.take/,
    )
    expect(refused(changed(FULL, ['outputs'], () => ['pdf']))).toMatch(/^reading.outputs\[0\]/)
  })

  it('refuses numbers out of bounds and strings past their length', () => {
    expect(refused(changed(FULL, ['tests', 0, 'n'], () => -1))).toMatch(/^reading.tests\[0\].n/)
    expect(refused(changed(FULL, ['tests', 0, 'n'], () => 1.5))).toBe(
      'reading.tests[0].n: is not a whole number',
    )
    expect(refused(changed(FULL, ['tests', 0, 'n'], () => '120'))).toBe(
      'reading.tests[0].n: is not a whole number',
    )
    expect(refused(changed(FULL, ['tests', 4, 'px'], () => 1e9))).toMatch(/^reading.tests\[4\].px/)
    expect(refused(changed(FULL, ['tests', 2, 'values', 'items', 0], () => 'x'.repeat(301)))).toBe(
      'reading.tests[2].values.items[0]: is longer than 300 characters',
    )
    expect(
      refused(changed(FULL, ['tests', 2, 'values', 'items'], () => Array(51).fill('x'))),
    ).toMatch(/does not hold 1 to 50 items/)
    expect(refused(changed(FULL, ['tests', 2, 'values', 'items'], () => []))).toMatch(
      /does not hold 1 to 50 items/,
    )
    expect(refused(changed(FULL, ['tests'], () => Array(7).fill(FULL.tests[0])))).toMatch(
      /^reading.tests: does not hold 1 to 6 items/,
    )
    expect(refused(changed(FULL, ['tests', 2, 'values', 'items', 0], () => '   '))).toBe(
      'reading.tests[2].values.items[0]: is blank',
    )
  })

  it('refuses a tag, an attribute or a path that is not plainly one', () => {
    const tag = (value: string) => changed(FULL, ['tests', 5, 'read', 'tag'], () => value)
    expect(refused(tag('h1 > p'))).toBe('reading.tests[5].read.tag: is not a tag name')
    expect(refused(tag('div.card'))).toBe('reading.tests[5].read.tag: is not a tag name')
    expect(readRuleReading(tag('H1'))).toMatchObject({
      reading: { tests: { 5: { read: { tag: 'h1' } } } },
    })
    const path = (value: string) => changed(OTHERS[3], ['tests', 0, 'read', 'path'], () => value)
    expect(refused(path('../secret.txt'))).toBe(
      'reading.tests[0].read.path: is not a path inside the folder',
    )
    expect(refused(path('/etc/passwd'))).toBe(
      'reading.tests[0].read.path: is not a path inside the folder',
    )
    expect(refused(path('outputs\\a.md'))).toBe(
      'reading.tests[0].read.path: is not a path inside the folder',
    )
    expect(refused(path('*/*/*/*.md'))).toBe('reading.tests[0].read.path: has more than three *')
    expect(refused(changed(FULL, ['tests', 1, 'values', 'file'], () => 'brief\u0000.md'))).toMatch(
      /is not a path inside the folder/,
    )
  })

  it('refuses fields that do not go together', () => {
    // A line by its label or its number, never both or neither.
    expect(refused(changed(FULL, ['tests', 1, 'read', 'number'], () => 2))).toBe(
      'reading.tests[1].read: names neither or both of label and number',
    )
    expect(refused(changed(FULL, ['tests', 1, 'read', 'label'], () => null))).toBe(
      'reading.tests[1].read: names neither or both of label and number',
    )
    expect(
      refused(
        changed(
          changed(FULL, ['tests', 1, 'read', 'label'], () => null),
          ['tests', 1, 'read', 'number'],
          () => 0,
        ),
      ),
    ).toMatch(/is 0/)
    // A file only for values from one file; a level only for headings.
    expect(refused(changed(FULL, ['tests', 1, 'values', 'file'], () => null))).toMatch(
      /names a file only when/,
    )
    expect(refused(changed(FULL, ['tests', 1, 'values', 'level'], () => 2))).toBe(
      'reading.tests[1].values.level: is for headings only',
    )
    // A conflict names the other rule; a vague rule names none.
    expect(refused({ reading: 'unmarkable', why: 'conflict', with: null, fix: null })).toMatch(
      /^reading.with/,
    )
    expect(refused({ reading: 'unmarkable', why: 'vague', with: 'r1', fix: null })).toMatch(
      /^reading.with/,
    )
    // An order needs two values; a listed value looked for as words needs a word.
    expect(refused(changed(FULL, ['tests', 2, 'values', 'items'], () => ['date']))).toMatch(
      /fewer than two values/,
    )
    const marks = changed(FULL, ['tests', 2, 'values', 'items'], () => ['**', 'date'])
    expect(refused(changed(marks, ['tests', 2, 'match'], () => 'words'))).toBe(
      'reading.tests[2].values.items[0]: holds no word; look for it as characters',
    )
    expect(refused(changed(FULL, ['outputs'], () => ['text', 'text']))).toBe(
      'reading.outputs: names a kind twice',
    )
  })

  it('refuses a test that cannot read any output the reading reads', () => {
    expect(refused(changed(FULL, ['outputs'], () => ['text']))).toBe(
      'reading.tests[3]: reads a page, and the reading reads no page',
    )
    expect(refused(changed(FULL, ['outputs'], () => ['page']))).toBe(
      'reading.tests[1]: reads lines, and a page has none',
    )
  })

  it('keeps the spaces of a listed value, which a list mark needs', () => {
    const result = readRuleReading(OTHERS[3])
    expect(result).toMatchObject({ reading: { tests: { 1: { values: { items: ['- '] } } } } })
  })
})

// A small reader of the JSON Schema subset `RULE_READING_SCHEMA` uses, so the
// schema a model is given and the reader that holds its reply are held to each other.
type Schema = Record<string, unknown>

function fits(schema: Schema, value: unknown): boolean {
  if (schema.anyOf) return (schema.anyOf as Schema[]).some((s) => fits(s, value))
  const types = ([] as unknown[]).concat(schema.type ?? [])
  const typeOf = (v: unknown) =>
    v === null
      ? 'null'
      : Array.isArray(v)
        ? 'array'
        : Number.isInteger(v)
          ? 'integer'
          : typeof v === 'object'
            ? 'object'
            : typeof v
  if (types.length && !types.includes(typeOf(value))) return false
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) return false
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < (schema.minLength as number)) return false
    if (schema.maxLength !== undefined && value.length > (schema.maxLength as number)) return false
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < (schema.minimum as number)) return false
    if (schema.maximum !== undefined && value > (schema.maximum as number)) return false
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < (schema.minItems as number)) return false
    if (schema.maxItems !== undefined && value.length > (schema.maxItems as number)) return false
    return value.every((item) => fits(schema.items as Schema, item))
  }
  if (typeOf(value) === 'object') {
    const record = value as Record<string, unknown>
    const properties = schema.properties as Record<string, Schema>
    if (Object.keys(record).some((key) => !(key in properties))) return false
    if ((schema.required as string[]).some((key) => !(key in record))) return false
    return Object.entries(record).every(([key, v]) => fits(properties[key], v))
  }
  return true
}

/** Every object shape in the schema. */
function objects(schema: unknown): Schema[] {
  if (!schema || typeof schema !== 'object') return []
  const s = schema as Schema
  const own = s.type === 'object' ? [s] : []
  return [
    ...own,
    ...Object.values(s).flatMap((v) => (Array.isArray(v) ? v.flatMap(objects) : objects(v))),
  ]
}

/** Every value an enum in the schema names. */
const enums = (schema: unknown): unknown[] => {
  if (!schema || typeof schema !== 'object') return []
  const s = schema as Schema
  return [
    ...((s.enum as unknown[]) ?? []),
    ...Object.values(s).flatMap((v) => (Array.isArray(v) ? v.flatMap(enums) : enums(v))),
  ]
}

describe('the schema a model is given', () => {
  it('takes every reading the reader takes', () => {
    for (const reading of [FULL, ...OTHERS]) expect(fits(RULE_READING_SCHEMA, reading)).toBe(true)
  })

  it('refuses what the reader refuses by shape alone', () => {
    const bad = [
      { reading: 'judged' },
      { reading: 'judged', span: 'most' },
      changed(FULL, ['tests', 0, 'pattern'], () => '.*'),
      changed(FULL, ['tests', 0, 'n'], () => 1.5),
      changed(FULL, ['tests', 0, 'read', 'part'], () => 'selector'),
      changed(FULL, ['tests', 2, 'values', 'items'], () => []),
      changed(FULL, ['tests'], () => Array(7).fill(FULL.tests[0])),
    ]
    for (const value of bad) expect(fits(RULE_READING_SCHEMA, value)).toBe(false)
  })

  it('is strict: every field required, no field more, no pattern of its own', () => {
    const shapes = objects(RULE_READING_SCHEMA)
    expect(shapes.length).toBeGreaterThan(10)
    for (const shape of shapes) {
      expect(shape.additionalProperties).toBe(false)
      expect(shape.required).toEqual(Object.keys(shape.properties as object))
    }
    expect(JSON.stringify(RULE_READING_SCHEMA)).not.toMatch(/"pattern"|"\$ref"/)
  })

  it('names the same sets as the reader', () => {
    const named = new Set(enums(RULE_READING_SCHEMA))
    for (const set of [PARTS, TESTS, TAKES, COUNTED, ATS, SPANS])
      for (const member of set) expect(named.has(member)).toBe(true)
  })
})
