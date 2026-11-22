import { describe, expect, it } from 'vitest'
import { answerExact, type ExactAnswer, type ExactSubject } from './exact.ts'
import type { PageLayout } from './layout.ts'
import type { ExactTest, Part, ReadOutput, RuleReading, Take, Values } from './rule-reading.ts'
import type { ArtifactKind } from './schemas.ts'
import { pageText, unitsOf, words } from './text.ts'

type Exact = Extract<RuleReading, { reading: 'exact' }>

const subject = (
  output: string,
  kind: ArtifactKind = 'markdown',
  more: Partial<ExactSubject> = {},
): ExactSubject => ({ output, kind, others: {}, request: '', files: {}, layout: null, ...more })

const exact = (
  tests: ExactTest[],
  join: Exact['join'] = 'all',
  outputs: ReadOutput[] = ['text', 'page', 'code'],
): Exact => ({ reading: 'exact', outputs, join, tests })

const answer = (result: ExactAnswer): string =>
  result.answer === 'none' ? `none: ${result.why}` : result.answer

const on = (test: ExactTest, s: ExactSubject, join?: Exact['join']) =>
  answer(answerExact(exact([test], join), s))

const listed = (...items: string[]): Values => ({ from: 'listed', items })
const request = (
  take: Take,
  labels: string[] = [],
  file: string | null = 'brief.md',
  level: number | null = null,
): Values => ({
  from: 'request',
  in: file === null ? 'request' : 'file',
  file,
  labels,
  take,
  level,
})
const TEXT: Part = { part: 'text', skip: null }
const FILE: Part = { part: 'file' }
const has = (
  read: Part,
  values: Values,
  need: 'all' | 'any' | 'none' = 'all',
  at: 'anywhere' | 'start' | 'end' | 'whole' = 'anywhere',
  match: 'words' | 'characters' = 'words',
  letterCase: 'any' | 'exact' = 'any',
): ExactTest => ({ test: 'has', read, values, need, at, match, case: letterCase })
const count = (
  read: Part,
  what: Extract<ExactTest, { test: 'count' }>['what'],
  compare: 'at most' | 'at least' | 'exactly',
  n: number,
): ExactTest => ({ test: 'count', read, what, compare, n })
const elements = (
  tag: string,
  attribute: string | null = null,
  which: 'every' | 'first' | 'last' = 'every',
): Part => ({ part: 'elements', tag, attribute, which })

const BRIEF = `Product: Ferry
Version: 3.2
Headline: Bookings now confirm themselves.
Price: 12 USD a month
Link: https://ferry.example/3-2
Colours: #0B3D5C, #F4F1EA, #E2572B
Features:
- Automatic confirmations: Ferry sends it.
- Waitlist: the next person is offered it.

Quote: "Ferry cut our calls in half." Dana Okafor, Tidewater Kayaks
`
const withBrief = (output: string, kind: ArtifactKind = 'markdown', more = {}) =>
  subject(output, kind, { files: { 'brief.md': BRIEF }, ...more })

describe('what is read at all', () => {
  it('reads no output of a kind the reading does not read', () => {
    const reading = exact([has(TEXT, listed('x'))], 'all', ['page'])
    expect(answer(answerExact(reading, subject('x')))).toBe('none: kind')
    expect(answer(answerExact(exact([has(TEXT, listed('x'))]), subject('x', 'image')))).toBe(
      'none: kind',
    )
    expect(answer(answerExact(exact([has(TEXT, listed('x'))]), subject('x', 'other')))).toBe(
      'none: kind',
    )
  })

  it('gives no answer on an empty output, whatever the test', () => {
    expect(on(has(TEXT, listed('proud'), 'none'), subject('  \n\n '))).toBe('none: empty')
    expect(on(count(TEXT, 'words', 'at most', 120), subject(''))).toBe('none: empty')
  })

  it('reads a page’s parts only on a page, and lines only off one', () => {
    expect(on(count(elements('h1'), 'items', 'exactly', 1), subject('# Title'))).toBe('none: kind')
    expect(on(count({ part: 'lines' }, 'items', 'at least', 1), subject('<p>a</p>', 'html'))).toBe(
      'none: kind',
    )
  })
})

