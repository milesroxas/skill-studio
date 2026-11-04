/**
 * The writing pack's code: article shape, claim extraction, evidence
 * retrieval and the fallback lint. Ported from the reference skill's
 * check-voice.mjs and bench.mjs so the measures match it exactly. Pure.
 */
import { round, type Unit } from '@domain/text.ts'

/** Whitespace-delimited tokens, the count the reference's shape bands were drawn with. */
const tokens = (text: string): string[] => text.match(/\S+/g) ?? []

const sentencesOf = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+(?=[A-Z"'“‘(\d[])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[A-Za-z]/.test(sentence))

const median = (values: number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** A list item, table row, heading or quote line is a paragraph of its own. */
const standsAlone = (line: string): boolean => /^\s*(?:[-*+]\s|\d+[.)]\s|\||#{1,6}\s|>)/.test(line)

interface Paragraph {
  text: string
  index: number
}

/** Paragraphs split on blank lines and Markdown block lines, each with its offset. */
function paragraphsOf(text: string): Paragraph[] {
  const found: Paragraph[] = []
  let current: Paragraph | null = null
  let offset = 0
  for (const line of text.split('\n')) {
    const alone = standsAlone(line)
    const blank = !line.trim()
    if (blank || alone || !current) {
      if (current) found.push(current)
      current = blank ? null : { text: line, index: offset }
      if (alone && current) {
        found.push(current)
        current = null
      }
    } else {
      current.text += `\n${line}`
    }
    offset += line.length + 1
  }
  if (current) found.push(current)
  return found
}

/** Headings and prose paragraphs of a Markdown article; the title (#) is not a section heading. */
function articleParts(text: string): { headings: string[]; prose: string[] } {
  const headings: string[] = []
  const prose: string[] = []
  for (const { text: block } of paragraphsOf(text)) {
    const line = block.trim()
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      if (heading[1].length > 1) headings.push(heading[2].replace(/[*_`]/g, '').trim())
    } else if (!standsAlone(line) && !/^!?\[/.test(line)) prose.push(line)
  }
  return { headings, prose }
}

export interface ShapeMeasures {
  measures: Record<string, number | null>
  headings: number
  questionHeadings: number
  longHeadings: number
}

export function shapeOf(text: string): ShapeMeasures {
  const { headings, prose } = articleParts(text)
  const sentenceLengths = prose.flatMap((p) => sentencesOf(p).map((s) => tokens(s).length))
  const paragraphLengths = prose.map((p) => tokens(p).length)
  const single = prose.filter((p) => sentencesOf(p).length <= 1).length
  const measures = {
    sentenceMedian: median(sentenceLengths),
    shortSentenceShare: sentenceLengths.length
      ? sentenceLengths.filter((n) => n <= 8).length / sentenceLengths.length
      : null,
    paragraphMedian: median(paragraphLengths),
    oneLineShare: prose.length ? single / prose.length : null,
  }
  return {
    measures: Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, round(v)])),
    headings: headings.length,
    questionHeadings: headings.filter((h) => h.endsWith('?')).length,
    longHeadings: headings.filter((h) => tokens(h).length > 8).length,
  }
}

export const AI_MENTION =
  /\b(?:AI|agents?|Claude|Codex|Cursor|Copilot|GPT|LLMs?|language models?|coding model|automat\w*)\b/

const STOP = new Set(
  'the a an and or of to in on for with is are was were be been it its this that as at by from my i we our you your not no so than then into over under about after before more most less only one two'.split(
    ' ',
  ),
)

const terms = (text: string): Set<string> =>
  new Set(
    (text.toLowerCase().match(/[a-z0-9][a-z0-9.,%-]*/g) ?? [])
      .map((t) => t.replace(/[.,]+$/, ''))
      .filter((t) => t.length > 1 && !STOP.has(t)),
  )

/** Paragraph and list-item chunks of the evidence texts, headings and comments dropped. */
export function evidenceChunks(texts: string[]): string[] {
  const chunks: string[] = []
  for (const raw of texts) {
    const clean = raw.replace(/<!--[\s\S]*?-->/g, '')
    for (const block of clean.split(/\n\s*\n|\n(?=- )/)) {
      const text = block.replace(/^#+\s.*$/gm, '').trim()
      if (tokens(text).length >= 4) chunks.push(text.replace(/^- /, ''))
    }
  }
  return chunks
}

/** The chunks that share the most terms with the claim: Jev reads best with little unrelated state. */
export function nearestEvidence(claim: string, chunks: string[], limit = 6): string[] {
  const wanted = terms(claim)
  return chunks
    .map((chunk) => {
      const have = terms(chunk)
      let shared = 0
      for (const t of wanted) if (have.has(t)) shared += /\d/.test(t) ? 3 : 1
      return { chunk, shared }
    })
    .sort((a, b) => b.shared - a.shared)
    .slice(0, limit)
    .map(({ chunk }) => chunk)
}

/** Status and scope words: "the judge is live for every visitor" names no number and no one. */
const STATUS_WORDS =
  /\b(?:live|launched|shipped|released|switched (?:on|off)|in production|every|all|always|never|only|deleted|kept|team|users?|customers?|clients?|recruiters?)\b/i

export interface Claim {
  claim: string
  before: string | null
}

/**
 * Sentences that state something checkable: a number, a name mid-sentence, or
 * what I or we did. A [check: ...] marker flags its own sentence and the one
 * before it, so neither counts as a claim.
 */
export function claimsOf(units: Unit[], max = 60): Claim[] {
  const found: Claim[] = []
  const plain = (text: string) =>
    text.replace(/\*\*|__|`/g, '').replace(/\[check:[^\]]*\]/gi, '[check]')
  const flagged = (s: string | undefined) => s?.includes('[check]')
  for (const unit of units)
    for (const item of unit.items) {
      const sentences = sentencesOf(plain(item))
      sentences.forEach((sentence, i) => {
        if (flagged(sentence) || flagged(sentences[i + 1])) return
        const named = /\s[A-Z][\w&.-]+/.test(sentence.replace(/^\W*\w+/, ''))
        const acted =
          /\b(?:I|we|We)\s+(?:\w+ly\s+)?\w+(?:ed|t|lt|de|ote|an|ew|ook|ound|ent|ept|ave)\b/.test(
            sentence,
          )
        const status = STATUS_WORDS.test(sentence)
        if (/\d/.test(sentence) || named || acted || status)
          found.push({ claim: sentence, before: sentences[i - 1] ?? null })
      })
    }
  return found.slice(0, max)
}

export interface LintFinding {
  severity: 'error' | 'warning' | 'info'
  rule: string
  message: string
  excerpt?: string
}

const EM_DASH = String.fromCharCode(0x2014)

/** Positions of every em dash that is not a numeric range. */
function emDashesIn(copy: string): number[] {
  const found: number[] = []
  for (let i = copy.indexOf(EM_DASH); i !== -1; i = copy.indexOf(EM_DASH, i + 1)) {
    const before = /[\d%$€£K]\s?$/.test(copy.slice(Math.max(0, i - 2), i))
    const after = /^\s?[\d$€£]/.test(copy.slice(i + 1, i + 3))
    if (!(before && after)) found.push(i)
  }
  return found
}

const excerptOf = (text: string, index: number, length: number): string => {
  const start = Math.max(0, index - 30)
  const end = Math.min(text.length, index + length + 30)
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${body}${end < text.length ? '…' : ''}`
}

/** The lint for a skill with no lint command: em dashes, exclamation marks, emoji and the case's word range. */
export function fallbackLint(text: string, range: [number, number] | null): LintFinding[] {
  const copy = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
  const findings: LintFinding[] = []
  for (const index of emDashesIn(copy))
    findings.push({
      severity: 'error',
      rule: 'em-dash',
      message: 'Em dash. Recast with a comma, a colon, parentheses or a period.',
      excerpt: excerptOf(text, index, 1),
    })
  for (const match of copy.matchAll(/!(?![![])/g))
    findings.push({
      severity: 'warning',
      rule: 'exclamation',
      message: 'Exclamation mark.',
      excerpt: excerptOf(text, match.index, 1),
    })
  if (/\p{Extended_Pictographic}/u.test(copy))
    findings.push({ severity: 'warning', rule: 'emoji', message: 'Emoji.' })
  const count = tokens(copy).length
  if (range && (count < range[0] || count > range[1]))
    findings.push({
      severity: 'warning',
      rule: 'length',
      message: `${count} words; the case asks ${range[0]} to ${range[1]}.`,
    })
  return findings
}
