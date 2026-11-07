/** Runs against cases: totals per cell, cost and time per run, versions, cases. */

import { versionLift, writerKey } from '@domain/lift.ts'
import { mean } from '@domain/stats.ts'
import { Fragment, useState } from 'react'
import { api } from '../api.ts'
import { Term } from '../components/Help.tsx'
import { runningJob } from '../components/Jobs.tsx'
import { VersionLift } from '../components/Lift.tsx'
import {
  EmptyState,
  PlainList,
  Screen,
  Section,
  SectionHead,
  Spacer,
  Stack,
  Toolbar,
} from '../components/layout.tsx'
import { SampleCount, TotalChip } from '../components/Scores.tsx'
import { Heading, Hint, Text, VisuallyHidden } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
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
} from '../components/ui/table.tsx'
import type { Ctx } from '../ctx.ts'
import {
  caseTitle,
  fmt,
  money,
  moneyPlaces,
  type Output,
  runLabel,
  runStamp,
  runVersion,
  scoreOf,
  stamp,
  totalOf,
  versionName,
  writerName,
} from '../model.ts'

const costOf = (run: Ctx['state']['runs'][number]): number | null =>
  run.meta?.samples.reduce((s, x) => s + (x.costUsd ?? 0), 0) ?? null

export function Overview({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, toast, jobs } = ctx
  /** In the URL, so Back from a transcript or a comparison finds the run still open. */
  const openRun = route.params.get('run')
  const setOpenRun = (run: string | null) => go('overview', run ? { run } : {}, { replace: true })
  const [grading, setGrading] = useState<string | null>(null)
  const caseIds = [...new Set(outputs.map((o) => o.caseId))].sort()
  const runs = state.runs
  const byRun = new Map<string, Output[]>()
  for (const o of outputs) byRun.set(o.run.name, [...(byRun.get(o.run.name) ?? []), o])
  const totalsOf = (list: Output[]) => list.map((o) => totalOf(o, config)).filter((t) => t !== null)
  const flagsOf = (list: Output[]) =>
    list.reduce((s, o) => s + (scoreOf(o, config)?.flags.length ?? 0), 0)
  const showMean = caseIds.length > 1
  const showFlags = runs.some((run) => flagsOf(byRun.get(run.name) ?? []) > 0)
  // Cases some run answered more than once: their column holds room for the count in every row.
  const repeated = new Set(outputs.filter((o) => o.samples > 1).map((o) => o.caseId))
  const costPlaces = moneyPlaces(runs.map(costOf))
  // Run, one per case, mean, cost, time, flags and the spare-width column: what an opened run spans.
  // A narrow window hides cost, time and flags; a span past the last column is harmless.
  const columns = 1 + caseIds.length + (showMean ? 1 : 0) + 2 + (showFlags ? 1 : 0) + 1
  const lift = versionLift(
    runs.map((run) => ({
      name: run.name,
      version: runVersion(run),
      writer: writerKey(run.meta?.writer),
      configuration: run.meta?.configuration ?? 'with_skill',
      createdAt: run.meta?.createdAt ?? '',
      mean: mean(totalsOf(byRun.get(run.name) ?? [])),
    })),
  )
  const liftWriter = (name: string) => writerName(runs.find((r) => r.name === name)?.meta?.writer)

  const regrade = async (run: string) => {
    setGrading(run)
    try {
      await api.grade(run, state.jevKey)
      toast(`Grading ${run}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setGrading(null)
    }
  }

  if (!runs.length)
    return (
      <EmptyState
        size="screen"
        title="No runs yet"
        actions={
          state.cases.length ? (
            <Button type="button" onClick={() => go('generate')}>
              Start a run
            </Button>
          ) : (
            <Button type="button" onClick={() => go('cases', { new: '1' })}>
              Add a case
            </Button>
          )
        }
      >
        A run has an agent answer each case with {state.skill.name} installed, then grades the
        outputs.{' '}
        {state.cases.length
          ? `${state.cases.length === 1 ? 'One case is' : `${state.cases.length} cases are`} ready.`
          : 'Write a case first.'}
      </EmptyState>
    )

  return (
    <Screen>
      {lift ? <VersionLift lift={lift} writer={liftWriter(lift.latest.name)} /> : null}
      <Section>
        <Hint>
          Each cell is a case’s mean score out of 100. Open a score to compare its outputs, or a run
          for its details.
        </Hint>
        <Table bleed>
          <TableHeader>
            <TableRow>
              <TableHead wide>Run</TableHead>
              {caseIds.map((c) => (
                <TableHead key={c} numeric title={caseTitle(state, c)}>
                  {c}
                </TableHead>
              ))}
              {showMean ? <TableHead numeric>Mean</TableHead> : null}
              <TableHead numeric optional>
                Cost
              </TableHead>
              <TableHead numeric optional>
                Time
              </TableHead>
              {showFlags ? (
                <TableHead numeric optional>
                  Flags
                </TableHead>
              ) : null}
              <TableHead filler />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const mine = byRun.get(run.name) ?? []
              const seconds = run.meta?.samples.reduce((s, x) => s + x.seconds, 0) ?? 0
              const open = openRun === run.name
              const toggle = () => setOpenRun(open ? null : run.name)
              return (
                <Fragment key={run.name}>
                  <TableRow interactive onClick={rowAction(toggle)}>
                    <TableCell wrap wide>
                      <TableRowToggle
                        open={open}
                        title={`${run.name}: ${open ? 'hide' : 'show'} its outputs`}
                        meta={`${runStamp(run)}${run.meta?.note ? ` · ${run.meta.note}` : ''}`}
                        onClick={toggle}
                      >
                        {runLabel(run)}
                      </TableRowToggle>
                    </TableCell>
                    {caseIds.map((c) => {
                      const cell = mine.filter((o) => o.caseId === c)
                      if (!cell.length)
                        return (
                          <TableCell key={c} numeric>
                            <Text tone="muted">–</Text>
                          </TableCell>
                        )
                      const total = mean(totalsOf(cell))
                      return (
                        <TableCell key={c} numeric>
                          <Button
                            type="button"
                            variant="ghost"
                            size="cell"
                            title={`Compare ${c} from this run`}
                            aria-label={`${c}: ${total === null ? 'not graded' : Math.round(total)}${cell.length > 1 ? `, the mean of ${cell.length} outputs` : ''}. Compare.`}
                            onClick={() => go('compare', { a: cell[0].key })}
                          >
                            <TotalChip total={total === null ? null : Math.round(total)} />
                            {repeated.has(c) ? <SampleCount count={cell.length} /> : null}
                          </Button>
                        </TableCell>
                      )
                    })}
                    {showMean ? (
                      <TableCell numeric>
                        <Text weight="medium">{fmt(mean(totalsOf(mine)), 0)}</Text>
                      </TableCell>
                    ) : null}
                    <TableCell numeric optional>
                      {money(costOf(run), costPlaces)}
                    </TableCell>
                    <TableCell numeric optional>
                      {seconds ? `${seconds}s` : '–'}
                    </TableCell>
                    {showFlags ? (
                      <TableCell numeric optional>
                        {flagsOf(mine) || ''}
                      </TableCell>
                    ) : null}
                    <TableCell filler />
                  </TableRow>
                  {open ? (
                    <TableDetail colSpan={columns}>
                      <RunDetail
                        ctx={ctx}
                        run={run.name}
                        grading={
                          grading === run.name ||
                          Boolean(runningJob(jobs, 'grade', `Grade ${run.name}`))
                        }
                        regrade={regrade}
                      />
                    </TableDetail>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </Section>
    </Screen>
  )
}

function RunDetail({
  ctx,
  run,
  grading,
  regrade,
}: {
  ctx: Ctx
  run: string
  /** A grade of this run is being started, or is still going. */
  grading: boolean
  regrade: (run: string) => void
}) {
  const { state, config, outputs, go } = ctx
  const view = state.runs.find((r) => r.name === run)
  if (!view) return null
  const mine = outputs.filter((o) => o.run.name === run)
  const metaOf = (o: Output) => view.meta?.samples.find((x) => x.dir === o.sample.name)
  const costPlaces = moneyPlaces(mine.map((o) => metaOf(o)?.costUsd))
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <SectionHead>
          <Heading level={3}>{versionName(view)}</Heading>
          <Text font="mono" tone="muted" size="xs">
            {view.name}
          </Text>
          <Spacer />
          <Toolbar>
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
              onClick={() =>
                go('versions', { left: view.meta?.skillVersion ?? 'current', right: 'current' })
              }
            >
              Changes since this run
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              busy={grading}
              busyLabel="Grading…"
              onClick={() => regrade(run)}
            >
              {state.jevKey ? 'Regrade' : 'Regrade with code checks'}
            </Button>
          </Toolbar>
        </SectionHead>
        <Hint>
          {view.report
            ? `Graded ${stamp(view.report.createdAt) ?? view.report.createdAt} with ${view.report.model ?? 'code checks only'}, ${view.report.inputTokens.toLocaleString()} input tokens.`
            : 'Not graded yet.'}
        </Hint>
      </Stack>
      <Table bleed>
        <TableHeader>
          <TableRow>
            <TableHead>Output</TableHead>
            <TableHead numeric>Total</TableHead>
            <TableHead numeric optional>
              Words
            </TableHead>
            <TableHead numeric optional>
              Cost
            </TableHead>
            <TableHead numeric optional>
              Time
            </TableHead>
            <TableHead numeric optional>
              Tool calls
            </TableHead>
            <TableHead>
              <Term id="flag">Flags</Term>
            </TableHead>
            <TableHead trailing>
              <VisuallyHidden>Open</VisuallyHidden>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mine.map((o) => {
            const s = scoreOf(o, config)
            const meta = metaOf(o)
            return (
              <TableRow
                key={o.key}
                align="baseline"
                variant={meta && !meta.ok ? 'destructive' : 'default'}
              >
                <TableCell>
                  <Text font="mono">{o.sample.name}</Text>
                </TableCell>
                <TableCell numeric>
                  <TotalChip total={s?.scores.total} />
                </TableCell>
                <TableCell numeric optional>
                  {o.result?.words ?? '–'}
                </TableCell>
                <TableCell numeric optional>
                  {money(meta?.costUsd, costPlaces)}
                </TableCell>
                <TableCell numeric optional>
                  {meta ? `${meta.seconds}s` : '–'}
                </TableCell>
                <TableCell numeric optional>
                  {meta?.toolCalls ?? '–'}
                </TableCell>
                <TableCell wrap>
                  {meta?.error || s?.flags.length ? (
                    <PlainList gap="md">
                      {meta?.error ? (
                        <Text as="li" size="xs" tone="destructive" measure>
                          {meta.error}
                        </Text>
                      ) : null}
                      {s?.flags.map((flag) => (
                        <Text as="li" key={flag} size="xs" measure>
                          {flag}
                        </Text>
                      ))}
                    </PlainList>
                  ) : null}
                </TableCell>
                <TableCell trailing>
                  <Toolbar gap="md" justify="end" wrap={false}>
                    <Button
                      type="button"
                      variant="link-muted"
                      size="cell-inline"
                      aria-label={`Compare ${o.sample.name}`}
                      onClick={() => go('compare', { a: o.key })}
                    >
                      Compare
                    </Button>
                    {o.sample.hasTranscript ? (
                      <Button
                        type="button"
                        variant="link-muted"
                        size="cell-inline"
                        aria-label={`Transcript of ${o.sample.name}`}
                        onClick={() => go('transcript', { run, sample: o.sample.name })}
                      >
                        Transcript
                      </Button>
                    ) : null}
                  </Toolbar>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Stack>
  )
}
