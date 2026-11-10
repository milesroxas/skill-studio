/**
 * Two outputs of one case read as one text: what only the earlier holds is
 * struck through, what only the later holds is marked. Two outputs that differ
 * over too many words to set against each other one by one are compared line
 * by line instead, and the card says so.
 */
import { copyOf } from '@domain/text.ts'
import { api } from '../api.ts'
import { type DiffLine, lineDiff, wordDiffHtml } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { type Output, primaryOf, versionName } from '../model.ts'
import { DiffLines } from './DiffLines.tsx'
import { Loading, ReadFailed } from './layout.tsx'
import { OutputCard, OutputCardHead, Slot } from './OutputCard.tsx'
import { Hint } from './text.tsx'

type Compared = { kind: 'words'; html: string } | { kind: 'lines'; lines: DiffLine[] }

export function DiffCard({ a, b }: { a: Output; b: Output }) {
  const pa = primaryOf(a)
  const pb = primaryOf(b)
  const textual = pa && pb && pa.kind !== 'image' && pb.kind !== 'image'
  const pair = `${a.key}|${b.key}`
  const read = useFetch(async (): Promise<{ pair: string; diff: Compared } | null> => {
    if (!textual) return null
    const [x, y] = await Promise.all([
      api.artifactText(a.run.name, a.sample.name, pa.file),
      api.artifactText(b.run.name, b.sample.name, pb.file),
    ])
    const before = copyOf(x)
    const after = copyOf(y)
    const html = wordDiffHtml(before, after)
    return {
      pair,
      diff:
        html === null ? { kind: 'lines', lines: lineDiff(before, after) } : { kind: 'words', html },
    }
  }, [pair])
  // The last pair's diff stays in hand while the next is read: never show it under the new names.
  const diff = read.data?.pair === pair ? read.data.diff : null
  return (
    <OutputCard>
      <OutputCardHead
        slot={<Slot>Diff</Slot>}
        title={`${versionName(a.run)} to ${versionName(b.run)}`}
        meta={
          diff?.kind === 'lines'
            ? 'Lines only in A are marked −. Lines only in B are marked +.'
            : 'Text only in A is struck through. Text only in B is marked.'
        }
      />
      {!textual ? (
        <Hint inset>Word diff needs a text output on both sides.</Hint>
      ) : diff === null ? (
        read.error ? (
          <ReadFailed
            size="compact"
            title="Could not read the outputs"
            retrying={read.loading}
            onRetry={read.reload}
          >
            {read.error}
          </ReadFailed>
        ) : (
          <Loading />
        )
      ) : diff.kind === 'words' ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: diff output is escaped
        <div className="diff" dangerouslySetInnerHTML={{ __html: diff.html }} />
      ) : (
        <>
          <Hint inset>
            These outputs are too long to compare word by word, so they are compared line by line.
          </Hint>
          {diff.lines.length ? (
            <div className="px-4 pb-4">
              <DiffLines lines={diff.lines} />
            </div>
          ) : null}
        </>
      )}
    </OutputCard>
  )
}
