/**
 * Whether one output can meet two exact readings (`bothHold` in
 * `src/domain/both-hold.ts`), over the readings and the requests of the
 * `launch-note` test skill: its rules as the stored sort read them, and
 * readings of the same rules and of checks such a sort could give. Here,
 * beside the other tests over the fixture, since the domain's tests read no
 * file.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { type Asked, bothHold } from '@domain/both-hold.ts'
import type { ExactTest, Part, RuleReading, Values } from '@domain/rule-reading.ts'
import { describe, expect, it } from 'vitest'

type Exact = Extract<RuleReading, { reading: 'exact' }>

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/launch-note')
const CASES = join(FIXTURE, 'evals', 'cases')

/** Each case of launch-note as code draws values from it: its request, its files, and a page where it grades one. */
const ASKED: Asked[] = readdirSync(CASES)
  .sort()
  .map((id) => {
    const dir = join(CASES, id)
    const files = join(dir, 'files')
    const page = /artifact:\s*html/.test(readFileSync(join(dir, 'case.yaml'), 'utf8'))
    return {
      case: id,
      request: readFileSync(join(dir, 'prompt.md'), 'utf8'),
      files: Object.fromEntries(
        readdirSync(files).map((name) => [name, readFileSync(join(files, name), 'utf8')]),
      ),
      kinds: page ? ['page'] : null,
    }
  })
const caseOf = (id: string): Asked => {
  const found = ASKED.find((c) => c.case === id)
  if (!found) throw new Error(`no case ${id}`)
  return found
}

/** A rule's reading as the stored sort of launch-note read it, by the words it starts with. */
function stored(start: string): Exact {
  const file = JSON.parse(readFileSync(join(FIXTURE, 'evals', 'rule-readings.json'), 'utf8')) as {
    readings: Array<{ kind: string; text: string; reading: RuleReading }>
  }
  const found = file.readings.find(
    (e) => e.kind === 'rule' && e.text.startsWith(start) && e.reading.reading === 'exact',
  )
  if (found?.reading.reading !== 'exact') throw new Error(`no exact reading of ${start}`)
  return found.reading
}

const exact = (
  tests: ExactTest[],
  join: Exact['join'] = 'all',
  outputs: Exact['outputs'] = ['text', 'page'],
): Exact => ({ reading: 'exact', outputs, join, tests })

const TEXT: Part = { part: 'text', skip: null }
const SUBJECT: Part = { part: 'line', label: 'Subject', number: null }
const BODY: Part = { part: 'text', skip: 'Subject' }
const listed = (...items: string[]): Values => ({ from: 'listed', items })
const brief = (...labels: string[]): Values => ({
  from: 'request',
  in: 'request and files',
  file: null,
  labels,
  take: 'whole',
  level: null,
})
const starts = (
  read: Part,
  values: Values,
  match: 'words' | 'characters' = 'words',
): ExactTest => ({ test: 'has', read, values, need: 'all', at: 'start', match, case: 'exact' })
const count = (
  compare: 'at most' | 'at least' | 'exactly',
  n: number,
  what: Extract<ExactTest, { test: 'count' }>['what'] = 'words',
  read: Part = TEXT,
): ExactTest => ({ test: 'count', read, what, compare, n })

/** Read as the stored sort read "Open with the brief's Headline": the subject line or the line below it, joined `same`. */
const OPEN_HEADLINE = stored('Open with the brief')
/** "Start with the product's name and version number", read the same way: version one's rule beside it. */
const OPEN_PRODUCT = exact(
  [starts(SUBJECT, brief('Product', 'Version')), starts(BODY, brief('Product', 'Version'))],
  'same',
)
const WORD_LIMIT = stored('Write no more than 120 words')
const SUBJECT_LINE = stored('Put the subject on the first line')

