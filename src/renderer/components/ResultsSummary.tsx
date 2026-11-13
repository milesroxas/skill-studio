/**
 * Every case at once: how much the latest version gained, each case's score
 * in every run, the runs themselves, and the kind of work the skill is graded
 * as. The comparison of one case shows what changed; this answers "did the
 * edit help overall", and is where a run is graded again or its cost read.
 */
import { mean } from '@domain/stats.ts'
import { Fragment, useEffect, useRef } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { type DeleteRun, useDeleteRun } from '../delete-run.ts'
import { gradingRun, useJobStart, writingRun } from '../job-start.ts'
import {
  casePair,
  casesRun,
  caseTitle,
  countsLine,
  countsOf,
  fmt,
  gradedLine,
  isWithoutSkill,
  liftOf,
  modelShort,
  money,
  type Output,
  plural,
  rulesUnmarked,
  runLabel,
  runStamp,
  runTitle,
  scoreOf,
  stamp,
  totalOf,
  versionOutputs,
  versionsRun,
  writerName,
} from '../model.ts'
import { after, useLanded } from '../motion.ts'
import { Disclosure } from './Disclosure.tsx'
import { GradedAs } from './GradedAs.tsx'
import { VersionLift } from './Lift.tsx'
import {
  ColumnBody,
  ColumnHeader,
  ColumnTitle,
  PlainList,
  Section,
  SectionHead,
  Spacer,
  Stack,
  Toolbar,
} from './layout.tsx'
import { SampleCount, TotalChip } from './Scores.tsx'
import { Heading, Hint, Text, VisuallyHidden } from './text.tsx'
import { Button } from './ui/button.tsx'
import {
  rowAction,
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TableHead,
  TableHeader,
  TableRow,
  TableRowToggle,
} from './ui/table.tsx'

const costOf = (run: Ctx['state']['runs'][number]): number | null =>
  run.meta?.samples.reduce((s, x) => s + (x.costUsd ?? 0), 0) ?? null

