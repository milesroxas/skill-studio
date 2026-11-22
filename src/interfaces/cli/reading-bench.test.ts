/**
 * The answer key of the `launch-note` test skill. A reading is counted
 * against it, so each answer it gives is checked here on an output written
 * to meet the rule and on one written to miss it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { scanRules } from '@domain/rules.ts'
import { loadCases } from '@infrastructure/cases.ts'
import { describe, expect, it } from 'vitest'
import { answersOf, briefOf, type KeyFact, known } from '../../../scripts/reading-bench/key.ts'

const SKILL = resolve(import.meta.dirname, '../../../fixtures/launch-note')
const BENCH = resolve(import.meta.dirname, '../../../scripts/reading-bench')
const cases = loadCases(SKILL)
const inputsOf = (id: string): Record<string, string> => {
  const found = cases.find((c) => c.id === id)
  if (!found) throw new Error(`no case ${id}`)
  return Object.fromEntries(
    found.files.map((file) => [
      file.split('/files/')[1],
      readFileSync(resolve(SKILL, file), 'utf8'),
    ]),
  )
}

const rulesOf = (file: string): KeyFact[] =>
  scanRules(readFileSync(resolve(BENCH, 'skill', file), 'utf8')).rules.map((rule) => ({
    id: rule.text,
    kind: 'rule' as const,
    text: rule.text,
  }))
const RULES = [...rulesOf('v1.md'), ...rulesOf('v2.md')]
const CHECKS: KeyFact[] = cases.flatMap((c) =>
  c.graders.map((g) => ({ id: g.statement, kind: 'check' as const, text: g.statement })),
)

/** The key's answer on the one rule or check whose words begin with `opening`. */
function answer(opening: string, raw: string, caseId: string, page = false): boolean | null {
  const fact = [...RULES, ...CHECKS].find((f) => f.text.replace(/`/g, '').startsWith(opening))
  if (!fact) throw new Error(`no rule or check begins "${opening}"`)
  const answers = answersOf({ raw, page, inputs: inputsOf(caseId) }, [fact])
  return Object.hasOwn(answers, fact.id) ? answers[fact.id] : null
}

const EMAIL = `Subject: Bookings now confirm themselves

Bookings now confirm themselves. Ferry 3.2 sends the confirmation as soon as someone picks a slot. Automatic confirmations, Waitlist and Calendar sync are in, for 12 USD a month.

"Ferry cut our booking calls in half." Dana Okafor, Tidewater Kayaks

See it at https://ferry.example/3-2

4 March 2027
help@ferry.example
Mara Lindqvist
`

const page = (over: { css?: string; body?: string } = {}) => `<!doctype html>
<html lang="en"><head><style>
${over.css ?? 'body { font-size: 18px; color: #0B3D5C; background: #F4F1EA; } main { max-width: 640px; } a { color: #e2572b; }'}
</style></head><body><main>
${over.body ?? '<h1>Bookings now confirm themselves.</h1><p>Ferry 3.2 costs 12 USD a month.</p><a href="https://ferry.example/3-2">Book a demo</a>'}
</main><footer><p>Questions? Write to help@ferry.example</p></footer></body></html>`

describe('the skill and the key', () => {
  it('has code for every rule of both versions and every check of every case', () => {
    expect(RULES.filter((fact) => !known(fact)).map((f) => f.text)).toEqual([])
    expect(CHECKS.filter((fact) => !known(fact)).map((f) => f.text)).toEqual([])
    expect(RULES.length).toBeGreaterThan(30)
  })

  it('keeps the skill at one of the two versions the key was written for', () => {
    const now = readFileSync(resolve(SKILL, 'SKILL.md'), 'utf8')
    const versions = ['v1.md', 'v2.md'].map((f) => readFileSync(resolve(BENCH, 'skill', f), 'utf8'))
    expect(versions).toContain(now)
  })

  it('reads the brief’s named lines and its features', () => {
    const brief = briefOf(inputsOf('email-price')['brief.md'])
    expect(brief.lines).toMatchObject({ Product: 'Ferry', Version: '3.2', Price: '12 USD a month' })
    expect(brief.features).toEqual(['Automatic confirmations', 'Waitlist', 'Calendar sync'])
  })
})

describe('rules for every announcement', () => {
  it('the headline opens the body, after an email’s subject', () => {
    expect(answer('Open with the brief', EMAIL, 'email-price')).toBe(true)
    const reworded = EMAIL.replaceAll(
      'Bookings now confirm themselves',
      'Bookings confirm on their own',
    )
    expect(answer('Open with the brief', reworded, 'email-price')).toBe(false)
  })

  it('the product and version first cannot hold beside the headline', () => {
    expect(answer('Start with the product', EMAIL, 'email-price')).toBe(false)
    const both = 'Subject: Ferry 3.2: news\n\nFerry 3.2: Bookings now confirm themselves.'
    expect(answer('Start with the product', both, 'email-price')).toBe(true)
    expect(answer('Open with the brief', both, 'email-price')).toBe(false)
  })

  it('gives no answer where an email’s subject opens one way and its first line another', () => {
    expect(
      answer('Start with the product', 'Subject: Ferry 3.2: news\n\nHi,', 'email-price'),
    ).toBeNull()
    expect(answer('Start with the product', 'Subject: News\n\nHi,', 'email-price')).toBe(false)
    expect(answer('Start with the product', 'Ferry 3.2 is out.', 'email-price')).toBe(true)
  })

  it('a number the brief does not state, but not one in a link or an address', () => {
    expect(answer('Use only numbers', EMAIL, 'email-price')).toBe(true)
    expect(answer('Use only numbers', `${EMAIL}\nOver 500 teams use it.`, 'email-price')).toBe(
      false,
    )
  })

  it('the word limit, left open close to it', () => {
    const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
    expect(answer('Write no more than 120 words', words(100), 'email-price')).toBe(true)
    expect(answer('Write no more than 120 words', words(121), 'email-price')).toBeNull()
    expect(answer('Write no more than 120 words', words(140), 'email-price')).toBe(false)
  })

  it('the price with its currency code, and no answer for a brief with no price', () => {
    expect(answer('When the brief gives a Price', EMAIL, 'email-price')).toBe(true)
    expect(
      answer('When the brief gives a Price', EMAIL.replace('12 USD', '$12'), 'email-price'),
    ).toBe(false)
    expect(answer('When the brief gives a Price', EMAIL, 'email-free')).toBeNull()
  })

  it('the quote word for word with the name, in curly quotes too', () => {
    expect(answer('Quote the customer', EMAIL, 'email-price')).toBe(true)
    expect(answer('Quote the customer', EMAIL.replace(/"/g, '”'), 'email-price')).toBe(true)
    expect(answer('Quote the customer', EMAIL.replace('in half', 'by half'), 'email-price')).toBe(
      false,
    )
    expect(
      answer('Quote the customer', EMAIL.replace('Dana Okafor', 'A customer'), 'email-price'),
    ).toBe(false)
  })

  it('the words that are never used', () => {
    expect(answer('Never use the words exciting', EMAIL, 'email-price')).toBe(true)
    expect(answer('Never use the words exciting', `${EMAIL}We are thrilled.`, 'email-price')).toBe(
      false,
    )
  })

  it('gives no answer on tone', () => {
    expect(answer('Try to keep the tone', EMAIL, 'email-price')).toBeNull()
  })

  it('version two: the product named, no "users", every feature, nothing internal', () => {
    expect(answer('Name the product with its version', EMAIL, 'email-price')).toBe(true)
    expect(
      answer(
        'Name the product with its version',
        EMAIL.replace('Ferry 3.2', 'Ferry'),
        'email-price',
      ),
    ).toBe(false)
    expect(answer('Never use the word users', `${EMAIL}Users will like it.`, 'email-price')).toBe(
      false,
    )
    expect(answer('Name every feature', EMAIL, 'email-price')).toBe(true)
    expect(answer('Name every feature', EMAIL.replace('Waitlist', 'A queue'), 'email-price')).toBe(
      false,
    )
    expect(answer('Leave out anything', EMAIL, 'email-price')).toBe(true)
    expect(answer('Leave out anything', `${EMAIL}Built as Falcon.`, 'email-price')).toBe(false)
  })
})

describe('rules for an email', () => {
  it('the subject on the first line, in 50 characters', () => {
    expect(answer('Put the subject', EMAIL, 'email-price')).toBe(true)
    expect(answer('Put the subject', `Subject: ${'x'.repeat(51)}\n`, 'email-price')).toBe(false)
    expect(answer('Put the subject', `Hello\n${EMAIL}`, 'email-price')).toBe(false)
  })

  it('no Markdown', () => {
    expect(answer('Write plain text', EMAIL, 'email-price')).toBe(true)
    expect(answer('Write plain text', `${EMAIL}- Waitlist`, 'email-price')).toBe(false)
    expect(
      answer('Write plain text', EMAIL.replace('Waitlist', '**Waitlist**'), 'email-price'),
    ).toBe(false)
  })

  it('exactly one link, the brief’s', () => {
    expect(answer('Give exactly one link', EMAIL, 'email-price')).toBe(true)
    expect(
      answer('Give exactly one link', `${EMAIL}https://ferry.example/help`, 'email-price'),
    ).toBe(false)
    expect(answer('Give exactly one link', EMAIL.replace('/3-2', '/new'), 'email-price')).toBe(
      false,
    )
  })

  it('the three closing lines, in order', () => {
    expect(answer('End with the release date', EMAIL, 'email-price')).toBe(true)
    const swapped = EMAIL.replace(
      '4 March 2027\nhelp@ferry.example',
      'help@ferry.example\n4 March 2027',
    )
    expect(answer('End with the release date', swapped, 'email-price')).toBe(false)
    expect(answer('End with the release date', `${EMAIL}Thanks!`, 'email-price')).toBe(false)
  })
})