describe('count', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

  it('counts words as the app shows them', () => {
    const note = `---\ntitle: A note\n---\n# A heading of five words\n\n${many(100)}\n\n\`\`\`\ncode code\n\`\`\`\n`
    const result = answerExact(exact([count(TEXT, 'words', 'at most', 120)]), subject(note))
    expect(result.answer).toBe('met')
    const seen = result.saw[0]
    if (seen.test !== 'count') throw new Error('not a count')
    // The app's count: paragraphs and lists only, as `countedText` reads a Markdown file.
    expect(seen.counts[0]).toBe(
      words(
        unitsOf(note.replace(/^---[\s\S]*?---\n/, ''))
          .map((u) => u.text)
          .join(' '),
      ).length,
    )
    expect(seen.counts[0]).toBe(100)
  })

  it('gives no answer where two ways of counting fall either side of the bound', () => {
    // help@ferry.example is one word to a reader who counts by spaces and three to the app.
    const near = `${many(119)} help@ferry.example`
    const result = answerExact(exact([count(TEXT, 'words', 'at most', 120)]), subject(near))
    expect(answer(result)).toBe('none: convention')
    expect(result.saw[0]).toMatchObject({ counts: [122, 120, 122, 120] })
    expect(on(count(TEXT, 'words', 'at most', 120), subject(`${many(130)}`))).toBe('missed')
  })

  it('counts a heading in when one way of counting does, and answers only where all agree', () => {
    const note = `# One two three four five\n\n${many(118)}`
    expect(on(count(TEXT, 'words', 'at most', 120), subject(note))).toBe('none: convention')
  })

  it('counts a page’s words in its visible text, with entities and scripts left out', () => {
    const page =
      '<html><head><title>Not this</title></head><body><script>var a = 1</script><p>Slate &amp; Pine&nbsp;Studio</p></body></html>'
    const result = answerExact(exact([count(TEXT, 'words', 'exactly', 3)]), subject(page, 'html'))
    expect(words(pageText(page))).toHaveLength(3)
    // The & is a word to one who counts what stands between spaces: so three is no sure count.
    expect(answer(result)).toBe('none: convention')
    expect(result.saw[0]).toMatchObject({ counts: [3, 3, 3, 4] })
    expect(on(count(TEXT, 'words', 'at most', 10), subject(page, 'html'))).toBe('met')
  })

  it('counts characters as graphemes, and leaves open what code points count otherwise', () => {
    const subjectLine = `Subject: ${'a'.repeat(48)}👍🏽`
    const line: Part = { part: 'line', label: 'Subject', number: null }
    // 49 graphemes, 50 code points, 52 UTF-16 units.
    expect(on(count(line, 'characters', 'at most', 49), subject(subjectLine))).toBe(
      'none: convention',
    )
    expect(on(count(line, 'characters', 'at most', 52), subject(subjectLine))).toBe('met')
    // A composed and a decomposed é are one character either way.
    expect(on(count(TEXT, 'characters', 'exactly', 4), subject('café'))).toBe('met')
  })

  it('counts the pieces of a part, none as zero', () => {
    const page = '<h1>One</h1><p>a<p>b<p>c<h1>Two</h1>'
    expect(on(count(elements('h1'), 'items', 'exactly', 2), subject(page, 'html'))).toBe('met')
    expect(on(count(elements('p'), 'items', 'exactly', 3), subject(page, 'html'))).toBe('met')
    expect(on(count(elements('footer'), 'items', 'exactly', 0), subject(page, 'html'))).toBe('met')
  })

  it('counts links, numbers, addresses, colours and amounts, each by its own pattern', () => {
    const text =
      'See https://ferry.example/3-2. and https://ferry.example/help, write help@ferry.example: 1,200 seats for 12 USD at #fff.'
    const of = (what: Extract<ExactTest, { test: 'count' }>['what'], n: number) =>
      on(count(TEXT, what, 'exactly', n), subject(text))
    expect(of('links', 2)).toBe('met')
    expect(of('addresses', 1)).toBe('met')
    // The numbers in the links, the address and the colour are theirs: 1200 and 12 are left.
    expect(of('numbers', 2)).toBe('met')
    expect(of('amounts', 1)).toBe('met')
    expect(of('hex colours', 1)).toBe('met')
  })

  it('has no answer for a part that is not there, unless it counts the part itself', () => {
    const line: Part = { part: 'line', label: 'Subject', number: null }
    expect(on(count(line, 'characters', 'at most', 50), subject('No subject here'))).toBe(
      'none: not there',
    )
  })
})

