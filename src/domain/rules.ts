import { stripFrontMatter } from './text.ts'

export interface Rule {
  id: string
  text: string
  /** The nearest heading above the bullet, so a violation names where to edit. */
  section: string
}

const strip = (markdown: string): string =>
  markdown
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

/** A top-level bullet the judge does not check, and why. */
export interface SkippedBullet {
  /** 1-based line in the file, front matter included. */
  line: number
  /** `short`: under four words. `link`: nothing but a link. */
  reason: 'short' | 'link'
}

/** The lines one rule takes: its bullet and the indented lines that belong to it. 1-based, inclusive. */
export interface RuleSpan {
  from: number
  to: number
}

/** The judge's reading of a SKILL.md: its rules, the lines each takes, and the bullets it skipped. */
export interface RuleScan {
  rules: Rule[]
  /** For each rule, the lines it takes, front matter included. */
  spans: RuleSpan[]
  skipped: SkippedBullet[]
}

/** Words in a rule's text, by the same count the judge uses. */
const WORDS_MIN = 4
const LINK_ONLY = /^\[[^\]]+\]\([^)]*\)$/

/**
 * Top-level `-` and `*` bullets outside code blocks and outside the front
 * matter, each tagged with the section it sits under. Indented lines belong to
 * the bullet above: a nested bullet is a clause of its parent rule, joined
 * after a `;` unless the text before it already ends in punctuation. Bullets
 * that are only a link or shorter than four words are skipped, and reported;
 * a `rules` list in bench.json replaces all of this.
 */
export function scanRules(skillMd: string): RuleScan {
  const body = stripFrontMatter(skillMd)
  // Lines the front matter took, so each line number names the line in the editor.
  const offset =
    (skillMd.length - body.length ? skillMd.slice(0, skillMd.length - body.length) : '').split('\n')
      .length - 1
  const rules: Rule[] = []
  const spans: RuleSpan[] = []
  const skipped: SkippedBullet[] = []
  let section = 'SKILL.md'
  let inCode = false
  let pending: { text: string; line: number; last: number } | null = null
  const flush = () => {
    if (pending === null) return
    const { line, last } = pending
    // Read the link before `strip` turns it into its label.
    const link = LINK_ONLY.test(pending.text.trim())
    const text = strip(pending.text)
    pending = null
    if (link) return void skipped.push({ line, reason: 'link' })
    if (text.split(' ').length < WORDS_MIN) return void skipped.push({ line, reason: 'short' })
    rules.push({ id: `r${rules.length + 1}`, text, section })
    spans.push({ from: line, to: last })
  }
  body.split('\n').forEach((line, i) => {
    const number = offset + i + 1
    if (/^\s*```/.test(line)) {
      flush()
      inCode = !inCode
      return
    }
    if (inCode) return
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      section = heading[1].trim()
      return
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line)
    if (bullet) {
      flush()
      pending = { text: bullet[1], line: number, last: number }
      return
    }
    if (pending !== null && /^\s{2,}\S/.test(line)) {
      const nested = /^\s+(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line)
      if (nested)
        pending.text += `${/[.,;:!?]$/.test(pending.text.trim()) ? '' : ';'} ${nested[1].trim()}`
      else pending.text += ` ${line.trim()}`
      pending.last = number
      return
    }
    flush()
  })
  flush()
  return { rules, spans, skipped }
}

/** The rules alone, for the judge and the bench. */
export const rulesFromSkill = (skillMd: string): Rule[] => scanRules(skillMd).rules

/** Rules from an explicit list, as `bench.json` `rules` gives them. */
export const rulesFromList = (list: string[]): Rule[] =>
  list.map((text, i) => ({ id: `r${i + 1}`, text: text.trim(), section: 'bench.json rules' }))
