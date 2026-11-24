/**
 * One case, two outputs compared: the version before as A, the latest as B.
 * It is what the whole loop is for. The pair is picked in a band under the
 * header (`PairBand`), which holds still while the rest scrolls: each side's
 * letter and version, and nothing that judges it. The person reads the two
 * answers first and makes up their own mind. Under the band the stage shows
 * the outputs in every view (`OutputStage`), and under the stage a card holds
 * what to fix, in order (`Verdicts`). Where both outputs are in view the list
 * is the later one's, and a row names the earlier only where it stands
 * otherwise.
 *
 * Jev answers facts: whether a rule was followed, whether a check was met.
 * Where the reader sees it otherwise, each way out changes the score at once
 * or from the next grading: a verdict to correct here, a rule to edit on
 * Skill, a check to add on Cases, which Edit case in the menu opens.
 *
 * Why an output has no score is under its version, where Grade is, never
 * over a list.
 *
 * What is done now and then, a swap, the case's own screen, a grade read
 * again, is folded into the header's menu. Deleting a run is in the same
 * menu, last and set apart: a run spans every case and every attempt, so its
 * delete belongs with the other actions named by the run, not on one output.
 */

import { openedSkill } from '@domain/fix-order.ts'
import type { Verdict } from '@domain/pack.ts'
import type { Case } from '@domain/schemas.ts'
import { ArrowLeftRightIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { Fragment, useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { useDeleteRun } from '../delete-run.ts'
import { useFetch } from '../hooks.ts'
import { inSkill } from '../in-skill.ts'
import { gradingRun, outputWriting, useJobStart, writingRun } from '../job-start.ts'
import {
  apartLine,
  caseTitle,
  failedLine,
  failureOf,
  isWithoutSkill,
  type Output,
  outputDetail,
  outputNames,
  outputRulesUnmarked,
  outputsToPick,
  outputWriter,
  previewOf,
  regradeOwed,
  runStamp,
  runTitle,
  scoreOf,
} from '../model.ts'
import { usePageSize } from '../stage.ts'
import { Disclosure } from './Disclosure.tsx'
import { FixWithAi } from './FixWithAi.tsx'
import {
  ColumnBody,
  ColumnHeader,
  Columns,
  ColumnTitle,
  EmptyState,
  List,
  Stack,
  Toolbar,
} from './layout.tsx'
import { OutputCard, Slot } from './OutputCard.tsx'
import { useOutputStage, type View } from './OutputStage.tsx'
import { type HeadFlip, PairBand, PairEmpty, PairHead } from './PairBand.tsx'
import { ContextActions, MoreActions, RowAction, RowActionGroup } from './RowActions.tsx'
import { CheckWeight } from './Scores.tsx'
import { Segmented } from './Segmented.tsx'
import { SelectBox, type SelectOption, type SelectOptionGroup } from './SelectBox.tsx'
import { Heading, Hint, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Verdicts } from './Verdicts.tsx'

const SLOT_LABEL = { a: 'A', b: 'B' } as const

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
  const candidates = outputsToPick(outputs, caseId, [a, b])
  // Both keys always go in the address, so a side left empty stays empty.
  const show = (pair: { a: Output | null; b: Output | null }) =>
    go('results', { case: caseId, a: pair.a?.key ?? '', b: pair.b?.key ?? '' })
  const both = a !== null && b !== null
  const opened = { a: useOpened(a), b: useOpened(b) }

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
      for (const run of idle) await api.grade(run)
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
  const kinds = sides.map((o) => previewOf(o)?.kind)
  /**
   * How the case opens, by the file each output opens on (`previewOf`): a page
   * or a picture one at a time, two pieces of code as their diff, anything
   * else side by side. Code that came with a page opens on the page; a note
   * with a picture beside it stays a note.
   */
  const opening: View = kinds.some((k) => k === 'html' || k === 'image')
    ? 'flip'
    : both && kinds.every((k) => k === 'code')
      ? 'diff'
      : 'side'
  // A view is a way to set two outputs against each other: one output is read by itself.
  const view: View = both ? (chosen ?? opening) : 'flip'
  const runs = [...new Set(sides.map((o) => o.run.name))]
  /** The size a page is drawn at: one for the case, on every stage. */
  const page = usePageSize(testCase?.bench.size ?? null)
  const stage = useOutputStage({
    a,
    b,
    view,
    page,
    writing: { a: unwritten(a), b: unwritten(b) },
  })

  /** Written once: the header's "More actions" menu and a right-click on the outputs draw these. */
  const actions = (
    <>
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
        // Grading and deleting read a whole run, so the actions name the run, not the output.
        // With two runs each has a group, headed by its side, and the actions keep their words.
        const items = (
          <>
            <RowAction
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
              {`${verb} ${runs.length > 1 ? 'run' : 'this run'}`}
            </RowAction>
            <DeleteRunAction
              ctx={ctx}
              run={run}
              label={runs.length > 1 ? 'Delete run' : 'Delete this run'}
              grading={grading(run)}
              waiting={grade.starting()}
              // The address named an output of the run: the case opens on the pair it has left.
              closed={() => go('results', { case: caseId })}
            />
          </>
        )
        if (runs.length < 2) return <Fragment key={run}>{items}</Fragment>
        const side = of[0] === a ? 'A' : 'B'
        return (
          <RowActionGroup
            key={run}
            heading={`Output ${side} · ${runTitle(of[0].run, { short: true })}`}
          >
            {items}
          </RowActionGroup>
        )
      })}
    </>
  )

  /** The output has a list of facts to show, and none of it waits on a regrade. */
  const listed = (output: Output) =>
    scoreOf(output, config) !== null && !outputRulesUnmarked(output)
  const title = caseTitle(state, caseId)
  /** The case has an output to put on a side left empty, or in place of one picked. */
  const pickable = candidates.length > 1
  /** What a side's head and its list share. */
  const sideOf = (output: Output) => ({
    ctx,
    output,
    grading: grading(output.run.name),
    held: grade.starting(),
    onRegrade: () => regrade([output.run.name]),
  })
  const head = (slot: 'a' | 'b', output: Output) => (
    <SideHead
      {...sideOf(output)}
      // B keeps its letter beside an empty A, where the field that fills A stands next to it.
      letter={slot === 'a' || a || pickable ? SLOT_LABEL[slot] : null}
      apart={apartLine(output, slot === 'a' ? b : a)}
      candidates={candidates}
      onPick={(o) => show(slot === 'a' ? { a: o, b } : { a, b: o })}
      writing={unwritten(output)}
      flip={stage.flipOf(slot)}
    />
  )
  const empty = (slot: 'a' | 'b') =>
    pickable ? (
      <PairEmpty>
        <EmptySide
          slot={slot}
          outputs={candidates}
          onPick={(o) => show(slot === 'a' ? { a: o, b } : { a, b: o })}
        />
      </PairEmpty>
    ) : null

  return (
    <>
      <ColumnHeader className="max-lg:flex-wrap">
        <ColumnTitle className="max-lg:basis-full">
          <Heading level={2} as="h2">
            {title}
          </Heading>
        </ColumnTitle>
        {both ? (
          <Segmented aria-label="View" options={VIEWS} value={view} onChange={setChosen} />
        ) : null}
        <MoreActions subject={title}>{actions}</MoreActions>
      </ColumnHeader>
      {sides.length || pickable ? (
        <PairBand two={both || pickable}>
          {a ? head('a', a) : empty('a')}
          {b ? head('b', b) : empty('b')}
        </PairBand>
      ) : null}
      <ContextActions subject={title} actions={actions}>
        <ColumnBody>
          <Stack gap="md">
            {askedBy(testCase, a, b).map((asked) => (
              <Asked key={asked.key} testCase={asked.testCase} summary={asked.summary} />
            ))}
            {stage.stage}
          </Stack>
          {!sides.length ? (
            <EmptyState title="Pick an output to read">
              Pick one for A and one for B above to read them side by side.
            </EmptyState>
          ) : a && b && !stage.side && listed(a) && listed(b) ? (
            <PairList ctx={ctx} a={a} b={b} opened={opened} />
          ) : (
            // Read one at a time, the page shows the list of the output on the stage alone.
            <Columns count={both && !stage.side ? 2 : 1}>
              {a && stage.side !== 'b' ? (
                <SideList {...sideOf(a)} writing={unwritten(a)} opened={opened.a} />
              ) : null}
              {b && stage.side !== 'a' ? (
                <SideList {...sideOf(b)} writing={unwritten(b)} opened={opened.b} />
              ) : null}
            </Columns>
          )}
        </ColumnBody>
      </ContextActions>
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
 * A list of outputs to pick from. Outputs written without the skill serve
 * another purpose, the score the skill has to beat, so they stand in a group
 * of their own after the versions; with none of them the list stays flat.
 * Under that group's heading a row names who wrote it, not "Without skill"
 * again; the field still says "Without skill" once one is picked.
 */
function outputChoices(
  outputs: readonly Output[],
  choice: (output: Output) => SelectOption,
): { options?: SelectOption[]; groups?: SelectOptionGroup[] } {
  const without = outputs.filter((o) => isWithoutSkill(o.run))
  if (!without.length) return { options: outputs.map(choice) }
  const withSkill = outputs.filter((o) => !isWithoutSkill(o.run))
  return {
    groups: [
      ...(withSkill.length ? [{ label: 'With the skill', options: withSkill.map(choice) }] : []),
      {
        label: 'Without the skill',
        options: without.map((o) => {
          const c = choice(o)
          return {
            ...c,
            label: outputWriter(o),
            detail: runStamp(o.run),
            short: c.short ?? c.label,
          }
        }),
      },
    ],
  }
}

/** A side left empty in the band: its letter, then the field that fills it. */
function EmptySide({
  slot,
  outputs,
  onPick,
}: {
  slot: 'a' | 'b'
  outputs: Output[]
  onPick: (output: Output | null) => void
}) {
  const names = outputNames(outputs)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Slot>{SLOT_LABEL[slot]}</Slot>
      <SelectBox
        aria-label={`Output ${SLOT_LABEL[slot]}`}
        width="fill"
        size="sm"
        value=""
        onChange={(key) => onPick(outputs.find((o) => o.key === key) ?? null)}
        none="None"
        {...outputChoices(outputs, (o) => ({
          value: o.key,
          label: names.get(o.key) ?? o.key,
          detail: outputDetail(o),
        }))}
      />
    </div>
  )
}

