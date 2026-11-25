/**
 * A line diff as a listing: added lines tinted green, removed red, unchanged
 * lines and folds muted. The + or - is its own span, so it can take the
 * verdict color while the line's text stays in text color.
 */
import { type DiffLine, diffLineText, drawnLines } from '../diff.ts'

/** The + or - and the space after it: the first two characters of `diffLineText`. */
const SIGN = 2

/**
 * A word diff as running text: removed words struck through, added words
 * marked. `card` fills an output's card; `row` is one rule in a proposed
 * change's row. `html` comes escaped from `wordDiffHtml`. `arrive`: just
 * written, so each struck word's line is drawn across it, and the added words
 * are written in after it, so old reads before new.
 */
export function WordDiff({
  html,
  size = 'card',
  arrive = false,
}: {
  html: string
  size?: 'card' | 'row'
  arrive?: boolean
}) {
  return (
    <div
      className="diff"
      data-size={size}
      data-arrive={arrive || undefined}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: diff output is escaped
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** `arrive`: just written, so the added lines are written in after the rest are read. */
export function DiffLines({ lines, arrive = false }: { lines: DiffLine[]; arrive?: boolean }) {
  return (
    <pre className="diff-lines" data-arrive={arrive || undefined}>
      {drawnLines(lines).map((line) => {
        const text = diffLineText(line)
        return (
          <span key={line.n} className={line.op}>
            <span className="sign">{text.slice(0, SIGN)}</span>
            {text.slice(SIGN)}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}
