/** A line diff as a listing: added lines tinted green, removed red, folds muted. */
import { type DiffLine, diffLineText } from '../diff.ts'

export function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="diff-lines">
      {lines.map((line) => (
        <span key={line.n} className={line.op}>
          {diffLineText(line)}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