/** A case to show above the outputs: the one both answer, or one a side answered before it changed. */
interface AskedCase {
  key: string
  testCase: Case
  summary: string
}

/**
 * The cases the outputs in view answered. The case as it stands comes first.
 * An output written before its prompt or files changed, or for a case since
 * deleted, answered the copy its run kept: that one is listed too, and says
 * whose it is, so a prompt is never read beside an answer to another.
 */
function askedBy(testCase: Case | null, a: Output | null, b: Output | null): AskedCase[] {
  const named = (c: Case, lead = 'The prompt') =>
    `${lead}${c.graders.length ? ' and its checks' : ''}`
  // B has a letter only beside A, as on its card.
  const sides: Array<[Output | null, string | null]> = [
    [a, SLOT_LABEL.a],
    [b, a ? SLOT_LABEL.b : null],
  ]
  const earlier = new Map<string, { testCase: Case; who: Array<string | null> }>()
  for (const [output, letter] of sides) {
    if (!output?.earlier) continue
    const group = earlier.get(output.ask) ?? { testCase: output.earlier, who: [] }
    group.who.push(letter)
    earlier.set(output.ask, group)
  }
  const shown = sides.filter(([output]) => output !== null).length
  const listed: AskedCase[] = testCase ? [{ key: 'now', testCase, summary: named(testCase) }] : []
  for (const [ask, group] of earlier) {
    // With the case gone and every output an answer to the one copy, it is the prompt, and needs no more said.
    const only = !testCase && earlier.size === 1 && group.who.length === shown
    const who = group.who.map((letter) => letter ?? 'this output').join(' and ')
    listed.push({
      key: ask,
      testCase: group.testCase,
      summary: only
        ? named(group.testCase)
        : `${named(group.testCase, testCase ? 'The earlier prompt' : 'The prompt')}, which ${who} answered`,
    })
  }
  return listed
}

