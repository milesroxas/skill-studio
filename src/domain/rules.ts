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

/** The section of a rule that stands above every heading of its file. */
const NO_HEADING = 'SKILL.md'
/** The section of a rule that `bench.json` lists. */
const LISTED = 'bench.json rules'

/** The heading a rule stands under in SKILL.md; null for one above every heading, and for one `bench.json` lists. */
export const headingOf = (rule: Rule): string | null =>
  rule.section === NO_HEADING || rule.section === LISTED ? null : rule.section

/** Markdown's own marks taken out of a line, so it reads as the sentence it is. */
export const plain = (markdown: string): string =>
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
  /** `short`: under four words. `link`: nothing but a link. `repeat`: says what a rule above it says. */
  reason: 'short' | 'link' | 'repeat'
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

/** A bullet at the margin, which Markdown takes to reach three spaces in: `-` or `*`, then its text. */
const BULLET = /^ {0,3}[-*]\s+(.+)$/
/** A thematic break, `* * *` or `- - -`: it starts like a bullet and is none. */
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
/** Any list item, a numbered step and a `+` item among them, with what leads it. */
const ITEM = new RegExp(`^ {0,3}${LIST_MARK}\\s`)
const NESTED = new RegExp(`^\\s+${LIST_MARK}\\s+(.+)$`)
/** How far past its own indentation a line must stand to belong to the list item above it. */
const ITEM_DEPTH = 2

/** How far in a line starts, in columns: a tab runs to the next fourth one, as Markdown counts it. */
function indentOf(line: string): number {
  let column = 0
  for (const char of line) {
    if (char === ' ') column += 1
    else if (char === '\t') column += 4 - (column % 4)
    else break
  }
  return column
}

/**
 * Every top-level `-` and `*` bullet of `lines` outside code blocks and HTML
 * comments, with the indented lines that belong to it. The one reading of what
 * a bullet is: the judge's rules and the editor's checks both start here.
 *
 * A bullet is top-level at the margin or up to three spaces in, unless it
 * stands two spaces or more past the list item above it: then it is that
 * item's own, a clause of the bullet it follows, and nothing at all under a
 * numbered step or once a blank line has closed the bullet. A fence closes
 * only on its own character, at least as long, so a ``` inside a ~~~ block is
 * text. A comment opens on a line that starts with `<!--` and runs to the
 * line that holds its `-->`; nothing in it is read.
 */
export function bulletsOf(lines: readonly string[]): Bullet[] {
  const bullets: Bullet[] = []
  let section: string | null = null
  let fence: Fence | null = null
  let comment = false
  let open: Bullet | null = null
  /** The indentation from which a line still belongs to the last list item read; null outside a list. */
  let inside: number | null = null
  lines.forEach((line, i) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null
      return
    }
    if (comment) {
      comment = !line.includes('-->')
      return
    }
    // A blank line ends the bullet's text. The list item it stands in goes on past it.
    if (!line.trim()) {
      open = null
      return
    }
    const indent = indentOf(line)
    const nested = inside !== null && indent >= inside
    if (!nested) inside = null
    const opened = fenceOf(line)
    if (opened) {
      open = null
      fence = opened
      return
    }
    // A comment is not the skill's text: it says nothing, in a bullet or between two.
    if (line.trimStart().startsWith('<!--')) {
      if (!nested) open = null
      comment = !line.slice(line.indexOf('<!--') + 4).includes('-->')
      return
    }
    if (nested) {
      if (open) {
        open.lines.push(line)
        open.to = i
      }
      return
    }
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      open = null
      section = heading[1].trim()
      return
    }
    if (THEMATIC_BREAK.test(line)) {
      open = null
      return
    }
    if (ITEM.test(line)) inside = indent + ITEM_DEPTH
    open = BULLET.test(line) ? { from: i, to: i, lines: [line], section } : null
    if (open) bullets.push(open)
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
 * Top-level `-` and `*` bullets outside code blocks, comments and the front
 * matter, each tagged with the section it sits under. Indented lines belong to
 * the bullet above: a nested bullet is a clause of its parent rule, joined
 * after a `;` unless the text before it already ends in punctuation. Bullets
 * that are only a link, shorter than four words, or the same as a rule above
 * are skipped, and reported: a rule written twice counts once, as in a
 * `rules` list in bench.json, which replaces all of this.
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
    // Read the link before `plain` turns it into its label.
    if (LINK_ONLY.test(raw.trim())) {
      skipped.push({ line, reason: 'link' })
      continue
    }
    const text = plain(raw)
    if (text.split(' ').length < WORDS_MIN) {
      skipped.push({ line, reason: 'short' })
      continue
    }
    if (rules.some((rule) => rule.text === text)) {
      skipped.push({ line, reason: 'repeat' })
      continue
    }
    rules.push({ id: `r${rules.length + 1}`, text, section: bullet.section ?? NO_HEADING })
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
    section: LISTED,
  }))