describe('has', () => {
  it('finds words whatever the punctuation, markup and case between them', () => {
    const note = 'We ship **Calendar   sync**, and “waitlist” too.'
    expect(on(has(TEXT, listed('calendar sync', 'Waitlist')), subject(note))).toBe('met')
    // As characters, runs of space are one space, and a comma is a comma.
    const chars = (value: string) =>
      on(has(TEXT, listed(value), 'all', 'anywhere', 'characters'), subject(note))
    expect(chars('Calendar sync')).toBe('met')
    expect(chars('Calendar sync.')).toBe('missed')
    expect(on(has(TEXT, listed('calendar sync.'), 'all'), subject('Calendar, sync'))).toBe('met')
  })

  it('never finds a word inside a longer one', () => {
    expect(on(has(TEXT, listed('user'), 'none'), subject('Pick a username.'))).toBe('met')
    expect(on(has(TEXT, listed('user'), 'none'), subject('Each user picks.'))).toBe('missed')
    expect(
      on(has(FILE, listed('<style'), 'all', 'anywhere', 'characters'), subject('<styles>', 'html')),
    ).toBe('missed')
    expect(
      on(
        has(FILE, listed('<style'), 'all', 'anywhere', 'characters'),
        subject('<style>p{}</style>', 'html'),
      ),
    ).toBe('met')
  })

  it('holds case when asked to', () => {
    expect(
      on(has(TEXT, listed('Ferry'), 'all', 'anywhere', 'words', 'exact'), subject('ferry')),
    ).toBe('missed')
    expect(
      on(has(TEXT, listed('Ferry'), 'all', 'anywhere', 'words', 'any'), subject('FERRY')),
    ).toBe('met')
  })

  it('reads text in other alphabets and accents as words', () => {
    const note = 'Das Café öffnet. 東京 の 予約'
    expect(on(has(TEXT, listed('café öffnet', '東京'), 'all'), subject(note))).toBe('met')
    expect(on(has(TEXT, listed('cafe'), 'any'), subject(note))).toBe('missed')
    // A decomposed é is found as the composed one.
    expect(on(has(TEXT, listed('café'), 'all'), subject('Café open'))).toBe('met')
  })

  it('looks at the start, the end, or the whole of a piece', () => {
    const s = subject('Bookings now confirm themselves. More words.')
    expect(on(has(TEXT, listed('Bookings now'), 'all', 'start'), s)).toBe('met')
    expect(on(has(TEXT, listed('now confirm'), 'all', 'start'), s)).toBe('missed')
    expect(on(has(TEXT, listed('more words'), 'all', 'end'), s)).toBe('met')
    expect(
      on(
        has(
          elements('h1'),
          listed('Bookings now confirm themselves.'),
          'all',
          'whole',
          'characters',
        ),
        subject('<h1>Bookings now confirm themselves</h1>', 'html'),
      ),
    ).toBe('missed')
    expect(
      on(
        has(elements('h1'), listed('Bookings now confirm themselves.'), 'all', 'whole'),
        subject('<h1>Bookings now <em>confirm</em> themselves</h1>', 'html'),
      ),
    ).toBe('met')
  })

  it('answers all, any and none', () => {
    const s = subject('exciting news')
    expect(on(has(TEXT, listed('exciting', 'proud'), 'all'), s)).toBe('missed')
    expect(on(has(TEXT, listed('exciting', 'proud'), 'any'), s)).toBe('met')
    const none = answerExact(exact([has(TEXT, listed('exciting', 'proud'), 'none')]), s)
    expect(answer(none)).toBe('missed')
    expect(none.saw[0]).toMatchObject({
      found: [{ value: 'exciting', piece: 0, at: 0, text: 'exciting' }],
    })
  })

  it('finds nothing in a part with no pieces: all and any are missed, none is met', () => {
    const page = subject('<p>No heading</p>', 'html')
    expect(on(has(elements('h1'), listed('Title')), page)).toBe('missed')
    expect(on(has(elements('link', 'rel'), listed('stylesheet'), 'none'), page)).toBe('met')
  })

  it('reads a page’s entities and leaves its head and scripts out', () => {
    const page =
      '<head><title>exciting</title><style>.proud{}</style></head><body><p>Slate &amp; Pine Studio</p><script>"thrilled"</script></body>'
    const s = subject(page, 'html')
    expect(on(has(TEXT, listed('Slate & Pine Studio')), s)).toBe('met')
    expect(on(has(TEXT, listed('exciting', 'proud', 'thrilled'), 'none'), s)).toBe('met')
    expect(on(has(FILE, listed('thrilled'), 'any'), s)).toBe('met')
  })

  it('reads a Markdown file without its front matter, and the file whole with it', () => {
    const note = '---\ndescription: An exciting note\n---\nPlain words.'
    expect(on(has(TEXT, listed('exciting'), 'none'), subject(note))).toBe('met')
    expect(on(has(FILE, listed('exciting'), 'none'), subject(note))).toBe('missed')
  })

  it('skips a labelled first line, so an email’s body is read under its subject', () => {
    const email = 'Subject: Ferry 3.2 is out\n\nBookings now confirm themselves.'
    const body: Part = { part: 'text', skip: 'Subject' }
    expect(on(has(body, listed('Bookings now'), 'all', 'start'), subject(email))).toBe('met')
    expect(on(has(TEXT, listed('Bookings now'), 'all', 'start'), subject(email))).toBe('missed')
  })

  it('has no answer when the request holds none of the values', () => {
    expect(on(has(TEXT, request('amounts', ['Price'])), withBrief('12 USD'))).toBe('met')
    expect(
      on(
        has(TEXT, request('amounts', ['Price'])),
        subject('12 USD', 'markdown', { files: { 'brief.md': 'Product: Ferry' } }),
      ),
    ).toBe('none: not there')
    expect(on(has(TEXT, request('whole', [], 'notes.md')), withBrief('x'))).toBe('none: not there')
  })
})

