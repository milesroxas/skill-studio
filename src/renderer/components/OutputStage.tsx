/**
 * The one place a comparison's outputs are shown, in every view. The stage
 * stands under the band whatever the view is, and the view only says how the
 * pair stands on it: one at a time, each on a stage of its own side by side,
 * or as the diff of the file in view. So a change of view moves nothing but
 * what is on the stage.
 *
 * The file in view names itself in one quiet line over the stage, which is
 * also where it is changed, for both outputs at once, with the transcript as
 * the list's last choice. Read one at a time, the two heads in the band say
 * which output is on the stage (`flipOf`), so nothing here repeats A and B.
 */
import { comboText } from '@domain/shortcuts.ts'
import { copyOf } from '@domain/text.ts'
import { Fragment, type ReactNode, useCallback, useState } from 'react'
import { api } from '../api.ts'
import { type Compared, compareTexts, diffShown } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { isMac } from '../keys.ts'
import { drawnOf, type Output, primaryOf, runTitle } from '../model.ts'
import { useShortcut, useShortcutKeys } from '../shortcuts.ts'
import type { PageSize } from '../stage.ts'
import { OpenFullSize, PageSizeSelect } from './Artifact.tsx'
import { DiffLines, WordDiff } from './DiffLines.tsx'
import { Loading, ReadFailed } from './layout.tsx'
import type { HeadFlip } from './PairBand.tsx'
import { SelectBox } from './SelectBox.tsx'
import {
  Stage,
  StageHalf,
  type StageLayer,
  StagePair,
  StageSheet,
  type Side as StageSide,
} from './Stage.tsx'
import { TranscriptList } from './TranscriptList.tsx'
import { Hint } from './text.tsx'

/** How a pair stands on the stage. */
export type View = 'flip' | 'side' | 'diff'

/** The choice that reads an output's steps in place of one of its files. */
const STEPS = ':transcript'

const LETTER = { a: 'A', b: 'B' } as const

type Sided = readonly [StageSide, Output]

/** A press of A or B in a page means nothing where both outputs are in view. */
const stay = () => {}

/**
 * The stage for a pair, and what the band needs to work it. `side` is the
 * output in view while they are read one at a time, so the page can show that
 * output's list alone; null in the views that show both.
 */
