/**
 * One file of a diff, folded to a line that says how much changed: a file of
 * the Versions comparison, and a file change the assistant proposes.
 */
import { changeSummary, type DiffLine } from '../diff.ts'
import { DiffLines } from './DiffLines.tsx'
import { Disclosure } from './Disclosure.tsx'
import { Text } from './text.tsx'

export function FileDiff({
  file,
  before,
  after,
  lines,
  defaultOpen,
}: {
  file: string
  before: string
  after: string
  /** `lineDiff(before, after)`, worked out by the caller, which often needs it too. */
  lines: DiffLine[]
  defaultOpen?: boolean
}) {
  return (
    <Disclosure
      variant="card"
      defaultOpen={defaultOpen}
      summary={
        <>
          <Text font="mono">{file}</Text>{' '}
          <Text tone="muted" size="xs" tabular>
            {changeSummary(before, after, lines)}
          </Text>
        </>
      }
    >
      {lines.length ? <DiffLines lines={lines} /> : <pre className="diff-lines">{after}</pre>}
    </Disclosure>
  )
}