describe('rules for a web page', () => {
  const on = (opening: string, html: string) => answer(opening, html, 'page-basic', true)

  it('one file, styles in a tag, no script', () => {
    expect(on('Write one file', page())).toBe(true)
    expect(on('Write one file', page({ body: '<script>1</script>' }))).toBe(false)
  })

  it('one h1 holding the headline', () => {
    expect(on('Use exactly one <h1>', page())).toBe(true)
    expect(on('Use exactly one <h1>', page({ body: '<h1>Ferry 3.2</h1>' }))).toBe(false)
    expect(
      on(
        'Use exactly one <h1>',
        page({ body: '<h1>Bookings now confirm themselves.</h1><h1>More</h1>' }),
      ),
    ).toBe(false)
  })

  it('the body size and the column width, left open in another unit', () => {
    expect(on('Set the body text at 18px', page())).toBe(true)
    expect(
      on(
        'Set the body text at 18px',
        page({ css: 'body { font-size: 16px } main { max-width: 640px }' }),
      ),
    ).toBe(false)
    expect(
      on(
        'Set the body text at 18px',
        page({ css: 'body { font-size: 18px } main { max-width: 800px }' }),
      ),
    ).toBe(false)
    expect(
      on(
        'Set the body text at 18px',
        page({ css: 'body { font-size: 1.125rem } main { max-width: 40rem }' }),
      ),
    ).toBeNull()
  })

  it('only the brief’s colours, in either case and three digits or six', () => {
    expect(on('Use only the colours', page())).toBe(true)
    expect(on('Use only the colours', page({ css: 'body { color: #333 }' }))).toBe(false)
    expect(
      on(
        'Use only the colours',
        page({ css: 'body { color: #0b3d5c; border: 1px solid rgba(0,0,0,.1) }' }),
      ),
    ).toBeNull()
  })

  it('the footer last, with the line and the address', () => {
    expect(on('End the page with a footer', page())).toBe(true)
    expect(on('End the page with a footer', page().replace('Questions? Write to', 'Contact'))).toBe(
      false,
    )
    expect(
      on('End the page with a footer', page().replace('</body>', '<p>Thanks</p></body>')),
    ).toBe(false)
  })

  it('counts a page’s words and numbers as a reader sees them, not its styles', () => {
    expect(on('Use only numbers', page())).toBe(true)
    expect(on('Write no more than 120 words', page())).toBe(true)
  })
})

