/**
 * One case, two outputs side by side: the version before on the left, the
 * latest on the right. It is what the whole loop is for. Each side carries its
 * score, the parts it is counted from and what it missed, so a difference in
 * the number is read as a difference in the text.
 *
 * Jev answers facts: whether a rule was followed, whether a check was met.
 * Where the reader sees it otherwise, each way out changes the score at once
 * or from the next grading: a verdict to correct, a check to add, a rule to
 * edit.
 *
 * An output a reader looks at rather than reads, a page or a picture, opens
 * on the stage (`Flip`): drawn as a browser draws it, at a width the reader
 * picks, with A and B in the same place so a flip between them shows what
 * changed. The cards under it keep the scores and what each missed.
 */

import { draftOf, newCheck } from '@domain/case-draft.ts'
import type { Verdict } from '@domain/pack.ts'
import type { Case } from '@domain/schemas.ts'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { caseContext, skillContext } from '../assist.ts'
import type { Ctx } from '../ctx.ts'
import { caseUnsaved } from '../draft-edits.ts'
import { inSkill } from '../in-skill.ts'
import { gradingRun, useJobStart } from '../job-start.ts'
import {
  caseTitle,
  checksGraded,
  configurationTail,
  drawnOf,
  layersOf,
  type Output,
  outputDetail,
  outputNames,
  primaryOf,
  sampleTail,
  scoreOf,
  sizeLine,
  totalOf,
  versionName,
} from '../model.ts'
import {
  STAGE_WIDTHS,
  type StageWidth,
  setStageWidth,
  stagePixels,
  useStageWidth,
} from '../stage.ts'
import { ArtifactPicker, ArtifactView, OpenFullSize, type OutputView } from './Artifact.tsx'
import { DiffCard } from './DiffCard.tsx'
import { Disclosure } from './Disclosure.tsx'
import {
  ColumnBody,
  ColumnHeader,
  Columns,
  ColumnTitle,
  EmptyState,
  Field,
  FormSection,
  List,
  Stack,
  Toolbar,
} from './layout.tsx'
import { OutputCard, OutputCardHead, Slot } from './OutputCard.tsx'
import { CheckWeight, Delta, Parts, TotalChip } from './Scores.tsx'
import { Segmented } from './Segmented.tsx'
import { SelectBox } from './SelectBox.tsx'
import { Stage, type Side as StageSide } from './Stage.tsx'
import { TextArea } from './TextArea.tsx'
import { TranscriptList } from './TranscriptList.tsx'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Label } from './ui/label.tsx'
import { Verdicts } from './Verdicts.tsx'

const SLOT_LABEL = { a: 'A', b: 'B' } as const

type View = 'flip' | 'side' | 'diff'

const VIEWS = [
  { value: 'flip', label: 'Flip' },
  { value: 'side', label: 'Side by side' },
  { value: 'diff', label: 'Word diff' },
] as const satisfies ReadonlyArray<{ value: View; label: string }>