export function useOutputStage({
  a,
  b,
  view,
  drawnFirst,
  page,
  writing,
}: {
  a: Output | null
  b: Output | null
  view: View
  /**
   * The case opens on a page or a picture: that file stands for each output
   * until another is picked. Otherwise the file that is graded does.
   */
  drawnFirst: boolean
  /** The size a page is drawn at: one for the case. */
  page: PageSize
  /** Which sides are still being written: they wait on the stage, with no file to pick or open. */
  writing: { a: boolean; b: boolean }
}): {
  stage: ReactNode
  side: StageSide | null
  flipOf: (side: StageSide) => HeadFlip | null
} {
  const pairKey = `${a?.key}|${b?.key}`
  const opens: StageSide = b ? 'b' : 'a'
  /**
   * The side in view and the file picked, for the pair they were picked on: a new pair starts
   * over, on B and on the file that stands for each output.
   */
  const [kept, setKept] = useState<{ pair: string; shown: StageSide; picked: string | null }>({
    pair: pairKey,
    shown: opens,
    picked: null,
  })
  const { shown, picked } = kept.pair === pairKey ? kept : { shown: opens, picked: null }
  const setShown = useCallback(
    (to: StageSide) =>
      setKept((was) => ({
        pair: pairKey,
        shown: to,
        picked: was.pair === pairKey ? was.picked : null,
      })),
    [pairKey],
  )
  const setPicked = (to: string) =>
    setKept((was) => ({
      pair: pairKey,
      shown: was.pair === pairKey ? was.shown : opens,
      picked: to,
    }))

  const sides = (
    [
      ['a', a],
      ['b', b],
    ] as const
  ).filter((entry): entry is Sided => entry[1] !== null)
  const inView = sides.find(([s]) => s === shown) ?? sides[0] ?? null
  const flipping = a !== null && b !== null && view === 'flip'

  // A and B (their shortcuts) flip the stage, unless the key is being typed somewhere.
  useShortcut('results.a', () => setShown('a'), flipping)
  useShortcut('results.b', () => setShown('b'), flipping)
  const flipKeys = { a: useShortcutKeys('results.a'), b: useShortcutKeys('results.b') }

  if (!inView) return { stage: null, side: null, flipOf: () => null }
  const [side, output] = inView

  const steps = picked === STEPS
  const standsFor = (o: Output) =>
    drawnFirst ? (drawnOf(o) ?? primaryOf(o)) : (primaryOf(o) ?? drawnOf(o))
  const fileOf = ([s, o]: Sided) =>
    steps || writing[s]
      ? null
      : picked === null
        ? standsFor(o)
        : (o.sample.artifacts.find((f) => f.file === picked) ?? null)
  const ready = sides.filter(([s]) => !writing[s])
  const files = [
    ...new Set(
      ready.flatMap(([, o]) =>
        o.sample.artifacts.filter((f) => f.kind !== 'transcript').map((f) => f.file),
      ),
    ),
  ]
  // A list, not segments: an agent writes as many files as it likes.
  const reads = [
    ...files.map((f) => ({ value: f, label: f.replace(/^outputs\//, '') })),
    ...(ready.some(([, o]) => o.sample.hasTranscript)
      ? [{ value: STEPS, label: 'Transcript' }]
      : []),
  ]

  const layerOf = (entry: Sided): StageLayer => {
    const [s, o] = entry
    return {
      side: s,
      run: o.run.name,
      sample: o.sample.name,
      artifact: fileOf(entry),
      name: `${LETTER[s]}, ${runTitle(o.run)}`,
      writing: writing[s],
      reading: !steps ? undefined : o.sample.hasTranscript ? (
        <TranscriptList
          run={o.run.name}
          sample={o.sample.name}
          root={o.sample.path}
          meta={o.run.meta?.samples.find((m) => m.dir === o.sample.name) ?? null}
        />
      ) : (
        <Hint inset>This output kept no transcript.</Hint>
      ),
    }
  }
  /** The line under a stage: the size a page is drawn at, and the way to open the file full size. */
  const lineOf = (entry: Sided) => {
    const f = fileOf(entry)
    return {
      width: page.width,
      height: page.height,
      lead: f?.kind === 'html' ? <PageSizeSelect page={page} /> : null,
      action: f ? (
        <OpenFullSize run={entry[1].run.name} sample={entry[1].sample.name} file={f.file} />
      ) : null,
    }
  }

  const flipOf = (s: StageSide): HeadFlip | null => {
    const o = s === 'a' ? a : b
    return flipping && o
      ? {
          on: side === s,
          show: () => setShown(s),
          hint: flipKeys[s]
            ? `Press ${comboText(flipKeys[s], isMac)} to show ${LETTER[s]}.`
            : undefined,
          name: runTitle(o.run),
        }
      : null
  }

  const stage = (
    // A new pair draws its own frames: nothing of the last pair's page stays on the stage.
    <Fragment key={pairKey}>
      {reads.length > 1 ? (
        <div className="flex min-h-6 items-center">
          {/* Pulled back by the field's own padding, so its text starts where the stage does. */}
          <span className="-ml-2 flex min-w-0">
            <SelectBox
              aria-label="File in view"
              variant="caption"
              value={steps ? STEPS : (fileOf(inView)?.file ?? '')}
              onChange={setPicked}
              options={reads}
            />
          </span>
        </div>
      ) : null}
      {view === 'diff' && a && b ? (
        <DiffStage a={a} b={b} fileA={fileOf(['a', a])} fileB={fileOf(['b', b])} steps={steps} />
      ) : view === 'side' && sides.length > 1 ? (
        <StagePair>
          {sides.map((entry) => (
            <StageHalf key={entry[0]}>
              <Stage layers={[layerOf(entry)]} shown={entry[0]} onFlip={stay} {...lineOf(entry)} />
            </StageHalf>
          ))}
        </StagePair>
      ) : (
        <Stage
          layers={sides.map(layerOf)}
          shown={side}
          onFlip={flipping ? setShown : stay}
          {...lineOf([side, output])}
        />
      )}
    </Fragment>
  )

  return { stage, side: flipping ? side : null, flipOf }
}

/** One side's file, as the diff needs it. */
type DiffFile = { file: string; kind: string } | null

/**
 * The diff of the file in view, on the stage's ground and at its size. What
 * only A holds is struck through, what only B holds is marked. Two files that
 * differ over too many words to set against each other one by one are compared
 * line by line instead, and the line under the sheet says so.
 */
function DiffStage({
  a,
  b,
  fileA,
  fileB,
  steps,
}: {
  a: Output
  b: Output
  fileA: DiffFile
  fileB: DiffFile
  /** The transcript is in view: steps are read, not compared. */
  steps: boolean
}) {
  // A picture has no words to compare.
  const textual =
    fileA !== null && fileB !== null && ![fileA, fileB].some((f) => f.kind === 'image')
  const pair = `${a.key}:${fileA?.file}|${b.key}:${fileB?.file}`
  const read = useFetch(async (): Promise<{ pair: string; diff: Compared } | null> => {
    if (!textual) return null
    const [x, y] = await Promise.all([
      api.artifactText(a.run.name, a.sample.name, fileA.file),
      api.artifactText(b.run.name, b.sample.name, fileB.file),
    ])
    return { pair, diff: compareTexts(copyOf(x), copyOf(y)) }
  }, [pair])
  // The last pair's diff stays in hand while the next is read: never show it under the new names.
  const shown = diffShown(textual, read.data?.pair === pair ? read.data.diff : null, read.error)
  return (
    <StageSheet
      line={
        shown.kind === 'lines'
          ? 'Too long to compare word by word. Lines only in A are marked −, lines only in B are marked +.'
          : shown.kind === 'words'
            ? 'Text only in A is struck through. Text only in B is marked.'
            : undefined
      }
    >
      {shown.kind === 'not-text' && (
        <Hint inset>
          {steps
            ? 'Word diff compares a file. Pick one above.'
            : fileA && fileB
              ? 'Word diff needs a text file on both sides.'
              : 'Only one of the two outputs wrote this file.'}
        </Hint>
      )}
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
      {shown.kind === 'words' && <WordDiff html={shown.html} />}
      {shown.kind === 'lines' && shown.lines.length ? (
        <div className="p-4">
          <DiffLines lines={shown.lines} />
        </div>
      ) : null}
    </StageSheet>
  )
}