describe('values drawn from the request', () => {
  const found = (values: Values, output: string, need: 'all' | 'none' = 'all') =>
    on(has(TEXT, values, need), withBrief(output))

  it('joins labelled lines, reads a list under a label, and the names of its items', () => {
    expect(found(request('whole', ['Product', 'Version']), 'Ferry 3.2 is here')).toBe('met')
    expect(found(request('whole', ['Product', 'Version']), 'Ferry is here, 3.2')).toBe('missed')
    expect(
      found(request('item names', ['Features']), 'Automatic confirmations and a waitlist'),
    ).toBe('met')
    expect(found(request('item names', ['Features']), 'Automatic confirmations only')).toBe(
      'missed',
    )
    // The list under Features ends at the Quote line: the quote is no feature.
    const items = answerExact(exact([has(TEXT, request('items', ['Features']))]), withBrief('x'))
    expect(items.saw[0]).toMatchObject({ missingTotal: 2 })
  })

  it('reads quoted words, headings at a level, and the request’s own text', () => {
    expect(found(request('quoted', ['Quote']), '“Ferry cut our calls in half,” Dana said.')).toBe(
      'met',
    )
    expect(found(request('quoted', ['Quote']), 'Ferry cut our calls.')).toBe('missed')
    const changes =
      '# Changes\n\n## 1. Faster search\n\n## 2. Faster search, part 2\n\n```\n## not a heading\n```'
    const s = (output: string) => subject(output, 'markdown', { files: { 'changes.md': changes } })
    const headings = request('headings', [], 'changes.md', 2)
    expect(on(has(TEXT, headings), s('Faster search, part 2 and Faster search'))).toBe('met')
    // Found only inside the longer title, the shorter is not found.
    expect(on(has(TEXT, headings), s('Faster search, part 2'))).toBe('missed')
    expect(
      on(
        has(TEXT, request('whole', [], null)),
        subject('Write about Ferry', 'markdown', { request: 'Ferry' }),
      ),
    ).toBe('met')
  })
})