export function Comparison({
  ctx,
  caseId,
  a,
  b,
}: {
  ctx: Ctx
  caseId: string
  /** The earlier side; null when the case has one output to read. */
  a: Output | null
  /** The later side. */
  b: Output | null
}) {
  const { state, config, outputs, go, report, jobs } = ctx
  /** The view the reader chose; until then a page or a picture opens on the stage, text side by side. */
  const [chosen, setChosen] = useState<View | null>(null)
  const testCase = state.cases.find((c) => c.id === caseId) ?? null
  const candidates = outputs.filter((o) => o.caseId === caseId)
  const layers = layersOf(config)
  // Both keys always go in the address, so a side left empty stays empty.
  const show = (pair: { a: Output | null; b: Output | null }) =>
    go('results', { case: caseId, a: pair.a?.key ?? '', b: pair.b?.key ?? '' })
  const both = a && b ? { a, b } : null

  /** Grades of the runs these outputs came from: busy from the press, not from the first poll that lists the job. */
  const grade = useJobStart(jobs, 'grade', report)
  const titleOf = (run: string) => `Grade ${run}`
  const grading = (run: string) =>
    grade.busy(titleOf(run)) || gradingRun(jobs, state.skill.path, run)

  /** Grade the runs these outputs came from again: each run is graded whole. */
  const regrade = (runs: string[]) => {
    const names = [...new Set(runs)]
    // A run already being graded is left to finish: asking again would only be refused.
    const idle = names.filter((run) => !grading(run))
    if (!idle.length) return
    void grade.start(idle.map(titleOf), async () => {
      for (const run of idle) await api.grade(run, state.jevKey)
      report(
        idle.length > 1
          ? 'Grading both runs'
          : runs.length > 1
            ? 'Grading the run'
            : `Grading ${idle[0]}`,
      )
    })
  }

  const sides = [a, b].filter((o): o is Output => o !== null)
  const drawn = sides.some((o) => drawnOf(o) !== null)
  // Flip needs something drawn, and a word diff two outputs.
  const views = VIEWS.filter((v) => (v.value === 'flip' ? drawn : v.value === 'diff' ? both : true))
  const view: View = views.find((v) => v.value === chosen)?.value ?? (drawn ? 'flip' : 'side')

  return (
    <>
      {/* Stacked under the list, the case's name takes the first row and the views the second. */}
      <ColumnHeader className="max-lg:flex-wrap">
        <ColumnTitle className="max-lg:basis-full">
          <Heading level={2} as="h2">
            {caseTitle(state, caseId)}
          </Heading>
        </ColumnTitle>
        {views.length > 1 ? (
          <Segmented aria-label="View" options={views} value={view} onChange={setChosen} />
        ) : null}
        {testCase ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => go('cases', { id: caseId })}
          >
            Edit case
          </Button>
        ) : null}
      </ColumnHeader>
      <ColumnBody>
        {testCase || candidates.length > 1 || view === 'flip' ? (
          // The case, the pair and the stage that shows it: one group, closer to each other than to the cards.
          <Stack gap="md">
            {testCase ? <Asked testCase={testCase} /> : null}
            {candidates.length > 1 ? (
              <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-3">
                <Picker
                  slot="a"
                  outputs={candidates}
                  value={a}
                  onChange={(o) => show({ a: o, b })}
                />
                <Picker
                  slot="b"
                  outputs={candidates}
                  value={b}
                  onChange={(o) => show({ a, b: o })}
                />
                {both ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => show({ a: b, b: a })}
                  >
                    Swap
                  </Button>
                ) : null}
              </div>
            ) : null}
            {view === 'flip' ? (
              <Flip
                key={`${a?.key}|${b?.key}`}
                a={a}
                b={b}
                caseWidth={testCase?.bench.size?.[0] ?? null}
                totals={{ a: a ? totalOf(a, config) : null, b: b ? totalOf(b, config) : null }}
              />
            ) : null}
          </Stack>
        ) : null}
        {!sides.length ? (
          <EmptyState title="Pick an output to read">
            Pick one for A and one for B above to read them side by side.
          </EmptyState>
        ) : view === 'diff' && both ? (
          <DiffCard a={both.a} b={both.b} />
        ) : (
          <Columns count={both ? 2 : 1}>
            {a ? (
              <Side
                ctx={ctx}
                output={a}
                other={null}
                slot="a"
                layers={layers}
                grading={grading(a.run.name)}
                held={grade.starting()}
                onRegrade={() => regrade([a.run.name])}
                reading={view !== 'flip'}
              />
            ) : null}
            {b ? (
              <Side
                ctx={ctx}
                output={b}
                other={a}
                slot={a ? 'b' : null}
                layers={layers}
                grading={grading(b.run.name)}
                held={grade.starting()}
                onRegrade={() => regrade([b.run.name])}
                reading={view !== 'flip'}
              />
            ) : null}
          </Columns>
        )}
        {testCase && checksGraded(config) ? (
          <AddCheck
            ctx={ctx}
            testCase={testCase}
            onRegrade={() => regrade(sides.map((o) => o.run.name))}
          />
        ) : null}
      </ColumnBody>
    </>
  )
}

/**
 * One side of the pair: its letter, then the output in it. The field names the
 * output by its version; who wrote it and when is a line under each name in
 * the list, so the two fields stay short and the same width.
 */
