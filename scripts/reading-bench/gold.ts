/**
 * The gold readings of the `launch-note` test skill: every rule of both
 * versions and every check of its cases read as a `RuleReading`, by hand, as
 * the assistant is meant to read them. Where one is `exact`, `answerExact`
 * under it agrees with the answer key (`key.ts`) on every stored output
 * where both answer (`src/interfaces/cli/exact-key.test.ts`). The bench
 * (`sorted.ts`) sets a model's readings against these.
 */
import type { ExactTest, Part, RuleReading, Take, Values } from '@domain/rule-reading.ts'

// The readings, as data. Helpers only spell the shapes out.

const listed = (...items: string[]): Values => ({ from: 'listed', items })
const brief = (labels: string[], take: Take = 'whole'): Values => ({
  from: 'request',
  in: 'file',
  file: 'brief.md',
  labels,
  take,
  level: null,
})
const TEXT: Part = { part: 'text', skip: null }
const BODY: Part = { part: 'text', skip: 'Subject' }
const FILE: Part = { part: 'file' }
const SUBJECT: Part = { part: 'line', label: 'Subject', number: null }
const line = (number: number): Part => ({ part: 'line', label: null, number })
const elements = (tag: string, which: 'every' | 'last' = 'every'): Part => ({
  part: 'elements',
  tag,
  attribute: null,
  which,
})
const has = (
  read: Part,
  values: Values,
  need: 'all' | 'any' | 'none',
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
const exact = (
  outputs: Array<'text' | 'page'>,
  join: 'all' | 'any' | 'same',
  ...tests: ExactTest[]
): RuleReading => ({ reading: 'exact', outputs, join, tests })
const ANY: Array<'text' | 'page'> = ['text', 'page']
const changes = (take: Take, level: number | null): Values => ({
  from: 'request',
  in: 'file',
  file: 'changes.md',
  labels: [],
  take,
  level,
})

const HEADLINE = 'Open with the brief’s Headline'
const PRODUCT_FIRST = 'Start with the product’s name and version number'

/** The rules both versions hold alike, by how their words begin. */
const SHARED_RULES: ReadonlyArray<[string, RuleReading]> = [
  [
    'Use only numbers the brief states',
    exact(ANY, 'all', {
      test: 'only',
      read: TEXT,
      what: 'numbers',
      allowed: {
        from: 'request',
        in: 'request and files',
        file: null,
        labels: [],
        take: 'numbers',
        level: null,
      },
    }),
  ],
  ['Write no more than 120 words', exact(ANY, 'all', count(TEXT, 'words', 'at most', 120))],
  [
    'When the brief gives a Price',
    exact(ANY, 'all', has(TEXT, brief(['Price'], 'amounts'), 'all')),
  ],
  // The customer's name is the words after the quote, which no take reads.
  ['Quote the customer', { reading: 'judged', span: 'any' }],
  [
    'Never use the words exciting',
    exact(ANY, 'all', has(TEXT, listed('exciting', 'thrilled', 'delighted', 'proud'), 'none')),
  ],
  [
    'Put the subject on the first line',
    exact(
      ['text'],
      'all',
      has(line(1), listed('Subject:'), 'all', 'start', 'characters', 'exact'),
      count(SUBJECT, 'characters', 'at most', 50),
    ),
  ],
  [
    'Write plain text with no Markdown',
    exact(
      ['text'],
      'all',
      has({ part: 'lines' }, listed('#', '- ', '* ', '• '), 'none', 'start', 'characters'),
      has(FILE, listed('**'), 'none', 'anywhere', 'characters'),
    ),
  ],
  [
    'Give exactly one link',
    exact(['text'], 'all', count(FILE, 'links', 'exactly', 1), {
      test: 'only',
      read: FILE,
      what: 'links',
      allowed: brief(['Link']),
    }),
  ],
  [
    'End with the release date, the support address',
    exact(
      ['text'],
      'all',
      has(line(-3), brief(['Release date']), 'all'),
      has(line(-2), brief(['Support']), 'all'),
      has(line(-1), brief(['Signed by']), 'all'),
    ),
  ],
  [
    'Write one file with its styles in a <style> tag',
    exact(
      ['page'],
      'all',
      has(FILE, listed('<style'), 'all', 'anywhere', 'characters'),
      has(FILE, listed('<script', '@import'), 'none', 'anywhere', 'characters'),
      has(
        { part: 'elements', tag: 'link', attribute: 'rel', which: 'every' },
        listed('stylesheet'),
        'none',
      ),
    ),
  ],
  [
    'Use exactly one <h1>',
    exact(
      ['page'],
      'all',
      count(elements('h1'), 'items', 'exactly', 1),
      has(elements('h1'), brief(['Headline']), 'all', 'whole', 'characters'),
    ),
  ],
  // "The content column" is no tag a measure can be held to.
  ['Set the body text at 18px', { reading: 'judged', span: 'whole' }],
  [
    'Use only the colours in the brief’s Colours list',
    exact(['page'], 'all', {
      test: 'only',
      read: { part: 'styles' },
      what: 'hex colours',
      allowed: brief(['Colours'], 'hex colours'),
    }),
  ],
  [
    'End the page with a footer',
    exact(
      ['page'],
      'all',
      count(elements('footer'), 'items', 'at least', 1),
      has(elements('footer', 'last'), listed('Questions? Write to'), 'all'),
      has(elements('footer', 'last'), brief(['Support']), 'all'),
      count({ part: 'after', tag: 'footer' }, 'characters', 'exactly', 0),
    ),
  ],
]

const opensWith = (values: Values): RuleReading =>
  exact(ANY, 'same', has(SUBJECT, values, 'all', 'start'), has(BODY, values, 'all', 'start'))

/** The rules of each version, by how their words begin. */
export const RULES: Record<'v1' | 'v2', ReadonlyArray<[string, RuleReading]>> = {
  v1: [
    [HEADLINE, { reading: 'unmarkable', why: 'conflict', with: PRODUCT_FIRST, fix: null }],
    [PRODUCT_FIRST, { reading: 'unmarkable', why: 'conflict', with: HEADLINE, fix: null }],
    [
      'Try to keep the tone',
      {
        reading: 'unmarkable',
        why: 'vague',
        with: null,
        fix: 'Write to the reader as you, in short sentences.',
      },
    ],
    ...SHARED_RULES,
  ],
  v2: [
    [HEADLINE, opensWith(brief(['Headline']))],
    [
      'Name the product with its version',
      exact(ANY, 'all', has(TEXT, brief(['Product', 'Version']), 'all')),
    ],
    ['Never use the word users', exact(ANY, 'all', has(TEXT, listed('users', 'user'), 'none'))],
    [
      'Name every feature in the brief’s Features list',
      exact(ANY, 'all', has(TEXT, brief(['Features'], 'item names'), 'all')),
    ],
    // What the brief marks internal is a line of prose, and the codename a word in it.
    ['Leave out anything the brief marks Internal', { reading: 'judged', span: 'every' }],
    ...SHARED_RULES,
  ],
}

/** Each case's checks, by how their words begin. */
export const CHECKS: ReadonlyArray<[string, RuleReading]> = [
  [
    'The email names all six features',
    exact(
      ANY,
      'all',
      has(
        TEXT,
        listed(
          'Gap finder',
          'Last-minute offers',
          'Group bookings',
          'Gift cards',
          'Repeat bookings',
          'Busy-time report',
        ),
        'all',
      ),
    ),
  ],
  [
    'The email gives the release date, 9 June 2027',
    exact(ANY, 'all', has(TEXT, listed('9 June 2027'), 'all')),
  ],
  // Other words can say it: free, at no cost, included.
  ['The email says the update is free', { reading: 'judged', span: 'any' }],
  [
    'The email gives the support address',
    exact(ANY, 'all', has(TEXT, listed('help@ferry.example'), 'all')),
  ],
  [
    'The email states the price as 12 USD a month',
    exact(ANY, 'all', has(TEXT, listed('12 USD a month'), 'all')),
  ],
  [
    'The email gives the release date, 4 March 2027',
    exact(ANY, 'all', has(TEXT, listed('4 March 2027'), 'all')),
  ],
  [
    'The email names Priya Raman',
    exact(ANY, 'all', has(TEXT, listed('Priya Raman', 'Slate & Pine Studio'), 'all')),
  ],
  [
    'The page states the price as 12 USD a month',
    exact(ANY, 'all', has(TEXT, listed('12 USD a month'), 'all')),
  ],
  [
    'The page has a link or a button that reads Book a demo',
    exact(
      ['page'],
      'any',
      has(elements('a'), listed('Book a demo'), 'any', 'whole'),
      has(elements('button'), listed('Book a demo'), 'any', 'whole'),
    ),
  ],
  ['The page lists all 180 changes', exact(ANY, 'all', has(TEXT, changes('headings', 2), 'all'))],
  [
    'The last change on the page is',
    exact(ANY, 'all', {
      test: 'order',
      read: TEXT,
      values: changes('headings', 2),
      mode: 'last',
      match: 'words',
      case: 'any',
    }),
  ],
]

const plain = (text: string) => text.replace(/`/g, '').replace(/[‘’]/g, "'")

/** The gold reading of the rule or check whose words begin as one of `table`'s; throws when none does. */
export function goldOf(table: ReadonlyArray<[string, RuleReading]>, text: string): RuleReading {
  const found = table.find(([opening]) => plain(text).startsWith(plain(opening)))
  if (!found) throw new Error(`no gold reading for "${text}"`)
  return found[1]
}
