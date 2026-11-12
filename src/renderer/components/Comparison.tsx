/**
 * One case, two outputs side by side: the version before on the left, the
 * latest on the right. It is what the whole loop is for. Each side carries its
 * score and what it missed, so a difference in the number is read as a
 * difference in the text. A card says only what tells it from the other side
 * or what went wrong: the parts a score is counted from, and who wrote the
 * output, when and in which attempt, are behind its score, a click away.
 *
 * Jev answers facts: whether a rule was followed, whether a check was met.
 * Where the reader sees it otherwise, each way out changes the score at once
 * or from the next grading: a verdict to correct, a check to add, a rule to
 * edit.
 *
 * An output a reader looks at rather than reads, a page or a picture, opens
 * on the stage (`Flip`): drawn as a browser draws it, with A and B in the same
 * place so a flip between them shows what changed. The cards under it keep the
 * scores and what each missed.
 *
 * What an output is decides how it opens, and each file brings its own
 * controls: only a page has a size to pick. Each card's title picks its
 * output. What is done now and then, a swap, the case's own screen, a grade
 * read again, is folded away, so what stands over an output is what picks it.
 *
 * Deleting a run is in the same menu, last and set apart: a run spans every
 * case and every attempt, so its delete belongs with the other actions named
 * by the run, not on one output's card or under one case's form.
 */