/** "2m 14s", or "38s" under a minute. */
const duration = (seconds: number): string =>
  seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`

export function ResultsSummary({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, report, jobs } = ctx
  /** In the address, so Back from a case finds the run still open. */
  const openRun = route.params.get('run')
  const setOpenRun = (run: string | null) =>
    go('results', run ? { view: 'all', run } : { view: 'all' }, { replace: true })
  const grade = useJobStart(jobs, 'grade', report)
  // Asked for from a part of a score, such as Look: Graded as opens and comes into view.
  const askedGraded = route.params.get('graded') === '1'
  const graded = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (askedGraded) graded.current?.scrollIntoView({ block: 'start' })
  }, [askedGraded])
  const caseIds = casesRun(state, outputs)
  // A run without the skill is the score to beat, not one more version: it closes the table,
  // as it closes the lists that pick an output.
  const runs = [
    ...state.runs.filter((r) => !isWithoutSkill(r)),
    ...state.runs.filter(isWithoutSkill),
  ]
  const byRun = new Map<string, Output[]>()
  for (const o of outputs) byRun.set(o.run.name, [...(byRun.get(o.run.name) ?? []), o])
  const totalsOf = (list: Output[]) => list.map((o) => totalOf(o, config)).filter((t) => t !== null)
  const showMean = caseIds.length > 1
  // Runs that answered a case more than once: their column holds room for the count in every row.
  const repeated = new Set(outputs.filter((o) => o.samples > 1).map((o) => o.run.name))
  // A column is headed by the run's version and model; two that read the same also say when they ran.
  const headOf = (run: (typeof runs)[number]) =>
    `${runTitle(run, { short: true })}\n${modelShort(run.meta?.writer)}`
  const heads = runs.map(headOf)
  const twin = (run: (typeof runs)[number]) =>
    heads.filter((head) => head === headOf(run)).length > 1
  // Run, mean and the spare-width column: what an opened run spans.
  const columns = showMean ? 3 : 2
  const lift = liftOf(state, outputs, config)
  const liftWriter = (name: string) => writerName(runs.find((r) => r.name === name)?.meta?.writer)
  // The latest version's facts, added up: the score said as what it is counted from.
  const latest = versionsRun(outputs).at(-1) ?? null
  const counts = latest ? countsLine(countsOf(versionOutputs(outputs, latest), config)) : null

  const regrade = (run: string) =>
    void grade.start([`Grade ${run}`], async () => {
      await api.grade(run, state.jevKey)
      report(`Grading ${run}`)
    })

  return (
    <>
      <ColumnHeader>
        <ColumnTitle>
          <Heading level={2} as="h2">
            All cases
          </Heading>
          <Hint as="span">{plural(runs.length, 'run')}</Hint>
        </ColumnTitle>
      </ColumnHeader>
      <ColumnBody>
        {lift ? <VersionLift lift={lift} writer={liftWriter(lift.latest.name)} /> : null}
        <Section>
          {counts ? (
            <Text as="p" size="ui" tabular>
              <Text weight="medium">{latest}</Text> <Text tone="muted">· {counts}</Text>
            </Text>
          ) : null}
          <Hint>Scores are out of 100. Open one to read that output.</Hint>
          {/* Cases down the side, so each is read by its whole title, in the room the runs leave; runs across, oldest first. */}
          <Table bleed>
            <TableHeader>
              <TableRow>
                <TableHead wrap>Case</TableHead>
                {runs.map((run) => (
                  <TableHead key={run.name} numeric>
                    <Text block weight="medium" tone="default">
                      {runTitle(run, { short: true })}
                    </Text>
                    <Text block weight="normal" title={writerName(run.meta?.writer)}>
                      {modelShort(run.meta?.writer)}
                    </Text>
                    {twin(run) ? (
                      <Text block weight="normal">
                        {runStamp(run)}
                      </Text>
                    ) : null}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {caseIds.map((c, row) => (
                <TableRow key={c}>
                  <TableCell wrap>{caseTitle(state, c)}</TableCell>
                  {runs.map((run) => {
                    const cell = (byRun.get(run.name) ?? []).filter((o) => o.caseId === c)
                    return (
                      <TableCell key={run.name} trailing>
                        <ScoreCell
                          name={`${caseTitle(state, c)}, ${runLabel(run)}`}
                          outputs={cell.length}
                          total={cell.length ? mean(totalsOf(cell)) : null}
                          writing={writingRun(jobs, state.skill.path, run.name)}
                          grading={gradingRun(jobs, state.skill.path, run.name)}
                          repeated={repeated.has(run.name)}
                          row={row}
                          onRead={() => cell[0] && go('results', readParams(outputs, c, cell[0]))}
                        />
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section>
          <SectionHead>
            <Heading level={3}>Runs</Heading>
          </SectionHead>
          <Hint>Open one to see all of its outputs, grade it again or delete it.</Hint>
          <Table bleed>
            <TableHeader>
              <TableRow>
                <TableHead wide>Run</TableHead>
                {showMean ? <TableHead numeric>Mean</TableHead> : null}
                <TableHead filler />
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const mine = byRun.get(run.name) ?? []
                const seconds = run.meta?.samples.reduce((s, x) => s + x.seconds, 0) ?? 0
                const cost = costOf(run)
                const open = openRun === run.name
                const toggle = () => setOpenRun(open ? null : run.name)
                return (
                  <Fragment key={run.name}>
                    <TableRow interactive onClick={rowAction(toggle)}>
                      <TableCell wrap wide>
                        <TableRowToggle
                          open={open}
                          title={`${run.name}: ${open ? 'hide' : 'show'} its outputs`}
                          meta={[
                            runStamp(run),
                            seconds ? duration(seconds) : null,
                            cost ? money(cost) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          onClick={toggle}
                        >
                          {runLabel(run)}
                        </TableRowToggle>
                      </TableCell>
                      {showMean ? (
                        <TableCell numeric>
                          <Text weight="medium">{fmt(mean(totalsOf(mine)), 0)}</Text>
                        </TableCell>
                      ) : null}
                      <TableCell filler />
                    </TableRow>
                    {open ? (
                      <TableDetail colSpan={columns}>
                        <RunDetail
                          ctx={ctx}
                          run={run.name}
                          busy={{
                            grading:
                              grade.busy(`Grade ${run.name}`) ||
                              gradingRun(jobs, state.skill.path, run.name),
                            writing: writingRun(jobs, state.skill.path, run.name),
                            waiting: grade.starting(),
                          }}
                          regrade={regrade}
                          closed={() => setOpenRun(null)}
                        />
                      </TableDetail>
                    ) : null}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </Section>
        <div ref={graded}>
          <Disclosure summary={gradedLine(config.packs)} defaultOpen={askedGraded}>
            <GradedAs ctx={ctx} />
          </Disclosure>
        </div>
      </ColumnBody>
    </>
  )
}

/** How far apart, down a column, the scores of one grading tick in. */
const LAND_STEP_MS = 40

/**
 * One case's score in one run. Only a cell that opens something looks like it
 * does: a score, or "Not graded" for an output with none yet, opens the
 * output. A cell with nothing to open says why in faint words, "Not run",
 * "Writing…" or "Grading…", and is no button. A score that comes while the
 * table is in view ticks in, down its column in turn; one there when the view
 * opened is at rest.
 */
function ScoreCell({
  name,
  outputs,
  total,
  writing,
  grading,
  repeated,
  row,
  onRead,
}: {
  /** The case and the run, for a screen reader. */
  name: string
  /** How many outputs the run made for the case. */
  outputs: number
  /** Their mean score; null when none is graded. */
  total: number | null
  writing: boolean
  grading: boolean
  /** The column holds room for a count of outputs. */
  repeated: boolean
  row: number
  onRead: () => void
}) {
  const waiting = (outputs === 0 && writing) || (outputs > 0 && total === null)
  const landed = useLanded(waiting)
  const slot = repeated ? <SampleCount count={0} /> : null
  if (outputs === 0 || (total === null && grading))
    return (
      <span className="inline-flex items-center gap-1">
        <Text tone="faint" size="xs">
          {outputs === 0 ? (writing ? 'Writing…' : 'Not run') : 'Grading…'}
        </Text>
        {slot}
      </span>
    )
  if (total === null)
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          type="button"
          variant="link-muted"
          size="cell-inline"
          aria-label={`${name}: not graded yet. Read it.`}
          onClick={onRead}
        >
          Not graded
        </Button>
        {slot}
      </span>
    )
  const shown = Math.round(total)
  return (
    <Button
      type="button"
      variant="ghost"
      size="cell"
      className={landed ? 'animate-tick' : undefined}
      style={landed ? after(row * LAND_STEP_MS) : undefined}
      aria-label={`${name}: ${shown}${outputs > 1 ? `, the mean of ${outputs} outputs` : ''}. Read it.`}
      onClick={onRead}
    >
      <TotalChip total={shown} />
      {repeated ? <SampleCount count={outputs} /> : null}
    </Button>
  )
}

/**
 * The address that reads `output` on the right: beside the output its case
 * opens with on the left, unless it is that one itself.
 */
function readParams(outputs: Output[], caseId: string, output: Output): Record<string, string> {
  const { a, b } = casePair(outputs, caseId)
  const beside = [a, b].find((o) => o && o.key !== output.key) ?? null
  return { case: caseId, a: beside?.key ?? '', b: output.key }
}

function RunDetail({
  ctx,
  run,
  busy,
  regrade,
  closed,
}: {
  ctx: Ctx
  run: string
  busy: {
    /** A grade of this run is being started, or is still going. */
    grading: boolean
    /** A job is still writing this run's outputs. */
    writing: boolean
    /** A grade of some run is being started: one start at a time. */
    waiting: boolean
  }
  regrade: (run: string) => void
  /** The run is gone: close its row. */
  closed: () => void
}) {
  const { state, config, outputs, go } = ctx
  const del = useDeleteRun(ctx, run, busy, closed)
  const view = state.runs.find((r) => r.name === run)
  if (!view) return null
  const mine = outputs.filter((o) => o.run.name === run)
  const metaOf = (o: Output) => view.meta?.samples.find((x) => x.dir === o.sample.name)
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <SectionHead>
          <Heading level={3}>{runTitle(view)}</Heading>
          <Text font="mono" tone="muted" size="xs">
            {view.name}
          </Text>
          <Spacer />
          <Toolbar>
            {/* A run without the skill used none, so no change to the skill came after it. */}
            {isWithoutSkill(view) ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!view.meta?.skillVersion}
                title={
                  view.meta?.skillVersion
                    ? undefined
                    : 'This run did not record which version of the skill it used.'
                }
                onClick={() => go('editor', { version: view.meta?.skillVersion ?? '' })}
              >
                Changes since this run
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={del.held}
              busy={busy.grading}
              busyLabel="Grading…"
              onClick={() => regrade(run)}
            >
              {state.jevKey ? 'Regrade' : 'Regrade without Jev'}
            </Button>
          </Toolbar>
        </SectionHead>
        <Hint>
          {view.report
            ? `Graded ${stamp(view.report.createdAt) ?? view.report.createdAt}${view.report.model ? (rulesUnmarked(view.report) ? ' by Jev, before rules and checks were marked on this kind of output. Regrade to see them.' : ' by Jev.') : ' without Jev: no rule or check is marked.'}`
            : 'Not graded yet.'}
        </Hint>
      </Stack>
      <Table bleed>
        <TableHeader>
          <TableRow>
            <TableHead>Output</TableHead>
            <TableHead numeric>Score</TableHead>
            <TableHead wide>Missed</TableHead>
            <TableHead trailing>
              <VisuallyHidden>Open</VisuallyHidden>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mine.map((o) => {
            const s = scoreOf(o, config)
            const meta = metaOf(o)
            const missed = s?.verdicts.filter((v) => !v.met) ?? []
            return (
              <TableRow
                key={o.key}
                align="baseline"
                variant={meta && !meta.ok ? 'destructive' : 'default'}
              >
                <TableCell>
                  <Text font="mono">{o.sample.name}</Text>
                  {meta ? (
                    <Text block tone="muted" size="xs" tabular>
                      {[
                        `${meta.seconds}s`,
                        meta.costUsd === null ? null : money(meta.costUsd),
                        plural(meta.toolCalls, 'tool call'),
                        o.result?.words ? plural(o.result.words, 'word') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </TableCell>
                <TableCell numeric>
                  <TotalChip total={s?.scores.total} />
                </TableCell>
                <TableCell wrap wide>
                  {meta?.error || missed.length ? (
                    <PlainList gap="md">
                      {meta?.error ? (
                        <Text as="li" size="xs" tone="destructive" measure>
                          {meta.error}
                        </Text>
                      ) : null}
                      {missed.map((v, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: two rules may read the same
                        <Text as="li" key={`${v.id}#${i}`} size="xs" measure>
                          {v.text}
                        </Text>
                      ))}
                    </PlainList>
                  ) : null}
                </TableCell>
                <TableCell trailing>
                  <Button
                    type="button"
                    variant="link-muted"
                    size="cell-inline"
                    aria-label={`Read ${o.sample.name}`}
                    onClick={() => go('results', readParams(outputs, o.caseId, o))}
                  >
                    Read
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <DeleteRunFoot del={del} />
    </Stack>
  )
}

/** Delete run, apart from Regrade and below what it deletes: alone in its section. */
function DeleteRunFoot({ del }: { del: DeleteRun }) {
  return (
    <Toolbar>
      <Button
        type="button"
        variant="destructive-outline"
        size="sm"
        disabled={del.blocked !== undefined}
        title={del.blocked}
        busy={del.deleting}
        busyLabel="Deleting…"
        onClick={del.remove}
      >
        Delete run
      </Button>
    </Toolbar>
  )
}
