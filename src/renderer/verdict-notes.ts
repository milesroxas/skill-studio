/**
 * The line under a fact that says how code answered it, or why nobody can
 * mark it: plain words built from what grading kept (`CodeAnswer`,
 * `Unmarked`), never from a model's own sentence. A reader who does not write
 * code reads it, so it names what was counted or found, in the output's own
 * words where it quotes, and nothing of how the app reads a rule.
 */
import type { Seen } from '@domain/exact.ts'
import type { CodeAnswer, Unmarked, Verdict } from '@domain/pack.ts'
import type { ExactTest } from '@domain/rule-reading.ts'

/** The longest quote of an output a line holds. */
const QUOTE_MAX = 60

const quote = (text: string): string => {
  // A sentence quoted whole ends at the quote: its own full stop would stand beside the line's.
  const one = text.replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  return `“${one.length > QUOTE_MAX ? `${one.slice(0, QUOTE_MAX - 1).trimEnd()}…` : one}”`
}

/** A count as the app writes one: 7,524. */
const n = (count: number): string => count.toLocaleString('en-US')

/** "and 3 more" after the first of a list, when there are more. */
const more = (total: number): string => (total > 1 ? ` and ${n(total - 1)} more` : '')

/** What a count counts, one and many. Items are the parts a rule reads, such as its lines. */
const UNITS: Record<string, [string, string]> = {
  words: ['word', 'words'],
  characters: ['character', 'characters'],
  items: ['item', 'items'],
  numbers: ['number', 'numbers'],
  links: ['link', 'links'],
  addresses: ['address', 'addresses'],
  'hex colours': ['colour code', 'colour codes'],
  amounts: ['amount', 'amounts'],
}

const unit = (test: ExactTest | undefined, n: number): string => {
  const [one, many] = UNITS[test?.test === 'count' ? test.what : 'items'] ?? UNITS.items
  return n === 1 ? one : many
}

/** One test's answer in words; null where it says nothing a reader can use. */
function seenWords(seen: Seen, test: ExactTest | undefined): string | null {
  switch (seen.test) {
    case 'count': {
      const [counted] = seen.counts
      const bound = n(seen.n)
      if (seen.answer === 'none') {
        const low = Math.min(...seen.counts)
        const high = Math.max(...seen.counts)
        return `${n(low)} to ${n(high)} ${unit(test, high)} by different ways of counting, against ${bound}`
      }
      const of = `${n(counted)} ${unit(test, counted)}`
      const met = seen.answer === 'met'
      if (seen.compare === 'at most')
        return met ? `${of}, within ${bound}` : `${of}, more than ${bound}`
      if (seen.compare === 'at least')
        return met ? `${of}, at least ${bound}` : `${of}, fewer than ${bound}`
      return met ? `exactly ${of}` : `${of}, not ${bound}`
    }
    case 'has': {
      const none = test?.test === 'has' && test.need === 'none'
      if (none)
        return seen.found.length
          ? `found ${quote(seen.found[0].text)}${more(seen.foundTotal)}`
          : 'found none of what it rules out'
      if (seen.answer === 'met' && seen.found.length)
        return `found ${quote(seen.found[0].text)}${more(seen.foundTotal)}`
      if (seen.missing.length) return `no ${quote(seen.missing[0])}${more(seen.missingTotal)}`
      return null
    }
    case 'order':
      if (seen.out) return `${quote(seen.out.text)} is out of order`
      if (seen.missing.length) return `no ${quote(seen.missing[0])}`
      return seen.answer === 'met' ? 'in the right order' : null
    case 'only':
      if (seen.outside.length)
        return `found ${quote(seen.outside[0].text)}${more(seen.outsideTotal)}, which is not allowed`
      if (seen.otherNotation.length)
        return `${quote(seen.otherNotation[0].text)} is written in a way it does not read`
      return seen.answer === 'met' ? 'nothing that is not allowed' : null
    case 'measure': {
      if (seen.answer === 'none' && seen.why === 'not listed')
        return 'the page has more parts than were measured'
      const values = seen.elements.flatMap((e) => (e.value === null ? [] : [e.value]))
      if (!values.length) return null
      const failing = values.find((v) =>
        seen.compare === 'at most'
          ? v > seen.px
          : seen.compare === 'at least'
            ? v < seen.px
            : v !== seen.px,
      )
      if (seen.answer === 'missed' && failing !== undefined)
        return `measured ${failing} px, against ${seen.px} px`
      return `measured ${values.length === 1 ? `${values[0]} px` : `${values.length} parts`}, against ${seen.px} px`
    }
    case 'none':
      return null
  }
}

/** Why code would not call a fact it read, in words. */
const SET_ASIDE_WHY: Record<string, string> = {
  convention: 'different ways of counting give different answers',
  differ: 'two ways of reading it give different answers',
  'other notation': 'a value is written in a way it does not read',
  'not listed': 'the page has more parts than were measured',
}

/**
 * How code answered a fact, for the line under it: "Checked by the app: 134
 * words, more than 120." Null where code's answer is not the fact's, or it
 * saw nothing worth saying.
 */
export function codeNote(code: CodeAnswer | undefined): string | null {
  if (!code?.stands) return null
  const said = code.saw
    .map((seen, i) => seenWords(seen, code.tests[i]))
    .filter((line): line is string => line !== null)
  if (code.met === null) {
    const why = SET_ASIDE_WHY[code.why ?? ''] ?? 'it gave no answer'
    return `The app could not settle it: ${said.length ? said.join('; ') : why}.`
  }
  return said.length ? `Checked by the app: ${said.join('; ')}.` : 'Checked by the app.'
}

/** Why nobody can mark a rule or check, and the words that would let them: two short sentences. */
export function unmarkedNote(unmarked: Unmarked): string {
  const why =
    unmarked.why === 'vague'
      ? 'Two careful readers would mark it differently.'
      : unmarked.with
        ? `It cannot hold beside ${quote(unmarked.with)}.`
        : 'It cannot hold beside another rule.'
  return unmarked.fix ? `${why} Try: ${unmarked.fix}` : why
}

/** The note a fact's own answer adds to the line under it; null for one with nothing to say. */
export const answerNote = (verdict: Verdict): string | null =>
  'unmarkable' in verdict ? unmarkedNote(verdict.unmarkable) : codeNote(verdict.code)