describe('order', () => {
  const order = (values: Values, mode: 'in order' | 'first' | 'last'): ExactTest => ({
    test: 'order',
    read: TEXT,
    values,
    mode,
    match: 'words',
    case: 'any',
  })

  it('finds values one after another', () => {
    expect(on(order(listed('one', 'two', 'three'), 'in order'), subject('one two three'))).toBe(
      'met',
    )
    expect(on(order(listed('one', 'two', 'three'), 'in order'), subject('two one two three'))).toBe(
      'met',
    )
    expect(on(order(listed('one', 'two', 'three'), 'in order'), subject('two one three two'))).toBe(
      'missed',
    )
    const out = answerExact(
      exact([order(listed('one', 'two'), 'in order')]),
      subject('two then one'),
    )
    expect(answer(out)).toBe('missed')
    expect(out.saw[0]).toMatchObject({ out: { value: 'two' } })
    expect(on(order(listed('one', 'four'), 'in order'), subject('one two'))).toBe('missed')
  })

  it('finds the last listed after every other, and the first before', () => {
    expect(on(order(listed('a b', 'c d', 'e f'), 'last'), subject('c d, a b, e f'))).toBe('met')
    expect(on(order(listed('a b', 'c d', 'e f'), 'last'), subject('e f, a b'))).toBe('missed')
    expect(on(order(listed('a b', 'c d', 'e f'), 'first'), subject('a b, e f, a b'))).toBe('met')
    expect(on(order(listed('a b', 'c d'), 'first'), subject('c d'))).toBe('missed')
  })

  it('reads across the pieces of a part in the order of the output', () => {
    const lines: Part = { part: 'lines' }
    const test: ExactTest = {
      test: 'order',
      read: lines,
      values: listed('date', 'address'),
      mode: 'in order',
      match: 'words',
      case: 'any',
    }
    expect(on(test, subject('the date\nthe address'))).toBe('met')
    expect(on(test, subject('the address\nthe date'))).toBe('missed')
  })
})

describe('only', () => {
  const only = (
    read: Part,
    what: 'numbers' | 'links' | 'hex colours',
    allowed: Values,
  ): ExactTest => ({
    test: 'only',
    read,
    what,
    allowed,
  })

  it('holds numbers to the request, with a link’s and an address’s left out', () => {
    const allowed: Values = {
      from: 'request',
      in: 'request and files',
      file: null,
      labels: [],
      take: 'numbers',
      level: null,
    }
    const test = only(TEXT, 'numbers', allowed)
    expect(
      on(test, withBrief('Ferry 3.2 costs 12 USD: https://ferry.example/3-9 or v4@x.example')),
    ).toBe('met')
    const out = answerExact(exact([test]), withBrief('Ferry 3.2, used by 500 teams'))
    expect(answer(out)).toBe('missed')
    expect(out.saw[0]).toMatchObject({ outside: [{ value: '500', text: '500' }], outsideTotal: 1 })
    expect(on(test, withBrief('No numbers at all'))).toBe('met')
  })

  it('holds links to one labelled line', () => {
    const test = only(FILE, 'links', request('links', ['Link']))
    expect(on(test, withBrief('See https://ferry.example/3-2.'))).toBe('met')
    expect(on(test, withBrief('See https://ferry.example/3-3'))).toBe('missed')
  })

  it('holds a page’s colours to the brief’s, however their hex is written', () => {
    const styles: Part = { part: 'styles' }
    const test = only(styles, 'hex colours', request('hex colours', ['Colours']))
    const page = (css: string, attr = '') =>
      withBrief(`<style>${css}</style><p style="${attr}">x</p>`, 'html')
    expect(
      on(test, page('body { color: #0b3d5c; white-space: nowrap }', 'background:#F4F1EA')),
    ).toBe('met')
    expect(on(test, page('a { color: #e2572b }', 'color: #333'))).toBe('missed')
    // A colour by name or function is one this does not read: no answer, unless a hex is already off.
    expect(on(test, page('p { color: white }'))).toBe('none: other notation')
    expect(on(test, page('p { border: 1px solid rgba(0,0,0,.1) }'))).toBe('none: other notation')
    expect(on(test, page('p { color: white; background: #000 }'))).toBe('missed')
  })
})

