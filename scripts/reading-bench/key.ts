/**
 * The answer key of the `launch-note` test skill (`fixtures/launch-note`).
 * Every rule and check of that skill was written so that code can tell
 * whether an output meets it, by reading the output and the brief it was
 * written from. So a reading of its runs, Jev's or the assistant's, can be
 * counted against answers nobody had to mark by hand.
 *
 * An answer is true, false, or null where code cannot tell: a rule about
 * tone, a count close to its limit, a size given in a unit this does not
 * read. A null is no answer, and counts for and against nobody.
 */
import { pageText } from '@domain/text.ts'

type Truth = boolean | null

/** One output and what it was written from. */
export interface KeySubject {
  /** The output's main file, as written. */
  raw: string
  /** Whether that file is a page. */
  page: boolean
  /** The case's input files that read as text, by name. `brief.md` is the brief. */
  inputs: Readonly<Record<string, string>>
}

/** A fact to answer: a rule or a check, by its words. */
export interface KeyFact {
  id: string
  kind: 'rule' | 'check'
  text: string
}

/** The brief's named lines, and its list of features by name. */
export interface Brief {
  lines: Record<string, string>
  features: string[]
}

export function briefOf(text: string): Brief {
  const lines: Record<string, string> = {}
  const features: string[] = []
  for (const line of text.split('\n')) {
    const feature = /^- ([^:]+):/.exec(line)
    if (feature) features.push(feature[1].trim())
    const named = /^([A-Z][A-Za-z ]*):\s*(.*)$/.exec(line)
    if (named?.[2]) lines[named[1]] = named[2].trim()
  }
  return { lines, features }
}

/** Text as it is compared: curly quotes straight, entities read, runs of whitespace one space. */
const plain = (text: string): string =>
  text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // Last, so "&amp;quot;" reads as "&quot;" and is never decoded twice.
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const has = (text: string, part: string): boolean =>
  plain(text).toLowerCase().includes(plain(part).toLowerCase())

/** What a reader sees of the output: a page without its tags and styles, an email as it is. */
const seen = (subject: KeySubject): string => (subject.page ? pageText(subject.raw) : subject.raw)

/** An email's lines after its subject line; a page's text as seen. */
function body(subject: KeySubject): string {
  const text = seen(subject).trim()
  return subject.page ? text : text.replace(/^Subject:[^\n]*\n?/, '').trim()
}

/**
 * Whether the output opens with `words`. An email opens twice, with its
 * subject and with its first line under it: where the two differ, a reader
 * could hold either to the rule, so code gives no answer.
 */
function opensWith(subject: KeySubject, words: string): Truth {
  const inBody = plain(body(subject)).startsWith(plain(words))
  const line = subject.page ? null : /^Subject:\s*(.*)$/.exec(subject.raw.trim().split('\n')[0])
  if (!line) return inBody
  // A subject often drops the full stop its headline ends with.
  const inSubject = plain(line[1]).startsWith(plain(words).replace(/[.!?]+$/, ''))
  return inSubject === inBody ? inBody : null
}

