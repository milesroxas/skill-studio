/**
 * A line diff as a listing: added lines tinted green, removed red, unchanged
 * lines and folds muted. The + or - is its own span, so it can take the
 * verdict color while the line's text stays in text color.
 */
import { type DiffLine, diffLineText } from '../diff.ts'

/** The + or - and the space after it: the first two characters of `diffLineText`. */
const SIGN = 2

export function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="diff-lines">
      {lines.map((line) => {
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
