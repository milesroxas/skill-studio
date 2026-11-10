import {
  closesFence,
  type Fence,
  fenceOf,
  LIST_MARK,
  normalizeNewlines,
  stripFrontMatter,
} from './text.ts'

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

/** One top-level bullet as it stands in the text: its own line and the indented lines under it. */
export interface Bullet {
  /** Index of its first and last line among the lines scanned, from 0. */
  from: number
  to: number
  /** Its lines as written, the marker and the indentation kept. */
  lines: string[]
  /** The nearest heading above it; null before any heading. */
  section: string | null
}

const BULLET = /^[-*]\s+(.+)$/
/** A thematic break, `* * *` or `- - -`: it starts like a bullet and is none. */
const THEMATIC_BREAK = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/
/** A line that belongs to the bullet above: indented by a tab, or by two spaces or more. */
const CONTINUES = /^(?:\t|\s{2,})\s*\S/
const NESTED = new RegExp(`^\\s+${LIST_MARK}\\s+(.+)$`)

/**
 * Every top-level `-` and `*` bullet of `lines` outside code blocks, with the
 * indented lines that belong to it. The one reading of what a bullet is: the
 * judge's rules and the editor's checks both start here. A fence closes only
 * on its own character, at least as long, so a ``` inside a ~~~ block is text.
 */
export function bulletsOf(lines: readonly string[]): Bullet[] {
  const bullets: Bullet[] = []
  let section: string | null = null
  let fence: Fence | null = null
  let open: Bullet | null = null
  lines.forEach((line, i) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null
      return
    }
    const opened = fenceOf(line)
    if (opened) {
      open = null
      fence = opened
      return
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      open = null
      section = heading[1].trim()
      return
    }
    if (BULLET.test(line) && !THEMATIC_BREAK.test(line)) {
      open = { from: i, to: i, lines: [line], section }
      bullets.push(open)
      return
    }
    if (open && CONTINUES.test(line)) {
      open.lines.push(line)
      open.to = i
      return
    }
    open = null
  })
  return bullets
}

/** A bullet as one line of text: a nested bullet joins after a `;` unless the text before it already ends in punctuation. */
function bulletText(bullet: Bullet): string {
  let text = BULLET.exec(bullet.lines[0])?.[1] ?? ''
  for (const line of bullet.lines.slice(1)) {
    const nested = NESTED.exec(line)
    if (nested) text += `${/[.,;:!?]$/.test(text.trim()) ? '' : ';'} ${nested[1].trim()}`
    else text += ` ${line.trim()}`
  }
  return text
}

/**
 * Top-level `-` and `*` bullets outside code blocks and outside the front
 * matter, each tagged with the section it sits under. Indented lines belong to
 * the bullet above: a nested bullet is a clause of its parent rule, joined
 * after a `;` unless the text before it already ends in punctuation. Bullets
 * that are only a link or shorter than four words are skipped, and reported;
 * a `rules` list in bench.json replaces all of this.
 */
export function scanRules(skillMd: string): RuleScan {
  // Measured on the text as `stripFrontMatter` reads it, so a `\r` it drops does not shift a line.
  const source = normalizeNewlines(skillMd)
  const body = stripFrontMatter(source)
  // Lines the front matter took, so each line number names the line in the editor.
  const offset = source.slice(0, source.length - body.length).split('\n').length - 1
  const rules: Rule[] = []
  const spans: RuleSpan[] = []
  const skipped: SkippedBullet[] = []
  for (const bullet of bulletsOf(body.split('\n'))) {
    const line = offset + bullet.from + 1
    const raw = bulletText(bullet)
    // Read the link before `strip` turns it into its label.
    if (LINK_ONLY.test(raw.trim())) {
      skipped.push({ line, reason: 'link' })
      continue
    }
    const text = strip(raw)
    if (text.split(' ').length < WORDS_MIN) {
      skipped.push({ line, reason: 'short' })
      continue
    }
    rules.push({ id: `r${rules.length + 1}`, text, section: bullet.section ?? 'SKILL.md' })
    spans.push({ from: line, to: offset + bullet.to + 1 })
  }
  return { rules, spans, skipped }
}

/** The rules alone, for the judge and the bench. */
export const rulesFromSkill = (skillMd: string): Rule[] => scanRules(skillMd).rules

/** Rules from an explicit list, as `bench.json` `rules` gives them: each once, a blank one left out. */
export const rulesFromList = (list: string[]): Rule[] =>
  [...new Set(list.map((text) => text.trim()).filter(Boolean))].map((text, i) => ({
    id: `r${i + 1}`,
    text,
    section: 'bench.json rules',
  }))