import { draftOf, newCheck } from '@domain/case-draft.ts'
import type { Verdict } from '@domain/pack.ts'
import type { Case } from '@domain/schemas.ts'
import { ArrowLeftRightIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { caseContext, skillContext } from '../assist.ts'
import type { Ctx } from '../ctx.ts'
import { useDeleteRun } from '../delete-run.ts'
import { caseUnsaved } from '../draft-edits.ts'
import { inSkill } from '../in-skill.ts'
import { gradingRun, outputWriting, useJobStart, writingRun } from '../job-start.ts'
import {
  apartLine,
  caseTitle,
  configurationTail,
  drawnOf,
  layersOf,
  type Output,
  outputDetail,
  outputFacts,
  outputNames,
  primaryOf,
  scoreOf,
  totalOf,
  versionName,
} from '../model.ts'
import { useLanded } from '../motion.ts'
import { type PageSize, usePageSize } from '../stage.ts'
import {
  ArtifactPicker,
  ArtifactView,
  OpenFullSize,
  type OutputView,
  PageSizeSelect,
} from './Artifact.tsx'
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
import {
  FactList,
  OutputCard,
  OutputCardFoot,
  OutputCardHead,
  OutputWriting,
  Slot,
} from './OutputCard.tsx'
import { MoreActions, RowAction } from './RowActions.tsx'
import { CheckWeight, Delta, PartList, TotalDetail, TotalDetailSection } from './Scores.tsx'
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
  { value: 'flip', label: 'One at a time' },
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
  /** The view the reader chose; until then what the outputs are decides: see `opening`. */
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
  /** A run still being written is graded by itself when it is done, and cannot be before. */
  const writing = (run: string) => writingRun(jobs, state.skill.path, run)
  const unwritten = (o: Output | null) => o !== null && outputWriting(jobs, state.skill.path, o)

  /** Grade the runs these outputs came from again: each run is graded whole. */
  const regrade = (runs: string[]) => {
    const names = [...new Set(runs)]
    // A run already being graded is left to finish, and one still written waits for its own
    // grading: asking now would only be refused.
    const idle = names.filter((run) => !grading(run) && !writing(run))
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
  const kinds = sides.map((o) => primaryOf(o)?.kind)
  // A view is a way to set two outputs against each other: one output has none to choose from.
  const views = both ? VIEWS.filter((v) => v.value !== 'flip' || drawn) : []
  /**
   * How the case opens, by the file that stands for each output: a page or a
   * picture on the stage, two pieces of code as their diff, anything else as
   * cards. A picture beside a note does not put the note on the stage.
   */
  const opening: View = kinds.some((k) => k === 'html' || k === 'image')
    ? 'flip'
    : both && kinds.every((k) => k === 'code')
      ? 'diff'
      : 'side'
  const view: View = views.find((v) => v.value === chosen)?.value ?? opening
  const runs = [...new Set(sides.map((o) => o.run.name))]
  /** What the menu calls a run: "this run", or A's or B's when the two sides come from two. */
  const whoseRun = (run: string) =>
    runs.length > 1
      ? `${sides.find((o) => o.run.name === run) === a ? 'A' : 'B'}’s run`
      : 'this run'
  /**
   * The line that picks the pair, only where the cards cannot: each card's title
   * picks its own output, so the line shows with one side empty or under Word diff.
   */
  const picking = candidates.length > 1 && (!both || view === 'diff')
  /** The size a page is drawn at: one for the case, on the stage and in both cards. */
  const page = usePageSize(testCase?.bench.size ?? null)

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
        <MoreActions subject={caseTitle(state, caseId)}>
          {testCase ? (
            <RowAction
              icon={<PencilIcon aria-hidden="true" />}
              onSelect={() => go('cases', { id: caseId })}
            >
              Edit case
            </RowAction>
          ) : null}
          {a && b ? (
            <RowAction
              icon={<ArrowLeftRightIcon aria-hidden="true" />}
              onSelect={() => show({ a: b, b: a })}
            >
              Swap A and B
            </RowAction>
          ) : null}
          {runs.map((run) => {
            const of = sides.filter((o) => o.run.name === run)
            const verb = of.some((o) => scoreOf(o, config)) ? 'Regrade' : 'Grade'
            // Grading reads a whole run, so the action names the run, not the output.
            const whose = whoseRun(run)
            return (
              <RowAction
                key={run}
                icon={<RefreshCwIcon aria-hidden="true" />}
                title={
                  writing(run)
                    ? 'Wait for the run to finish. It is graded then.'
                    : 'Jev grades the whole run again.'
                }
                disabled={grade.starting() || writing(run)}
                busy={grading(run)}
                onSelect={() => regrade([run])}
              >
                {`${verb} ${whose}`}
              </RowAction>
            )
          })}
          {runs.map((run) => (
            <DeleteRunAction
              key={run}
              ctx={ctx}
              run={run}
              label={`Delete ${whoseRun(run)}`}
              grading={grading(run)}
              waiting={grade.starting()}
              // The address named an output of the run: the case opens on the pair it has left.
              closed={() => go('results', { case: caseId })}
            />
          ))}
        </MoreActions>
      </ColumnHeader>
      <ColumnBody>
        {testCase || picking || view === 'flip' ? (
          // The case, the pair and the stage that shows it: one group, closer to each other than to the cards.
          <Stack gap="md">
            {testCase ? <Asked testCase={testCase} /> : null}
            {picking ? <Pair candidates={candidates} a={a} b={b} show={show} /> : null}
            {view === 'flip' ? (
              <Flip
                key={`${a?.key}|${b?.key}`}
                a={a}
                b={b}
                page={page}
                totals={{ a: a ? totalOf(a, config) : null, b: b ? totalOf(b, config) : null }}
                writing={{ a: unwritten(a), b: unwritten(b) }}
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
                apart={apartLine(a, b)}
                candidates={candidates}
                onPick={(o) => show({ a: o, b })}
                layers={layers}
                grading={grading(a.run.name)}
                writing={unwritten(a)}
                held={grade.starting()}
                onRegrade={() => regrade([a.run.name])}
                reading={view !== 'flip'}
                page={page}
              />
            ) : null}
            {b ? (
              <Side
                ctx={ctx}
                output={b}
                other={a}
                slot={a ? 'b' : null}
                apart={apartLine(b, a)}
                candidates={candidates}
                onPick={(o) => show({ a, b: o })}
                layers={layers}
                grading={grading(b.run.name)}
                writing={unwritten(b)}
                held={grade.starting()}
                onRegrade={() => regrade([b.run.name])}
                reading={view !== 'flip'}
                page={page}
              />
            ) : null}
          </Columns>
        )}
        {testCase ? (
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
 * Delete run as the menu's last item: red, under a rule. It waits while a job
 * still writes or grades the run, and is busy until the delete lands.
 */
function DeleteRunAction({
  ctx,
  run,
  label,
  grading,
  waiting,
  closed,
}: {
  ctx: Ctx
  run: string
  label: string
  grading: boolean
  /** A grade is being started: the run may be the one it grades. */
  waiting: boolean
  closed: () => void
}) {
  const writing = writingRun(ctx.jobs, ctx.state.skill.path, run)
  const del = useDeleteRun(ctx, run, { writing, grading, waiting }, closed)
  return (
    <RowAction
      icon={<Trash2Icon aria-hidden="true" />}
      tone="destructive"
      title={del.blocked}
      disabled={del.blocked !== undefined || waiting}
      busy={del.deleting}
      onSelect={() => void del.remove()}
    >
      {label}
    </RowAction>
  )
}

/**
 * The pair being read, as one line, where the cards cannot pick it: with one
 * side empty, or under Word diff, which has one card for both. The fields that
 * pick another pair are folded under it with Swap. With neither side picked it
 * stands open.
 */
function Pair({
  candidates,
  a,
  b,
  show,
}: {
  candidates: Output[]
  a: Output | null
  b: Output | null
  show: (pair: { a: Output | null; b: Output | null }) => void
}) {
  const names = outputNames(candidates)
  // The line says the two versions, which is what tells most pairs apart; two outputs of one
  // version take the longer names the fields list them by.
  const short = a && b && versionName(a.run) === versionName(b.run) ? null : versionName
  const name = (o: Output) => short?.(o.run) ?? names.get(o.key) ?? o.key
  const one = a ?? b
  return (
    <Disclosure
      summary={
        a && b
          ? `Comparing ${name(a)} with ${name(b)}`
          : one
            ? `Reading ${name(one)} alone`
            : 'No output picked'
      }
      defaultOpen={!one}
    >
      <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-3">
        <Picker slot="a" outputs={candidates} value={a} onChange={(o) => show({ a: o, b })} />
        <Picker slot="b" outputs={candidates} value={b} onChange={(o) => show({ a, b: o })} />
        {a && b ? (
          <Button type="button" variant="outline" size="sm" onClick={() => show({ a: b, b: a })}>
            Swap
          </Button>
        ) : null}
      </div>
    </Disclosure>
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

/**
 * A card's title: its version, and where the case has other outputs, the
 * field that picks another for this side. The field shows the version alone;
 * its list names each output in full, with who wrote it and when under it.
 */
function OutputTitle({
  output,
  slot,
  candidates,
  onPick,
}: {
  output: Output
  slot: 'a' | 'b' | null
  candidates: Output[]
  onPick: (output: Output | null) => void
}) {
  const title = `${versionName(output.run)}${configurationTail(output.run)}`
  if (candidates.length < 2) return title
  const names = outputNames(candidates)
  return (
    <SelectBox
      aria-label={`Output ${SLOT_LABEL[slot ?? 'b']}`}
      variant="title"
      value={output.key}
      onChange={(key) => onPick(candidates.find((o) => o.key === key) ?? null)}
      options={candidates.map((o) => ({
        value: o.key,
        label: names.get(o.key) ?? o.key,
        short: o.key === output.key ? title : undefined,
        detail: outputDetail(o),
      }))}
    />
  )
}

function Side({
  ctx,
  output,
  other,
  slot,
  apart,
  candidates,
  onPick,
  layers,
  grading,
  writing,
  held,
  onRegrade,
  reading = true,
  page,
}: {
  ctx: Ctx
  output: Output
  /** The earlier side, which this one's score is set against. */
  other: Output | null
  /** Its letter; null when it is the only output shown. */
  slot: 'a' | 'b' | null
  /** What tells it from the output beside it besides its version (`apartLine`). */
  apart: string | null
  /** Every output of the case, which its title picks from. */
  candidates: Output[]
  onPick: (output: Output | null) => void
  layers: string[]
  /** A grade of this output's run is going. */
  grading: boolean
  /** The output is still being written: it holds its place, and its run is graded when it is done. */
  writing: boolean
  /** A grade is being started, of this run or the other: one start at a time. */
  held: boolean
  onRegrade: () => void
  /** The card shows what the output wrote; false when the stage above shows it. */
  reading?: boolean
  /** The size a page in this card is drawn at. */
  page: PageSize
}) {
  const { state, config, go, report, reload } = ctx
  const scored = scoreOf(output, config)
  const otherScored = other ? scoreOf(other, config) : null
  // The artifact in view, kept by the output's key: a reload after a correction
  // brings a new output object for the same output, and the view holds.
  const [picked, setPicked] = useState<{ key: string; view: OutputView | null } | null>(null)
  const opening: OutputView | null = primaryOf(output)
  const view = picked?.key === output.key ? picked.view : opening
  const setView = (next: OutputView | null) => setPicked({ key: output.key, view: next })
  const [pending, setPending] = useState<string | null>(null)
  const landed = useLanded(writing)
  const delta =
    scored?.scores.total != null && otherScored?.scores.total != null
      ? scored.scores.total - otherScored.scores.total
      : null
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
        slot={slot ? <Slot variant="letter">{SLOT_LABEL[slot]}</Slot> : undefined}
        title={<OutputTitle output={output} slot={slot} candidates={candidates} onPick={onPick} />}
        total={
          <>
            <TotalDetail total={scored?.scores.total}>
              {scored ? (
                <TotalDetailSection title="What the score is counted from">
                  <PartList
                    scored={scored}
                    layers={layers}
                    other={otherScored}
                    onChangeKinds={() => go('results', { view: 'all', graded: '1' })}
                  />
                </TotalDetailSection>
              ) : null}
              <TotalDetailSection title="How it was made">
                <FactList facts={outputFacts(output)} />
              </TotalDetailSection>
            </TotalDetail>
            <Delta value={delta} />
          </>
        }
        action={
          // Grading is the next step for an output with no score. One with a score is graded
          // again from the header's menu, and says so here while it is. One still being written
          // is graded by its run when it is done.
          !writing && (!scored || grading) ? (
            <Button
              type="button"
              variant="ghost-muted"
              size="xs"
              disabled={held}
              busy={grading}
              busyLabel="Grading…"
              onClick={onRegrade}
            >
              Grade
            </Button>
          ) : undefined
        }
        meta={apart ?? undefined}
      />
      {meta?.error ? (
        <Hint inset tone="destructive">
          {meta.error}
        </Hint>
      ) : null}
      {scored ? (
        <Verdicts
          verdicts={scored.verdicts}
          pending={pending}
          ruleStands={(text) => rules.has(text)}
          onOpenRule={(text) => go('editor', { file: 'SKILL.md', rule: text })}
          onCorrect={correct}
        />
      ) : (
        <Hint inset>{writing ? 'Graded when it is done.' : 'Not graded yet.'}</Hint>
      )}
      {reading && writing ? <OutputWriting place="card" /> : null}
      {reading && !writing ? (
        // An output that lands while it is read fades in where it was waited on.
        <div className={landed ? 'animate-ink' : undefined}>
          <ArtifactPicker artifacts={output.sample.artifacts} value={view} onChange={setView} />
          {view === 'transcript' ? (
            <TranscriptList
              run={output.run.name}
              sample={output.sample.name}
              root={output.sample.path}
              meta={meta}
            />
          ) : (
            <ArtifactView
              run={output.run.name}
              sample={output.sample.name}
              artifact={view}
              page={page}
            />
          )}
          {output.sample.hasTranscript ? (
            <OutputCardFoot>
              <Button
                type="button"
                variant="ghost-muted"
                size="xs"
                onClick={() => setView(view === 'transcript' ? opening : 'transcript')}
              >
                {view === 'transcript' ? 'Back to the output' : 'Read the transcript'}
              </Button>
            </OutputCardFoot>
          ) : null}
        </div>
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

/** The choice that reads an output's steps in place of one of its files. */
const STEPS = ':transcript'

/**
 * The stage, the bar over it and the size line under it. The bar holds what
 * picks the thing in view: which output (A or B with each total, and the
 * keys), and which of its files, or its steps. What belongs to the file in
 * view stands in the line under the stage: for a page, the size it is drawn
 * at, which is also where that size is changed, then how it is scaled, and at
 * the line's end a way to open the file full size.
 */
function Flip({
  a,
  b,
  totals,
  writing,
  page,
}: {
  a: Output | null
  b: Output | null
  totals: { a: number | null; b: number | null }
  /** Which sides are still being written: they wait on the stage, with no file to pick or open. */
  writing: { a: boolean; b: boolean }
  /** The size a page is drawn at, shared with the cards. */
  page: PageSize
}) {
  const [shown, setShown] = useState<StageSide>(b ? 'b' : 'a')
  /** A file the reader picked by name, or the steps; until then each output shows its own page or picture. */
  const [picked, setPicked] = useState<string | null>(null)
  const both = a !== null && b !== null
  const sides = (
    [
      ['a', a],
      ['b', b],
    ] as const
  ).filter((entry): entry is readonly [StageSide, Output] => entry[1] !== null)
  const [side, output] = sides.find(([s]) => s === shown) ?? sides[0]
  const steps = picked === STEPS
  const ready = sides.filter(([s]) => !writing[s])
  const fileOf = (s: StageSide, o: Output) =>
    steps || writing[s]
      ? null
      : picked === null
        ? drawnOf(o)
        : (o.sample.artifacts.find((f) => f.file === picked) ?? null)
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
  const file = fileOf(side, output)
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
      {(a && b) || reads.length > 1 ? (
        <Toolbar gap="md">
          {a && b ? (
            <Segmented
              aria-label="Output in view"
              value={side}
              onChange={setShown}
              options={[flipTo('a', a), flipTo('b', b)]}
            />
          ) : null}
          {reads.length > 1 ? (
            <SelectBox
              aria-label="File in view"
              size="sm"
              value={steps ? STEPS : (file?.file ?? '')}
              onChange={setPicked}
              options={reads}
            />
          ) : null}
        </Toolbar>
      ) : null}
      <Stage
        layers={sides.map(([s, o]) => ({
          side: s,
          run: o.run.name,
          sample: o.sample.name,
          artifact: fileOf(s, o),
          name: `${SLOT_LABEL[s]}, ${versionName(o.run)}`,
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
        }))}
        shown={side}
        width={page.width}
        height={page.height}
        onFlip={flip}
        lead={file?.kind === 'html' ? <PageSizeSelect page={page} /> : null}
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
      hint="Say what a good answer does. It is checked on every run from now on, and on these outputs when you regrade."
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
