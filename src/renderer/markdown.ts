/** A small Markdown renderer to escaped HTML: headings, lists, quotes, code, inline marks. */

export const esc = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

function inline(text: string): string {
  return esc(text)
    .replace(/\[check:([^\]]*)\]/gi, '<span class="check">check:$1</span>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    )
}

/** A paragraph that is one image and nothing else: `![alt](path)`. */
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/

export interface MarkdownOptions {
  /**
   * Images the document may show, by the path it writes, each mapped to the
   * URL to load. A path not listed here stays text, so a document from an
   * agent can never make the app fetch a picture.
   */
  images?: Readonly<Record<string, string>>
}

function block(raw: string, { images }: MarkdownOptions): string {
  const lines = raw.split('\n')
  const heading = /^(#{1,6})\s+(.*)$/.exec(raw)
  if (heading) {
    const level = Math.min(heading[1].length, 4)
    return `<h${level}>${inline(heading[2])}</h${level}>`
  }
  if (lines.every((line) => /^\s*(?:[-*+]|\d+[.)])\s/.test(line))) {
    const tag = /^\s*\d/.test(lines[0]) ? 'ol' : 'ul'
    const items = lines.map(
      (line) => `<li>${inline(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))}</li>`,
    )
    return `<${tag}>${items.join('')}</${tag}>`
  }
  if (lines.every((line) => line.startsWith('>')))
    return `<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))}</blockquote>`
  if (lines.every((line) => line.startsWith('|'))) {
    const rows = lines.filter((line) => !/^\|[\s:|-]+\|$/.test(line))
    return `<table>${rows
      .map((line, i) => {
        const cells = line.replace(/^\||\|$/g, '').split('|')
        const tag = i === 0 ? 'th' : 'td'
        return `<tr>${cells.map((c) => `<${tag}>${inline(c.trim())}</${tag}>`).join('')}</tr>`
      })
      .join('')}</table>`
  }
  const image = IMAGE.exec(raw)
  const src = image && images?.[image[2]]
  if (image && src) {
    // The file type tells the page which pictures share one shape, so it can hold their space.
    const type = /\.(\w+)$/.exec(image[2])?.[1] ?? ''
    return `<figure data-type="${esc(type)}"><img src="${esc(src)}" alt="${esc(image[1])}" decoding="async"></figure>`
  }
  if (/^!\[/.test(raw)) return `<div class="aside">${inline(raw)}</div>`
  return `<p>${inline(raw.replace(/\n/g, ' '))}</p>`
}

/** The document as HTML, each prose unit wrapped so a note or a mark can attach to it. */
export function markdownHtml(text: string, options: MarkdownOptions = {}): string {
  const parts: string[] = []
  for (const segment of text.split(/(```[\s\S]*?```)/)) {
    if (segment.startsWith('```')) {
      parts.push(`<pre>${esc(segment.replace(/^```\w*\n?|```$/g, ''))}</pre>`)
      continue
    }
    for (const raw of segment.split(/\n\s*\n/)) {
      const trimmed = raw.trim()
      if (!trimmed) continue
      parts.push(block(trimmed, options))
    }
  }
  return parts.join('')
}