describe('the parts of an output', () => {
  const email =
    'Subject: Ferry 3.2\n\nHello,\n\n- one\n* two\n\n4 March 2027\nhelp@ferry.example\nMara Lindqvist\n'

  it('reads a line by its label or its number, from either end', () => {
    const line = (label: string | null, number: number | null): Part => ({
      part: 'line',
      label,
      number,
    })
    expect(
      on(has(line('subject', null), listed('Ferry 3.2'), 'all', 'whole'), subject(email)),
    ).toBe('met')
    expect(on(has(line(null, 2), listed('Hello'), 'all', 'whole'), subject(email))).toBe('met')
    expect(on(has(line(null, -1), listed('Mara Lindqvist'), 'all', 'whole'), subject(email))).toBe(
      'met',
    )
    expect(on(has(line(null, 40), listed('x')), subject(email))).toBe('none: not there')
  })

  it('reads every line, for marks at their start', () => {
    const lines: Part = { part: 'lines' }
    const marks = has(lines, listed('- ', '* ', '#'), 'none', 'start', 'characters')
    expect(on(marks, subject(email))).toBe('missed')
    expect(on(marks, subject('Plain - text\nwith a #tag inside'))).toBe('met')
  })

  it('reads an element’s attribute, and an element without it is no piece', () => {
    const page = subject(
      '<html lang="en"><head><meta name="viewport" content="width=device-width"><meta charset="utf-8"></head><body><img src="a.png"><img alt="A map" src="b.png"></body></html>',
      'html',
    )
    expect(on(count(elements('html', 'lang'), 'items', 'exactly', 1), page)).toBe('met')
    expect(on(has(elements('meta', 'name'), listed('viewport'), 'any', 'whole'), page)).toBe('met')
    expect(on(count(elements('img', 'alt'), 'items', 'exactly', 1), page)).toBe('met')
    expect(on(has(elements('img', 'alt', 'last'), listed('A map'), 'all', 'whole'), page)).toBe(
      'met',
    )
    // The first image has no alt, so its alt is no piece to find anything in.
    expect(on(has(elements('img', 'alt', 'first'), listed('A map'), 'all', 'whole'), page)).toBe(
      'missed',
    )
  })

  it('reads the last element of a tag and what comes after it', () => {
    const page = (after: string) =>
      subject(
        `<main>x</main><footer>One</footer><footer>Questions? Write to help</footer>${after}`,
        'html',
      )
    const last = elements('footer', null, 'last')
    expect(on(has(last, listed('Questions? Write to')), page(''))).toBe('met')
    const after: Part = { part: 'after', tag: 'footer' }
    expect(on(count(after, 'characters', 'exactly', 0), page('\n</body>'))).toBe('met')
    expect(on(count(after, 'characters', 'exactly', 0), page('<p>©</p>'))).toBe('missed')
    expect(on(count({ part: 'after', tag: 'aside' }, 'characters', 'exactly', 0), page(''))).toBe(
      'none: not there',
    )
  })

  it('reads nested elements whole, and an element in a comment or a script not at all', () => {
    const page = subject(
      '<!-- <h2>old</h2> --><div><div>inner</div>outer</div><script>"<h2>no</h2>"</script><h2>yes</h2>',
      'html',
    )
    expect(
      on(has(elements('div', null, 'first'), listed('inner outer'), 'all', 'whole'), page),
    ).toBe('met')
    expect(on(count(elements('h2'), 'items', 'exactly', 1), page)).toBe('met')
  })

  it('reads the other files the agent wrote, by a path with a star', () => {
    const others = {
      'outputs/sum.test.mjs': "import test from 'node:test'",
      'outputs/sum.mjs': 'export const sum = () => 0',
      'outputs/deep/x.test.mjs': '',
    }
    const s = subject('export const sum = () => 0', 'code', { others })
    const tests: Part = { part: 'other file', path: 'outputs/*.test.mjs' }
    expect(on(count(tests, 'items', 'exactly', 1), s)).toBe('met')
    expect(on(has(tests, listed('node:test'), 'all', 'anywhere', 'characters'), s)).toBe('met')
  })

  it('does not find a value where a longer value of the same list begins or ends', () => {
    const items = listed('Faster search', 'Faster search, part 2')
    const s = subject('Faster search, part 2 is here.')
    expect(on(has(TEXT, items, 'all'), s)).toBe('missed')
    expect(on(has(TEXT, items, 'all', 'start'), s)).toBe('missed')
    expect(on(has(TEXT, items, 'any', 'start'), s)).toBe('met')
    const ends = listed('part 2', 'search, part 2')
    expect(on(has(TEXT, ends, 'all', 'end'), subject('Faster search, part 2'))).toBe('missed')
    expect(on(has(TEXT, items, 'all'), subject('Faster search. Then Faster search, part 2.'))).toBe(
      'met',
    )
  })

  it('gives no answer where no other file the path names was written', () => {
    const s = subject('export const sum = () => 0', 'code', {
      others: { 'outputs/sum.mjs': 'export const sum = () => 0' },
    })
    const none: Part = { part: 'other file', path: 'outputs/*.test.mjs' }
    expect(on(count(none, 'items', 'exactly', 0), s)).toBe('none: not there')
    expect(on(count(none, 'words', 'at most', 10), s)).toBe('none: not there')
    expect(on(has(none, listed('x')), s)).toBe('none: not there')
    expect(on(has(none, listed('x'), 'none'), s)).toBe('none: not there')
  })
})