describe('bothHold, two rules', () => {
  it('finds two rules that open with different values in conflict, on every case', () => {
    expect(OPEN_HEADLINE.join).toBe('same')
    const held = bothHold(OPEN_HEADLINE, OPEN_PRODUCT, ASKED)
    expect(held).toMatchObject({ holds: false, case: 'email-crowded' })
    expect(held?.values).toEqual({ a: ['Six ways to fill a quiet week.'], b: ['Ferry 3.5'] })
  })

  it('finds two that start the same text with values that differ in conflict, with no case to draw from', () => {
    const held = bothHold(
      exact([starts(TEXT, listed('Hello'))]),
      exact([starts(TEXT, listed('Dear reader'))]),
      [],
    )
    expect(held).toMatchObject({ holds: false, case: null })
  })

  it('finds a value that starts the other one beside it, so both hold', () => {
    const held = bothHold(
      exact([starts(TEXT, listed('Ferry'))]),
      exact([starts(TEXT, listed('Ferry 3.2 is here'))]),
      ASKED,
    )
    expect(held).toMatchObject({ holds: true, values: { a: ['Ferry'], b: ['Ferry 3.2 is here'] } })
  })

  it('gives no answer for two starts in different places: the subject line and the first line', () => {
    expect(bothHold(OPEN_HEADLINE, SUBJECT_LINE, ASKED)).toBeNull()
    expect(
      bothHold(
        exact([starts(SUBJECT, listed('Hello'))]),
        exact([starts(TEXT, listed('Hi'))]),
        ASKED,
      ),
    ).toBeNull()
  })

  it('gives no answer for two starts looked for in different ways', () => {
    expect(
      bothHold(
        exact([starts(TEXT, listed('Hello'))]),
        exact([starts(TEXT, listed('Hi'), 'characters')]),
        ASKED,
      ),
    ).toBeNull()
  })

  it('gives no answer for counts of different units', () => {
    expect(bothHold(WORD_LIMIT, exact([count('at least', 2000, 'characters')]), ASKED)).toBeNull()
    expect(bothHold(WORD_LIMIT, SUBJECT_LINE, ASKED)).toBeNull()
  })

  it('finds a bound beside a fixed value within it holds, and one past it does not', () => {
    expect(bothHold(WORD_LIMIT, exact([count('exactly', 100)]), ASKED)?.holds).toBe(true)
    expect(bothHold(WORD_LIMIT, exact([count('exactly', 121)]), ASKED)?.holds).toBe(false)
  })

  it('finds ranges that overlap hold together', () => {
    const held = bothHold(WORD_LIMIT, exact([count('at least', 100)]), ASKED)
    expect(held).toMatchObject({ holds: true, values: null, case: null })
  })

  it('gives no answer where the cases differ: one brief’s headline opens with the value, the others do not', () => {
    const bookings = exact(
      [starts(SUBJECT, listed('Bookings')), starts(BODY, listed('Bookings'))],
      'same',
    )
    expect(bothHold(OPEN_HEADLINE, bookings, [caseOf('email-free')])?.holds).toBe(false)
    // "Bookings now confirm themselves." can open both ways, and code says "both hold" only of two tests alike.
    expect(bothHold(OPEN_HEADLINE, bookings, [caseOf('email-price')])).toBeNull()
    expect(bothHold(OPEN_HEADLINE, bookings, ASKED)).toBeNull()
    const plain = exact([starts(TEXT, brief('Headline'))])
    expect(
      bothHold(plain, exact([starts(TEXT, listed('Bookings'))]), [caseOf('email-price')]),
    ).toMatchObject({
      holds: true,
      case: 'email-price',
      values: { a: ['Bookings now confirm themselves.'] },
    })
  })

  it('gives no answer for tests code does not compare', () => {
    expect(bothHold(stored('Use only numbers'), stored('Never use the words'), ASKED)).toBeNull()
  })

  it('finds "Open with the brief’s Headline" beside "Open with Hi" in conflict only where every brief has a headline', () => {
    const headline = exact([starts(TEXT, brief('Headline'))])
    const hi = exact([starts(TEXT, listed('Hi'))])
    expect(bothHold(headline, hi, ASKED)?.holds).toBe(false)
    // Where a brief gives no headline, code gives no answer on the first, and Jev's would stand.
    const free = caseOf('email-free')
    const none: Asked = {
      ...free,
      case: 'email-plain',
      files: { 'brief.md': free.files['brief.md'].replace(/^Headline: .*\r?\n/m, '') },
    }
    expect(bothHold(headline, hi, [...ASKED, none])).toBeNull()
  })

  it('gives no answer where one reads a kind of output the other does not, nor where code may give none', () => {
    const page = exact([starts(TEXT, listed('Hello'))], 'all', ['text', 'page'])
    const email = exact([starts(TEXT, listed('Hi'))], 'all', ['text'])
    expect(bothHold(page, email, ASKED)).toBeNull()
    // The subject line may not be there, and then code gives no answer on the first.
    expect(
      bothHold(
        exact([starts(SUBJECT, listed('Hello'))]),
        exact([starts(SUBJECT, listed('Hi'))]),
        ASKED,
      ),
    ).toBeNull()
  })

  it('gives no answer where no case has an output both read', () => {
    const email = exact([starts(TEXT, listed('Hello'))], 'all', ['text'])
    const page = exact([starts(TEXT, listed('Hi'))], 'all', ['page'])
    expect(bothHold(email, page, ASKED)).toBeNull()
    const pageToo = exact([starts(TEXT, listed('Hi'))])
    // A text-only reading beside one of a page case is answered on no output of it.
    expect(bothHold(email, pageToo, [caseOf('page-basic')])).toBeNull()
  })
})

describe('bothHold, a check beside a rule', () => {
  const longPage = [caseOf('page-long')]

  it('finds a check whose count is past the rule’s bound cannot hold beside it', () => {
    const held = bothHold(exact([count('at least', 150)]), WORD_LIMIT, longPage)
    expect(held).toMatchObject({ holds: false, case: null })
    expect(held?.a).toMatchObject({ compare: 'at least', n: 150 })
    expect(held?.b).toMatchObject({ compare: 'at most', n: 120 })
  })

  it('finds a check whose count can be met within the bound holds beside it', () => {
    expect(bothHold(exact([count('at least', 80)]), WORD_LIMIT, longPage)?.holds).toBe(true)
  })

  it('holds a count that sits on the bound: the bound is met at it, and missed one past it', () => {
    expect(bothHold(exact([count('at least', 120)]), WORD_LIMIT, longPage)?.holds).toBe(true)
    expect(bothHold(exact([count('exactly', 120)]), WORD_LIMIT, longPage)?.holds).toBe(true)
    expect(bothHold(exact([count('at least', 121)]), WORD_LIMIT, longPage)?.holds).toBe(false)
    // "Under 120 words" leaves 120 out: it is read as at most 119.
    const under = exact([count('at most', 119)])
    expect(bothHold(exact([count('at least', 120)]), under, longPage)?.holds).toBe(false)
    expect(bothHold(exact([count('exactly', 119)]), under, longPage)?.holds).toBe(true)
  })

  it('counts items in a list beside a bound on the items, and gives no answer beside a bound on words', () => {
    const items: Part = { part: 'elements', tag: 'li', attribute: null, which: 'every' }
    const all = exact([count('at least', 180, 'items', items)], 'all', ['page'])
    const few = exact([count('at most', 20, 'items', items)], 'all', ['page'])
    expect(bothHold(all, few, longPage)?.holds).toBe(false)
    expect(bothHold(all, WORD_LIMIT, longPage)).toBeNull()
  })
})