/** What the agent was asked, and what a good answer does: folded, since both sides answer the same case. */
function Asked({ testCase, summary }: { testCase: Case; summary: string }) {
  return (
    <Disclosure summary={summary}>
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
 * A head's title: its version, and where the case has other outputs, the
 * field that picks another for this side. The field shows the version and its
 * name; its list names each output in full, with who wrote it and when under
 * it.
 */
function OutputTitle({
  output,
  letter,
  candidates,
  onPick,
}: {
  output: Output
  letter: string | null
  candidates: Output[]
  onPick: (output: Output | null) => void
}) {
  const title = runTitle(output.run)
  if (candidates.length < 2)
    return (
      <span className="block truncate" title={title}>
        {title}
      </span>
    )
  const names = outputNames(candidates)
  return (
    <SelectBox
      aria-label={`Output ${letter ?? SLOT_LABEL.b}`}
      variant="title"
      // The version says which group it is from: "Without skill" needs no "Without the skill" after it.
      nameGroup={false}
      value={output.key}
      onChange={(key) => onPick(candidates.find((o) => o.key === key) ?? null)}
      {...outputChoices(candidates, (o) => ({
        value: o.key,
        label: names.get(o.key) ?? o.key,
        short: o.key === output.key ? title : undefined,
        detail: outputDetail(o),
      }))}
    />
  )
}

/** What a side's head in the band and its list under the stage are both given. */
interface SideProps {
  ctx: Ctx
  output: Output
  /** A grade of this output's run is going. */
  grading: boolean
  /** A grade is being started, of this run or the other: one start at a time. */
  held: boolean
  onRegrade: () => void
  /** The output is still being written: it holds its place, and its run is graded when it is done. */
  writing: boolean
}

/**
 * One side's head in the band: its letter and the field that picks its
 * output, and nothing that judges it: the person reads the answers first, and
 * what to fix is the list under them. The line under the version says only
 * what tells it from the other side besides its version, and what went wrong.
 */
function SideHead({
  ctx,
  output,
  letter,
  apart,
  candidates,
  onPick,
  grading,
  writing,
  held,
  onRegrade,
  flip,
}: SideProps & {
  /** Its letter; null when it is the only output shown. */
  letter: string | null
  /** What tells it from the output beside it besides its version (`apartLine`). */
  apart: string | null
  /** Every output of the case, which its title picks from. */
  candidates: Output[]
  onPick: (output: Output | null) => void
  /** The head is half of the switch that says which output is on the stage. */
  flip: HeadFlip | null
}) {
  const scored = scoreOf(output, ctx.config)
  const ungraded = !scored || regradeOwed(scored)
  const failure = failureOf(output)
  return (
    <PairHead
      letter={letter ?? undefined}
      flip={flip}
      title={
        <OutputTitle output={output} letter={letter} candidates={candidates} onPick={onPick} />
      }
      action={
        // Grading is the next step for an output with no score, one whose grading failed part
        // way among them. One with a score is graded again from the header's menu, and says so
        // here while it is. One still being written is graded by its run when it is done, and
        // one cut short, or not finished for all the run says, is not graded.
        !writing && (grading || (ungraded && !output.cut)) ? (
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
      meta={
        apart || failure || scored?.stale.length ? (
          <>
            {apart ? <span>{apart}</span> : null}
            {failure ? <span className="text-destructive">{failure}</span> : null}
            {scored?.stale.map((reason) => (
              <span key={reason}>{reason}, so it has no score.</span>
            ))}
          </>
        ) : undefined
      }
    />
  )
}

/**
 * Whether an answer's transcript shows the skill read (`openedSkill`), so a
 * list can say the skill was never opened. Null for an answer without the
 * skill, and while the transcript loads.
 */
function useOpened(output: Output | null): boolean | null {
  const withSkill = output !== null && !isWithoutSkill(output.run)
  const { data } = useFetch(
    () =>
      output && withSkill
        ? api.transcript(output.run.name, output.sample.name)
        : Promise.resolve(null),
    [withSkill ? output?.key : null],
  )
  return withSkill ? openedSkill(data) : null
}

/** The reader's answers on one output's facts: the one being saved, and the way to give one. */
function useCorrect(ctx: Ctx, output: Output) {
  const { report, reload } = ctx
  const [pending, setPending] = useState<string | null>(null)
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
  return { pending, correct }
}

/**
 * Where a list's rows go: a rule SKILL.md still holds, the skill, and the case
 * while it stands. An answer written with the skill offers Fix with AI on a
 * rule it broke, while its case stands to be run again.
 */
function listActions(ctx: Ctx, output: Output) {
  const rules = new Set(ctx.state.rules.map((r) => r.text))
  const caseStands = ctx.state.cases.some((c) => c.id === output.caseId)
  return {
    ruleStands: (text: string) => rules.has(text),
    onOpenRule: (text: string) => ctx.go('editor', { file: 'SKILL.md', rule: text }),
    onOpenSkill: () => ctx.go('editor', { file: 'SKILL.md' }),
    onEditCase: caseStands ? () => ctx.go('cases', { id: output.caseId }) : null,
    fixRule:
      caseStands && !isWithoutSkill(output.run)
        ? (verdict: Verdict) => <FixWithAi ctx={ctx} output={output} verdict={verdict} />
        : null,
  }
}

/**
 * What one output missed, on its card under the stage. The card holds the
 * list and nothing else: the output itself is on the stage. Without a list
 * it says why in the list's place.
 */
function SideList({
  ctx,
  output,
  grading,
  writing,
  held,
  onRegrade,
  opened,
}: SideProps & { opened: boolean | null }) {
  const scored = scoreOf(output, ctx.config)
  const { pending, correct } = useCorrect(ctx, output)
  return (
    <OutputCard>
      {scored && outputRulesUnmarked(output) ? (
        // It stands where the list would, with the way to fill it.
        <Toolbar gap="md" className="px-4 py-3">
          <Hint>Graded before rules and checks were marked on this kind of output.</Hint>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={held}
            busy={grading}
            busyLabel="Grading…"
            onClick={onRegrade}
          >
            Regrade
          </Button>
        </Toolbar>
      ) : null}
      {scored ? (
        <Verdicts
          verdicts={scored.verdicts}
          pending={pending}
          onCorrect={correct}
          withSkill={!isWithoutSkill(output.run)}
          opened={opened}
          other={null}
          {...listActions(ctx, output)}
        />
      ) : (
        <Hint inset>
          {writing
            ? 'Graded when it is done.'
            : output.cut === 'stopped'
              ? 'Stopped before it finished, so it has no score.'
              : output.cut === 'failed'
                ? failedLine(output)
                : output.cut === 'unfinished'
                  ? 'Not finished, so it has no score.'
                  : 'Not graded yet.'}
        </Hint>
      )}
    </OutputCard>
  )
}

/**
 * Both outputs in view, and both with a list: the later one's list, on one
 * card, with a row naming A only where A stands otherwise, and on a rule only
 * where A was held to the rules. A side with no list keeps a card of its own,
 * which says why.
 */
function PairList({
  ctx,
  a,
  b,
  opened,
}: {
  ctx: Ctx
  a: Output
  b: Output
  opened: { a: boolean | null; b: boolean | null }
}) {
  const { pending, correct } = useCorrect(ctx, b)
  return (
    <OutputCard>
      <Verdicts
        verdicts={scoreOf(b, ctx.config)?.verdicts ?? []}
        pending={pending}
        onCorrect={correct}
        withSkill={!isWithoutSkill(b.run)}
        opened={opened.b}
        other={{
          letter: SLOT_LABEL.a,
          verdicts: scoreOf(a, ctx.config)?.verdicts ?? [],
          heldToRules: !isWithoutSkill(a.run) && opened.a !== false,
        }}
        {...listActions(ctx, b)}
      />
    </OutputCard>
  )
}