const URLS = /https?:\/\/[^\s<>"')]+/g
const ADDRESSES = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g

/** Every number in a text, without the ones inside a link or an address. */
const numbersIn = (text: string): string[] =>
  (
    text
      .replace(URLS, ' ')
      .replace(ADDRESSES, ' ')
      .match(/\d+(?:[.,:]\d+)*/g) ?? []
  ).map((n) => n.replace(/,/g, ''))

/** The customer's words in the brief's `Quote` line, and their name. */
function quoteOf(brief: Brief): { words: string; name: string } | null {
  const quote = /^"(.+)"\s*([^,"]+),/.exec(plain(brief.lines.Quote ?? ''))
  return quote ? { words: quote[1], name: quote[2].trim() } : null
}

/** How far a count may be from its limit before code calls it: 5%, since two ways of counting words differ by a few. */
const NEAR = 0.05

/** Whether `count` is within `limit`; null when it is too close to call. */
const within = (count: number, limit: number): Truth =>
  count <= limit * (1 - NEAR) ? true : count >= limit * (1 + NEAR) ? false : null

/** The text of every `<style>` tag and `style` attribute of a page. */
function stylesOf(html: string): string {
  const tags = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
  const inline = [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1])
  return [...tags, ...inline].join('\n')
}

/** A hex colour in six lower-case digits. */
const hex = (colour: string): string => {
  const digits = colour.slice(1).toLowerCase()
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits.slice(0, 6)}`
}

/** A colour named by a word or a function, which this key does not read. */
const OTHER_COLOUR =
  /\b(?:rgba?|hsla?)\(|:\s*(?:white|black|red|blue|green|gr[ae]y|silver|navy|orange)\b/i

function coloursMet(subject: KeySubject, brief: Brief): Truth {
  if (!brief.lines.Colours) return null
  const allowed = new Set((brief.lines.Colours.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map(hex))
  const css = stylesOf(subject.raw)
  const used = (css.match(/#[0-9a-f]{3,8}\b/gi) ?? []).map(hex)
  if (used.some((colour) => !allowed.has(colour))) return false
  return OTHER_COLOUR.test(css) ? null : true
}

/** Body text at 18px, and a column no wider than 640px, as the page's styles state them in px. */
function measuresMet(subject: KeySubject): Truth {
  const css = stylesOf(subject.raw)
  const bodyRule = /(?:^|[}\s,])(?:html|body)\b[^{}]*\{([^}]*)\}/i.exec(css)?.[1] ?? ''
  const font =
    /font-size:\s*([\d.]+)px/i.exec(bodyRule) ?? /font:[^;]*?\b([\d.]+)px/i.exec(bodyRule)
  const widths = [...css.matchAll(/max-width:\s*([\d.]+)px/gi)].map((m) => Number(m[1]))
  const size: Truth = font ? Number(font[1]) === 18 : null
  const column: Truth = widths.length ? Math.min(...widths) <= 640 : null
  if (size === false || column === false) return false
  return size && column ? true : null
}

function footerMet(subject: KeySubject, brief: Brief): Truth {
  const footers = [...subject.raw.matchAll(/<footer[\s>][\s\S]*?<\/footer>/gi)]
  const last = footers.at(-1)
  if (!last) return false
  const after = subject.raw.slice((last.index ?? 0) + last[0].length)
  return (
    has(pageText(last[0]), 'Questions? Write to') &&
    has(last[0], brief.lines.Support ?? '\0') &&
    !pageText(after).trim()
  )
}

/** The last three lines of an email with words in them hold the date, the address and the signer, in that order. */
function endingMet(subject: KeySubject, brief: Brief): Truth {
  const lines = subject.raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const [date, support, signer] = lines.slice(-3)
  if (!signer) return false
  return (
    has(date, brief.lines['Release date'] ?? '\0') &&
    has(support, brief.lines.Support ?? '\0') &&
    has(signer, brief.lines['Signed by'] ?? '\0')
  )
}

type Answerer = (subject: KeySubject, brief: Brief) => Truth

/** Each rule of the skill, in either version, by how its words begin, with the code that answers it. */
const RULES: ReadonlyArray<[RegExp, Answerer]> = [
  [/^Open with the brief's Headline/, (s, b) => opensWith(s, b.lines.Headline)],
  [
    /^Start with the product's name and version number/,
    (s, b) => opensWith(s, `${b.lines.Product} ${b.lines.Version}`),
  ],
  [
    /^Name the product with its version/,
    (s, b) => has(seen(s), `${b.lines.Product} ${b.lines.Version}`),
  ],
  [
    /^Use only numbers the brief states/,
    (s) => {
      const stated = new Set(Object.values(s.inputs).flatMap(numbersIn))
      return numbersIn(seen(s)).every((n) => stated.has(n))
    },
  ],
  [
    /^Write no more than 120 words/,
    (s) => within(seen(s).split(/\s+/).filter(Boolean).length, 120),
  ],
  [
    /^When the brief gives a Price/,
    (s, b) => {
      const price = /^([\d.,]+ [A-Z]{3})\b/.exec(b.lines.Price ?? '')
      return price ? has(seen(s), price[1]) : null
    },
  ],
  [
    /^Quote the customer in the brief's Quote/,
    (s, b) => {
      const quote = quoteOf(b)
      return quote ? has(seen(s), quote.words) && has(seen(s), quote.name) : null
    },
  ],
  [
    /^Never use the words exciting/,
    (s) => !/\b(?:exciting|thrilled|delighted|proud)\b/i.test(seen(s)),
  ],
  // A rule about tone has no answer code can give.
  [/^Try to keep the tone/, () => null],
  [/^Never use the word users/, (s) => !/\busers?\b/i.test(seen(s))],
  [
    /^Name every feature in the brief's Features list/,
    (s, b) => (b.features.length ? b.features.every((name) => has(seen(s), name)) : null),
  ],
  [
    /^Leave out anything the brief marks Internal/,
    (s, b) => (b.lines.Internal ? !/falcon/i.test(seen(s)) : null),
  ],
  [
    /^Put the subject on the first line/,
    (s) => {
      const subject = /^Subject: (.+)$/.exec(s.raw.split('\n')[0].trimEnd())
      // Characters are counted one way only, so this one is never too close to call.
      return subject ? subject[1].length <= 50 : false
    },
  ],
  [/^Write plain text with no Markdown/, (s) => !/^\s*(?:#|[-*•]\s)|\*\*/m.test(s.raw)],
  [
    /^Give exactly one link/,
    (s, b) => {
      const links = (s.raw.match(URLS) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ''))
      return links.length === 1 && links[0] === b.lines.Link
    },
  ],
  [/^End with the release date, the support address/, endingMet],
  [
    /^Write one file with its styles in a <style> tag/,
    (s) =>
      /<style[\s>]/i.test(s.raw) &&
      !/<script[\s>]/i.test(s.raw) &&
      !/<link[^>]+stylesheet/i.test(s.raw) &&
      !/@import/i.test(s.raw),
  ],
  [
    /^Use exactly one <h1>/,
    (s, b) => {
      const headings = [...s.raw.matchAll(/<h1[\s>][\s\S]*?<\/h1>/gi)]
      return headings.length === 1 && plain(pageText(headings[0][0])) === plain(b.lines.Headline)
    },
  ],
  [/^Set the body text at 18px/, measuresMet],
  [/^Use only the colours in the brief's Colours list/, coloursMet],
  [/^End the page with a footer/, footerMet],
]

/** The titles of the changes in `changes.md`, in order. */
const changeTitles = (inputs: KeySubject['inputs']): string[] =>
  [...(inputs['changes.md'] ?? '').matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1].trim())

/** Each check of the skill's cases, by its words. A check that could be met in other words is true or left open. */
const CHECKS: ReadonlyArray<[RegExp, Answerer]> = [
  [/states the price as (.+)\.$/, (s, b) => has(seen(s), b.lines.Price ?? '\0')],
  [/gives the release date/, (s, b) => has(seen(s), b.lines['Release date'] ?? '\0')],
  [
    /says the update is free for everyone on a paid plan/,
    (s) => has(seen(s), 'free for everyone on a paid plan') || null,
  ],
  [/gives the support address/, (s, b) => has(seen(s), b.lines.Support ?? '\0')],
  [
    /names Priya Raman of Slate & Pine Studio/,
    (s) => has(seen(s), 'Priya Raman') && has(seen(s), 'Slate & Pine Studio'),
  ],
  [/names all six features/, (s, b) => b.features.every((name) => has(seen(s), name))],
  [/a link or a button that reads Book a demo/, (s) => />\s*Book a demo\s*</i.test(s.raw)],
  [
    /lists all 180 changes/,
    (s) => {
      const titles = changeTitles(s.inputs)
      const text = plain(seen(s)).toLowerCase()
      // A title that opens another's ("Faster search", "Faster search, part 2") is looked for whole.
      return (
        titles.length === 180 &&
        titles.every((title) =>
          new RegExp(`${literal(plain(title).toLowerCase())}(?!, part)`).test(text),
        )
      )
    },
  ],
  [
    /The last change on the page is (.+)\.$/,
    (s) => {
      const titles = changeTitles(s.inputs)
      const text = plain(seen(s)).toLowerCase()
      const last = titles.at(-1)
      if (!last) return null
      const at = text.lastIndexOf(last.toLowerCase())
      return (
        at >= 0 &&
        titles.slice(0, -1).every((title) => text.lastIndexOf(plain(title).toLowerCase()) < at)
      )
    },
  ],
]

/** `text` as a pattern that matches only itself. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A rule or a check as the key reads it: without the backticks a writer put round a name. */
const words = (text: string): string => plain(text.replace(/`/g, ''))

/**
 * The key's answer on each fact it knows, by the fact's id. A fact it does
 * not know, and one code cannot tell, is left out.
 */
export function answersOf(subject: KeySubject, facts: readonly KeyFact[]): Record<string, boolean> {
  const brief = briefOf(subject.inputs['brief.md'] ?? '')
  const answers: Record<string, boolean> = {}
  for (const fact of facts) {
    const table = fact.kind === 'rule' ? RULES : CHECKS
    const answerer = table.find(([opening]) => opening.test(words(fact.text)))?.[1]
    const truth = answerer ? answerer(subject, brief) : null
    if (truth !== null) answers[fact.id] = truth
  }
  return answers
}

/** Whether the key has code for a fact, whatever it answers. */
export const known = (fact: Pick<KeyFact, 'kind' | 'text'>): boolean =>
  (fact.kind === 'rule' ? RULES : CHECKS).some(([opening]) => opening.test(words(fact.text)))
