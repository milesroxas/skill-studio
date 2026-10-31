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

/**
 * Top-level `-` and `*` bullets outside code blocks and outside the front
 * matter, each tagged with the section it sits under. Indented lines belong to
 * the bullet above: a nested bullet is a clause of its parent rule, joined
 * after a `;` unless the text before it already ends in punctuation. Bullets
 * that are only a link or shorter than four words are skipped; a `rules` list
 * in bench.json replaces all of this.
 */
export function rulesFromSkill(skillMd: string): Rule[] {
  const body = stripFrontMatter(skillMd)
  const rules: Rule[] = []
  let section = 'SKILL.md'
  let inCode = false
  let pending: string | null = null
  const flush = () => {
    if (pending === null) return
    const text = strip(pending)
    pending = null
    if (/^\[[^\]]+\]\([^)]*\)$/.test(text)) return
    if (text.split(' ').length < 4) return
    rules.push({ id: `r${rules.length + 1}`, text, section })
  }
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) {
      flush()
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const heading = /^#{1,6}\s+(.+)$/.exec(line)
    if (heading) {
      flush()
      section = heading[1].trim()
      continue
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line)
    if (bullet) {
      flush()
      pending = bullet[1]
      continue
    }
    if (pending !== null && /^\s{2,}\S/.test(line)) {
      const nested = /^\s+(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line)
      if (nested) pending += `${/[.,;:!?]$/.test(pending.trim()) ? '' : ';'} ${nested[1].trim()}`
      else pending += ` ${line.trim()}`
      continue
    }
    flush()
  }
  flush()
  return rules
}

/** Rules from an explicit list, as `bench.json` `rules` gives them. */
export const rulesFromList = (list: string[]): Rule[] =>
  list.map((text, i) => ({ id: `r${i + 1}`, text: text.trim(), section: 'bench.json rules' }))
