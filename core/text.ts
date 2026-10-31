/** Text helpers shared by packs and the UI. Ported from bench-core.mjs. */
import { parse as parseYaml } from 'yaml'

/** Unix line endings, no byte-order mark: every parser below splits on `\n`. */
export const normalizeNewlines = (raw: string): string =>
  raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

const FRONT_MATTER = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/

/** The front matter block of a Markdown file, delimiters included; empty when it has none. */
export const frontMatterBlock = (raw: string): string =>
  FRONT_MATTER.exec(normalizeNewlines(raw))?.[0] ?? ''

/** The body of a Markdown file, without its front matter block. */
export const stripFrontMatter = (raw: string): string =>
  normalizeNewlines(raw).replace(FRONT_MATTER, '')

/**
 * Split YAML front matter from the body. `meta` is the parsed mapping; it is
 * empty when there is no block, or when the block is not a valid YAML mapping.
 */
export function readFrontMatter(raw: string): { meta: Record<string, unknown>; text: string } {
  const source = normalizeNewlines(raw)
  const match = FRONT_MATTER.exec(source)
  if (!match) return { meta: {}, text: source.trim() }
  let parsed: unknown = null
  try {
    parsed = parseYaml(match[1] ?? '')
  } catch {
    // Invalid YAML carries no fields we can trust; the block is still not body text.
  }
  const meta =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  return { meta, text: source.slice(match[0].length).trim() }
}

/** A front matter field as text: strings, numbers and booleans; null for anything else. */
export const metaText = (meta: Record<string, unknown>, key: string): string | null => {
  const value = meta[key]
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : null
}

/** A front matter field as a list: a YAML sequence, or a comma-separated string. */
export const metaList = (meta: Record<string, unknown>, key: string): string[] | null => {
  const value = meta[key]
  if (Array.isArray(value)) return value.map(String)
  const text = metaText(meta, key)
  return text === null
    ? null
    : text
        .split(/,\s*/)
        .map((item) => item.trim())
        .filter(Boolean)
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
  const blocks = normalizeNewlines(text)
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

/** Runs of letters and digits; an apostrophe or hyphen joins two runs but is never a word alone. */
export const words = (text: string): string[] =>
  text.match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu) ?? []

export const titleOf = (text: string): string | null =>
  /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? null

export const slug = (text: string, max = 48): string =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '')

/** Skill names and case ids: what `slug` produces, so either can be typed or derived. */
export const isSlug = (text: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)
export const SLUG_RULE = 'Use lowercase letters, digits and single dashes, like release-notes.'

export const round = (value: number | null, places = 2): number | null =>
  value === null || Number.isNaN(value) ? null : Number(value.toFixed(places))
