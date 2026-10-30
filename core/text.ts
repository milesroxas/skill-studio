/** Text helpers shared by packs and the UI. Ported from bench-core.mjs. */

export function readFrontMatter(raw: string): { meta: Record<string, string>; text: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  if (!match) return { meta: {}, text: raw.trim() }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const field = /^(\w+):\s*(.*)$/.exec(line)
    if (field) meta[field[1]] = field[2].trim()
  }
  return { meta, text: raw.slice(match[0].length).trim() }
}

/** The copy a piece is judged on: front matter and HTML comments removed. */
export const copyOf = (raw: string): string =>
  readFrontMatter(raw)
    .text.replace(/<!--[\s\S]*?-->\s*/g, '')
    .trim()

export interface Unit {
  text: string
  items: string[]
  list: boolean
}

/** Prose paragraphs and list blocks, in order; headings, figures and code are left out. */
export function unitsOf(text: string): Unit[] {
  const units: Unit[] = []
  const blocks = text
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
  for (const block of blocks) {
    if (/^#{1,6}\s/.test(block) || /^\[(?:figure|caption)\]/i.test(block)) continue
    if (/^<!--/.test(block) || /^!\[/.test(block)) continue
    const lines = block.split('\n')
    const isList = lines.every((line) => /^\s*(?:[-*+]|\d+[.)])\s/.test(line))
    const items = isList
      ? lines.map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))
      : [block.replace(/\n/g, ' ')]
    units.push({ text: items.join(' ').replace(/^>\s?/, ''), items, list: isList })
  }
  return units
}

export const words = (text: string): string[] => text.match(/[\p{L}\p{N}'’-]+/gu) ?? []

export const titleOf = (text: string): string | null =>
  /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? null

export const slug = (text: string, max = 48): string =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '')

export const round = (value: number | null, places = 2): number | null =>
  value === null || Number.isNaN(value) ? null : Number(value.toFixed(places))
