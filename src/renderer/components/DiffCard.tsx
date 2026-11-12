/**
 * Two outputs of one case read as one text: what only the earlier holds is
 * struck through, what only the later holds is marked. Two outputs that differ
 * over too many words to set against each other one by one are compared line
 * by line instead, and the card says so.
 */
import { copyOf } from '@domain/text.ts'
import { api } from '../api.ts'
import { type Compared, compareTexts, diffShown } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { type Output, primaryOf, runInSentence } from '../model.ts'
import { DiffLines } from './DiffLines.tsx'
import { Loading, ReadFailed } from './layout.tsx'
import { OutputCard, OutputCardHead, Slot } from './OutputCard.tsx'
import { Hint } from './text.tsx'

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
    return { pair, diff: compareTexts(copyOf(x), copyOf(y)) }
  }, [pair])
  // The last pair's diff stays in hand while the next is read: never show it under the new names.
  const shown = diffShown(
    Boolean(textual),
    read.data?.pair === pair ? read.data.diff : null,
    read.error,
  )
  return (
    <OutputCard>
      <OutputCardHead
        slot={<Slot>Diff</Slot>}
        title={`${runInSentence(a.run, { start: true })} to ${runInSentence(b.run)}`}
        meta={
          shown.kind === 'lines'
            ? 'Lines only in A are marked −. Lines only in B are marked +.'
            : 'Text only in A is struck through. Text only in B is marked.'
        }
      />
      {shown.kind === 'not-text' && <Hint inset>Word diff needs a text output on both sides.</Hint>}
      {shown.kind === 'failed' && (
        <ReadFailed
          size="compact"
          title="Could not read the outputs"
          retrying={read.loading}
          onRetry={read.reload}
        >
          {shown.error}
        </ReadFailed>
      )}
      {shown.kind === 'loading' && <Loading />}
      {shown.kind === 'words' && (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: diff output is escaped
        <div className="diff" dangerouslySetInnerHTML={{ __html: shown.html }} />
      )}
      {shown.kind === 'lines' && (
        <>
          <Hint inset>
            These outputs are too long to compare word by word, so they are compared line by line.
          </Hint>
          {shown.lines.length ? (
            <div className="px-4 pb-4">
              <DiffLines lines={shown.lines} />
            </div>
          ) : null}
        </>
      )}
    </OutputCard>
  )
}