describe('checks', () => {
  it('the price, the date, the address and the names', () => {
    expect(answer('The email states the price', EMAIL, 'email-price')).toBe(true)
    expect(answer('The email states the price', EMAIL.replace(' a month', ''), 'email-price')).toBe(
      false,
    )
    expect(answer('The email gives the release date', EMAIL, 'email-price')).toBe(true)
    expect(answer('The email gives the support address', EMAIL, 'email-free')).toBe(true)
    expect(
      answer('The email names Priya Raman', 'Priya Raman, Slate &amp; Pine Studio', 'email-quote'),
    ).toBe(true)
    expect(answer('The email names all six features', EMAIL, 'email-crowded')).toBe(false)
  })

  it('leaves a check open that other words could meet', () => {
    expect(
      answer(
        'The email says the update is free',
        'It is free for everyone on a paid plan.',
        'email-free',
      ),
    ).toBe(true)
    expect(
      answer('The email says the update is free', 'It costs nothing on a paid plan.', 'email-free'),
    ).toBeNull()
  })

  it('the link or button', () => {
    expect(answer('The page has a link or a button', page(), 'page-basic', true)).toBe(true)
    expect(
      answer(
        'The page has a link or a button',
        page({ body: '<a>Try it</a>' }),
        'page-basic',
        true,
      ),
    ).toBe(false)
  })

  it('all 180 changes, and the last one last', () => {
    const titles = [...inputsOf('page-long')['changes.md'].matchAll(/^## \d+\. (.+)$/gm)].map(
      (m) => m[1],
    )
    const list = (items: string[]) => page({ body: items.map((t) => `<h2>${t}</h2>`).join('') })
    expect(titles).toHaveLength(180)
    expect(answer('The page lists all 180 changes', list(titles), 'page-long', true)).toBe(true)
    // Without the first, whose title also opens five later ones.
    expect(answer('The page lists all 180 changes', list(titles.slice(1)), 'page-long', true)).toBe(
      false,
    )
    expect(answer('The last change on the page', list(titles), 'page-long', true)).toBe(true)
    expect(
      answer('The last change on the page', list([...titles].reverse()), 'page-long', true),
    ).toBe(false)
  })
})