function Picker({
  slot,
  outputs,
  value,
  onChange,
}: {
  slot: 'a' | 'b'
  outputs: Output[]
  value: Output | null
  onChange: (output: Output | null) => void
}) {
  const names = outputNames(outputs)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Slot variant="letter">{SLOT_LABEL[slot]}</Slot>
      <SelectBox
        aria-label={`Output ${SLOT_LABEL[slot]}`}
        width="fill"
        size="sm"
        value={value?.key ?? ''}
        onChange={(key) => onChange(outputs.find((o) => o.key === key) ?? null)}
        none="None"
        options={outputs.map((o) => ({
          value: o.key,
          label: names.get(o.key) ?? o.key,
          detail: outputDetail(o),
        }))}
      />
    </div>
  )
}

/** What the agent was asked, and what a good answer does: folded, since both sides answer the same case. */
function Asked({ testCase }: { testCase: Case }) {
  return (
    <Disclosure summary={`The prompt${testCase.graders.length ? ' and its checks' : ''}`}>
      <Stack gap="md">
        <Text as="p" font="mono" size="xs" wrap="pre">
          {testCase.prompt}
        </Text>
        {testCase.expectedOutcome ? <Hint>A good answer: {testCase.expectedOutcome}</Hint> : null}
        {testCase.graders.length ? (
          <List size="xs">
            {testCase.graders.map((g) => (
              <li key={g.id}>
                {g.statement}
                <CheckWeight weight={g.weight} />
              </li>
            ))}
          </List>
        ) : null}
      </Stack>
    </Disclosure>
  )
}

function Side({
  ctx,
  output,
  other,
  slot,
  layers,
  grading,
  held,
  onRegrade,
  reading = true,
}: {
  ctx: Ctx
  output: Output
  /** The earlier side, which this one's score is set against. */
  other: Output | null
  /** Its letter; null when it is the only output shown. */
  slot: 'a' | 'b' | null
  layers: string[]
  /** A grade of this output's run is going. */
  grading: boolean
  /** A grade is being started, of this run or the other: one start at a time. */
  held: boolean
  onRegrade: () => void
  /** The card shows what the output wrote; false when the stage above shows it. */
  reading?: boolean
}) {
  const { state, config, go, report, reload } = ctx
  const scored = scoreOf(output, config)
  const otherScored = other ? scoreOf(other, config) : null
  // The artifact in view, kept by the output's key: a reload after a correction
  // brings a new output object for the same output, and the view holds.
  const [picked, setPicked] = useState<{ key: string; view: OutputView | null } | null>(null)
  const view = picked?.key === output.key ? picked.view : primaryOf(output)
  const setView = (next: OutputView | null) => setPicked({ key: output.key, view: next })
  const [pending, setPending] = useState<string | null>(null)
  const delta =
    scored?.scores.total != null && otherScored?.scores.total != null
      ? scored.scores.total - otherScored.scores.total
      : null
  const size = sizeLine(output)
  const meta = output.run.meta?.samples.find((s) => s.dir === output.sample.name) ?? null
  const rules = new Set(state.rules.map((r) => r.text))

  const correct = async (verdict: Verdict, met: boolean | null) => {
    setPending(verdict.id)
    try {
      await api.correct(output.key, verdict.id, met)
      await reload()
      report(
        met === null ? 'Jev’s answer stands again' : `Marked as ${met ? 'met' : 'missed'}`,
        met === null
          ? undefined
          : { undo: inSkill(ctx, () => api.correct(output.key, verdict.id, null)) },
      )
    } catch (e) {
      report(e as Error)
    } finally {
      setPending(null)
    }
  }

  return (
    <OutputCard>
      <OutputCardHead
        slot={slot ? <Slot variant="letter">{SLOT_LABEL[slot]}</Slot> : <Slot>Output</Slot>}
        title={`${versionName(output.run)}${configurationTail(output.run)}`}
        total={
          <>
            <TotalChip total={scored?.scores.total} />
            <Delta value={delta} />
          </>
        }
        action={
          <Button
            type="button"
            variant="ghost-muted"
            size="xs"
            disabled={held}
            busy={grading}
            busyLabel="Grading…"
            onClick={onRegrade}
          >
            {scored ? 'Regrade' : 'Grade'}
          </Button>
        }
        meta={
          <>
            <span>
              {outputDetail(output)}
              {sampleTail(output)}
            </span>
            {size ? <span>{size}</span> : null}
          </>
        }
      />
      {meta?.error ? (
        <Hint inset tone="destructive">
          {meta.error}
        </Hint>
      ) : null}
      {scored ? (
        <>
          <Parts scored={scored} layers={layers} other={otherScored} />
          <Verdicts
            verdicts={scored.verdicts}
            pending={pending}
            ruleStands={(text) => rules.has(text)}
            onOpenRule={(text) => go('editor', { file: 'SKILL.md', rule: text })}
            onCorrect={correct}
          />
        </>
      ) : (
        <Hint inset>Not graded yet.</Hint>
      )}
      {reading ? (
        <>
          <ArtifactPicker
            artifacts={output.sample.artifacts}
            value={view}
            onChange={setView}
            transcript={output.sample.hasTranscript}
          />
          {view === 'transcript' ? (
            <TranscriptList
              run={output.run.name}
              sample={output.sample.name}
              root={output.sample.path}
              meta={meta}
            />
          ) : (
            <ArtifactView run={output.run.name} sample={output.sample.name} artifact={view} />
          )}
        </>
      ) : null}
    </OutputCard>
  )
}

