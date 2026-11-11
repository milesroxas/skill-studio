/**
 * Every case at once: how much the latest version gained, every run with a
 * score per case, and the kind of work the skill is graded as. The comparison
 * of one case shows what changed; this answers "did the edit help overall",
 * and is where a run is graded again or its cost read.
 */
import { mean } from '@domain/stats.ts'
import { Fragment } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { gradingRun, useJobStart } from '../job-start.ts'
import {
  casePair,
  casesRun,
  caseTitle,
  countsLine,
  countsOf,
  fmt,
  kindsLine,
  liftOf,
  money,
  type Output,
  plural,
  runLabel,
  runStamp,
  scoreOf,
  stamp,
  totalOf,
  versionName,
  versionOutputs,
  versionsRun,
  writerName,
} from '../model.ts'
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
  const caseIds = casesRun(state, outputs)
  const runs = state.runs
  const byRun = new Map<string, Output[]>()
  for (const o of outputs) byRun.set(o.run.name, [...(byRun.get(o.run.name) ?? []), o])
  const totalsOf = (list: Output[]) => list.map((o) => totalOf(o, config)).filter((t) => t !== null)
  const showMean = caseIds.length > 1
  // Cases some run answered more than once: their column holds room for the count in every row.
  const repeated = new Set(outputs.filter((o) => o.samples > 1).map((o) => o.caseId))
  // Run, one per case, mean and the spare-width column: what an opened run spans.
  const columns = 1 + caseIds.length + (showMean ? 1 : 0) + 1
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
          <Hint>
            Each cell is a case’s mean score out of 100. Open a score to read that output beside the
            one before it, or a run for its outputs.
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
                      {caseIds.map((c) => {
                        const cell = mine.filter((o) => o.caseId === c)
                        if (!cell.length)
                          return (
                            <TableCell key={c} numeric>
                              <Text tone="faint">–</Text>
                            </TableCell>
                          )
                        const total = mean(totalsOf(cell))
                        return (
                          <TableCell key={c} numeric>
                            <Button
                              type="button"
                              variant="ghost"
                              size="cell"
                              title={`Read ${c} from this run`}
                              aria-label={`${c}: ${total === null ? 'not graded' : Math.round(total)}${cell.length > 1 ? `, the mean of ${cell.length} outputs` : ''}. Read it.`}
                              onClick={() => go('results', readParams(outputs, c, cell[0]))}
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
                      <TableCell filler />
                    </TableRow>
                    {open ? (
                      <TableDetail colSpan={columns}>
                        <RunDetail
                          ctx={ctx}
                          run={run.name}
                          grading={
                            grade.busy(`Grade ${run.name}`) ||
                            gradingRun(jobs, state.skill.path, run.name)
                          }
                          waiting={grade.starting()}
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
        <Disclosure summary={`Graded as ${kindsLine(config.packs)}`}>
          <GradedAs ctx={ctx} />
        </Disclosure>
      </ColumnBody>
    </>
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
  grading,
  waiting,
  regrade,
}: {
  ctx: Ctx
  run: string
  /** A grade of this run is being started, or is still going. */
  grading: boolean
  /** A grade of some run is being started: one start at a time. */
  waiting: boolean
  regrade: (run: string) => void
}) {
  const { state, config, outputs, go } = ctx
  const view = state.runs.find((r) => r.name === run)
  if (!view) return null
  const mine = outputs.filter((o) => o.run.name === run)
  const metaOf = (o: Output) => view.meta?.samples.find((x) => x.dir === o.sample.name)
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
              onClick={() => go('editor', { version: view.meta?.skillVersion ?? '' })}
            >
              Changes since this run
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={waiting}
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
            ? `Graded ${stamp(view.report.createdAt) ?? view.report.createdAt} ${view.report.model ? `by Jev (${view.report.model})` : 'by code checks only'}, ${view.report.inputTokens.toLocaleString()} input tokens.`
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
    </Stack>
  )
}
