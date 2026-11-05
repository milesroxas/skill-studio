/** Markdown shown as a document: an agent's answer, or a reply from the assistant. */
import { markdownHtml } from '../markdown.ts'

export function Prose({
  text,
  density = 'reading',
}: {
  text: string
  /** `reading`: a column to read at length. `compact`: a narrow column, with no padding of its own. */
  density?: 'reading' | 'compact'
}) {
  return (
    <div
      className="doc"
      data-density={density}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: every string is escaped in markdown.ts
      dangerouslySetInnerHTML={{ __html: markdownHtml(text) }}
    />
  )
}