/** True when a key goes to what has the focus: a field, an editor, a menu or a dialog. */
const typingIn = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
    target.closest('[role="dialog"],[role="menu"],[role="listbox"]') !== null)

/**
 * The stage, the one bar over it and the size line under it. The bar, from
 * the start: which output is in view (A or B with each total, and the keys),
 * which file, and the width a page is drawn at. At its end: a way to open the
 * file full size. Under the stage: the size drawn and how it is scaled.
 */
function Flip({
  a,
  b,
  totals,
  caseWidth,
}: {
  a: Output | null
  b: Output | null
  totals: { a: number | null; b: number | null }
  /** The width the case says its page is made for (`bench.size`); null when it names none. */
  caseWidth: number | null
}) {
  const kept = useStageWidth()
  /** A width picked on this stage; until then a case with a size opens at its width, else at the last width picked. */
  const [widthPicked, setWidthPicked] = useState<StageWidth | 'case' | null>(null)
  const choice = widthPicked ?? (caseWidth ? 'case' : kept)
  const width = choice === 'case' ? caseWidth : stagePixels(choice)
  const widths = caseWidth
    ? [{ value: 'case' as const, label: `Case, ${caseWidth}` }, ...STAGE_WIDTHS]
    : STAGE_WIDTHS
  const pickWidth = (next: StageWidth | 'case') => {
    setWidthPicked(next)
    if (next !== 'case') setStageWidth(next)
  }
  const [shown, setShown] = useState<StageSide>(b ? 'b' : 'a')
  /** A file the reader picked by name; until then each output shows its own page or picture. */
  const [picked, setPicked] = useState<string | null>(null)
  const both = a !== null && b !== null
  const sides = (
    [
      ['a', a],
      ['b', b],
    ] as const
  ).filter((entry): entry is readonly [StageSide, Output] => entry[1] !== null)
  const [side, output] = sides.find(([s]) => s === shown) ?? sides[0]
  const fileOf = (o: Output) =>
    picked === null ? drawnOf(o) : (o.sample.artifacts.find((f) => f.file === picked) ?? null)
  const files = [
    ...new Set(
      sides.flatMap(([, o]) =>
        o.sample.artifacts.filter((f) => f.kind !== 'transcript').map((f) => f.file),
      ),
    ),
  ]
  const file = fileOf(output)
  const flip = useCallback((to: StageSide) => setShown(to), [])

  // A and B flip the stage, unless the key is being typed somewhere.
  useEffect(() => {
    if (!both) return
    const handle = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key !== 'a' && key !== 'b') return
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (typingIn(event.target)) return
      setShown(key)
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [both])

  const flipTo = (to: StageSide, o: Output) => ({
    value: to,
    label: (
      <>
        <Text font="mono" weight="semibold">
          {SLOT_LABEL[to]}
        </Text>
        {totals[to] === null ? null : <Text tabular>{Math.round(totals[to])}</Text>}
      </>
    ),
    title: `${versionName(o.run)}. Press ${SLOT_LABEL[to]} to show it.`,
  })

  return (
    <>
      <Toolbar gap="md">
        {a && b ? (
          <Segmented
            aria-label="Output in view"
            value={side}
            onChange={setShown}
            options={[flipTo('a', a), flipTo('b', b)]}
          />
        ) : null}
        {files.length > 1 ? (
          <Segmented
            aria-label="File"
            tone="quiet"
            font="mono"
            text="xs"
            value={file?.file ?? null}
            onChange={setPicked}
            options={files.map((f) => ({ value: f, label: f.replace(/^outputs\//, '') }))}
          />
        ) : null}
        {file?.kind === 'html' ? (
          <Segmented
            aria-label="Width"
            tone="quiet"
            value={choice}
            onChange={pickWidth}
            options={widths}
          />
        ) : null}
      </Toolbar>
      <Stage
        layers={sides.map(([s, o]) => ({
          side: s,
          run: o.run.name,
          sample: o.sample.name,
          artifact: fileOf(o),
          name: `${SLOT_LABEL[s]}, ${versionName(o.run)}`,
        }))}
        shown={side}
        width={width}
        onFlip={flip}
        action={
          file ? (
            <OpenFullSize run={output.run.name} sample={output.sample.name} file={file.file} />
          ) : null
        }
      />
    </>
  )
}

/**
 * What an output gets wrong that nothing names yet, turned into a check. A
 * check written after reading an output is about something that happened; one
 * written before is a guess. It joins the case's checks, and Jev marks it from
 * the next grading on.
 */
function AddCheck({
  ctx,
  testCase,
  onRegrade,
}: {
  ctx: Ctx
  testCase: Case
  onRegrade: () => void
}) {
  const { state, go, report, reload, drafts } = ctx
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const title = testCase.title || testCase.id

  const add = async () => {
    const statement = text.trim()
    if (!statement || busy) return
    setBusy(true)
    try {
      // A draft that says what the saved case says holds no edits: the check is saved at once.
      const kept = drafts.cases[testCase.id]
      const unsaved = caseUnsaved(kept, draftOf(testCase)) ? kept : undefined
      if (unsaved) {
        // The case has edits waiting on Cases: the check joins them, so saving there keeps both.
        drafts.setCase(testCase.id, {
          ...unsaved,
          graders: [
            ...unsaved.graders.filter((g) => g.statement.trim() || g.image),
            { ...newCheck(), statement },
          ],
        })
        report(`Added to your unsaved edits of ${title}. Save the case to keep it.`, {
          action: { label: 'Open', run: () => go('cases', { id: testCase.id }) },
        })
      } else {
        const saved = draftOf(testCase)
        await api.saveCase(
          { ...saved, graders: [...saved.graders, { ...newCheck(), statement }] },
          false,
        )
        await reload()
        report(
          `Added a check to ${title}`,
          state.jevKey ? { action: { label: 'Regrade', run: onRegrade } } : undefined,
        )
      }
      setText('')
    } catch (e) {
      report(e as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormSection
      layout="stacked"
      title="Add a check"
      hint="Something an output gets wrong that nothing above names. Say what a good answer does. Jev marks it on every run from now on, and on these outputs once you regrade."
    >
      <Field>
        <Label htmlFor="new-check">A good answer makes this true</Label>
        <TextArea
          id="new-check"
          variant="line"
          rows={1}
          value={text}
          placeholder="The note has exactly two sentences."
          onValueChange={setText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void add()
            }
          }}
          assist={{
            field: 'case.check',
            context: () => [skillContext(state), caseContext(draftOf(testCase))],
          }}
        />
      </Field>
      <Toolbar>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!text.trim()}
          busy={busy}
          busyLabel="Adding…"
          onClick={add}
        >
          Add check
        </Button>
      </Toolbar>
    </FormSection>
  )
}