describe('measure', () => {
  const layout = (fonts: Array<string | null>, leftOut = 0): PageLayout => ({
    window: [1280, 960],
    page: [1280, 2000],
    leftOut,
    elements: fonts.map((font, i) => ({
      id: i + 1,
      parent: 0,
      name: i === 0 ? 'main.col' : 'p',
      text: 'words',
      x: 0,
      y: i * 40,
      width: i === 0 ? 640 : 600,
      height: 30,
      scale: 1,
      unscaled: null,
      background: null,
      color: null,
      font,
      radius: null,
      padding: null,
      border: null,
      gap: null,
      shadows: 0,
    })),
  })
  const measure = (
    tag: string,
    property: 'width' | 'height' | 'font size',
    compare: 'at most' | 'at least' | 'exactly',
    px: number,
    each: 'every' | 'any' = 'every',
  ): ExactTest => ({ test: 'measure', tag, property, each, compare, px })
  const page = (l: PageLayout | null) => subject('<main><p>x</p></main>', 'html', { layout: l })

  it('reads what the page measured', () => {
    expect(on(measure('main', 'width', 'at most', 640), page(layout([null, '18px'])))).toBe('met')
    expect(on(measure('p', 'font size', 'exactly', 18), page(layout([null, '18px', '18px'])))).toBe(
      'met',
    )
    expect(on(measure('p', 'font size', 'exactly', 18), page(layout([null, '18px', '16px'])))).toBe(
      'missed',
    )
    expect(
      on(measure('p', 'font size', 'exactly', 16, 'any'), page(layout([null, '18px', '16px']))),
    ).toBe('met')
  })

  it('gives no answer on a page not measured, or measured in part', () => {
    expect(on(measure('p', 'font size', 'exactly', 18), page(null))).toBe('none: not measured')
    expect(on(measure('p', 'font size', 'exactly', 18), page(layout([null, '18px'], 4)))).toBe(
      'none: not listed',
    )
    // A miss among those listed is a miss whatever is left out.
    expect(on(measure('p', 'font size', 'exactly', 18), page(layout([null, '16px'], 4)))).toBe(
      'missed',
    )
    expect(on(measure('h1', 'width', 'at most', 9), page(layout([null])))).toBe('none: not there')
    expect(on(measure('p', 'font size', 'exactly', 18), page(layout([null, '1.1em'])))).toBe(
      'none: other notation',
    )
  })
})

