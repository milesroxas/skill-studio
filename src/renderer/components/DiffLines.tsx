/** A line diff as a listing: added lines tinted green, removed red, folds muted. */
import type { DiffLine } from '../diff.ts'

export function DiffLines({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="diff-lines">
      {lines.map((line) => (
        <span key={line.n} className={line.op}>
          {line.op === 'fold'
            ? '   …'
            : `${line.op === 'ins' ? '+ ' : line.op === 'del' ? '- ' : '  '}${line.text}`}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}