describe('joining the tests of one reading', () => {
  const met = has(TEXT, listed('a'))
  const missed = has(TEXT, listed('zz'))
  const open: ExactTest = count(
    { part: 'line', label: 'Nope', number: null },
    'words',
    'at most',
    1,
  )
  const s = subject('a b')

  it('all: any miss is a miss; met only when every test is', () => {
    expect(answer(answerExact(exact([met, missed, open], 'all'), s))).toBe('missed')
    expect(answer(answerExact(exact([met, open], 'all'), s))).toBe('none: not there')
    expect(answer(answerExact(exact([met, met], 'all'), s))).toBe('met')
  })

  it('any: any meet is a meet; missed only when every test is', () => {
    expect(answer(answerExact(exact([missed, open, met], 'any'), s))).toBe('met')
    expect(answer(answerExact(exact([missed, open], 'any'), s))).toBe('none: not there')
    expect(answer(answerExact(exact([missed, missed], 'any'), s))).toBe('missed')
  })

  it('same: the readings that could be read, when they agree', () => {
    expect(answer(answerExact(exact([met, open], 'same'), s))).toBe('met')
    expect(answer(answerExact(exact([met, missed], 'same'), s))).toBe('none: differ')
    expect(answer(answerExact(exact([missed, missed], 'same'), s))).toBe('missed')
    expect(answer(answerExact(exact([open], 'same'), s))).toBe('none: not there')
  })

  it('opens an email with its subject or its first line, and answers where both agree', () => {
    const subjectLine: Part = { part: 'line', label: 'Subject', number: null }
    const body: Part = { part: 'text', skip: 'Subject' }
    const opens = (values: Values) =>
      exact([has(subjectLine, values, 'all', 'start'), has(body, values, 'all', 'start')], 'same')
    const headline = request('whole', ['Headline'])
    const read = (email: string) => answer(answerExact(opens(headline), withBrief(email)))
    expect(
      read('Subject: Bookings now confirm themselves\n\nBookings now confirm themselves.'),
    ).toBe('met')
    expect(read('Subject: Ferry 3.2\n\nBookings now confirm themselves.')).toBe('none: differ')
    expect(read('Subject: Ferry 3.2\n\nFerry 3.2 is out.')).toBe('missed')
    // A page has no subject: its text alone answers.
    expect(
      answer(
        answerExact(
          opens(headline),
          withBrief('<h1>Bookings now confirm themselves.</h1>', 'html'),
        ),
      ),
    ).toBe('met')
  })

  it('reads two kinds over one output without either changing the other', () => {
    const s2 = withBrief('Ferry 3.2 has 2 new features for 500 users. https://ferry.example/3-2')
    const numbers: ExactTest = {
      test: 'only',
      read: TEXT,
      what: 'numbers',
      allowed: request('numbers'),
    }
    const out = answerExact(
      exact([numbers, has(TEXT, listed('users'), 'none'), count(TEXT, 'links', 'exactly', 1)]),
      s2,
    )
    expect(out.saw.map((seen) => seen.answer)).toEqual(['missed', 'missed', 'met'])
    expect(out.saw[0]).toMatchObject({ outside: [{ value: '2' }, { value: '500' }] })
  })
})
