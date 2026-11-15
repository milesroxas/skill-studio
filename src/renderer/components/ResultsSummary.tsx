/**
 * Every case at once: how far the cases have come since their first runs, how
 * many of them are checked on the skill as it is now, where each case stands,
 * the runs themselves, and the kind of work the skill is graded as. The
 * comparison of one case shows what changed; this answers "did my edits help,
 * and what is left to check", and is where a run is graded again or its cost read.
 *
 * A run with an output that has no score a grading would give it is graded
 * from here: one button over Runs grades every such run, an opened case
 * grades its own, and the band asks for it once nothing is left to run.
 */
import { isMissed } from '@domain/pack.ts'
import { Fragment, useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import type { Ctx } from '../ctx.ts'
import { type DeleteRun, useDeleteRun } from '../delete-run.ts'
import { gradingRun, useJobStart, writingRun } from '../job-start.ts'
import {
  asideLine,
  type CaseStand,
  caseTitle,
  cutOff,
  duration,
  failedLine,
  failureOf,
  fmt,
  gradedLine,
  isWithoutSkill,
  liftAsideLine,
  liftOf,
  money,
  type Output,
  plural,
  readParams,
  rulesUnmarked,
  runLabel,
  runStamp,
  runTitle,
  scoreOf,
  scoreOver,
  stamp,
  toGrade,
  totalOf,
  unreadOutput,
} from '../model.ts'
import { CaseStandings } from './CaseStandings.tsx'
import { Coverage } from './Coverage.tsx'
import { Disclosure } from './Disclosure.tsx'
import { GradedAs } from './GradedAs.tsx'
import { LiftFigure } from './Lift.tsx'
import {
  ColumnBody,
  ColumnHeader,
  ColumnLead,
  ColumnTitle,
  PlainList,
  Section,
  SectionHead,
  Spacer,
  Stack,
  Toolbar,
} from './layout.tsx'
import { TotalChip } from './Scores.tsx'
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

/** How many runs show before the rest wait under a button: the newest. */
const RUNS_CAP = 5

/** Newest first; a run that recorded no time comes last. */
const byNewest = (a: Ctx['state']['runs'][number], b: Ctx['state']['runs'][number]): number =>
  (b.meta?.createdAt ?? '').localeCompare(a.meta?.createdAt ?? '')

export function ResultsSummary({ ctx, standings }: { ctx: Ctx; standings: CaseStand[] }) {
  const { state, config, outputs, route, go, report, jobs, openRun: runCases } = ctx
  /** In the address, so Back from a case finds the same row still open: a case's (`open`) or a run's (`run`). */
  const openCase = route.params.get('open')
  const openRun = route.params.get('run')
  const show = (params: Record<string, string>) =>
    go('results', { view: 'all', ...params }, { replace: true })
  const setOpenCase = (id: string | null) => show(id ? { open: id } : {})
  const setOpenRun = (run: string | null) => show(run ? { run } : {})
  const [everyRun, setEveryRun] = useState(false)
  const grade = useJobStart(jobs, 'grade', report)
  // Asked for from a part of a score, such as Look: Graded as opens and comes into view.
  const askedGraded = route.params.get('graded') === '1'
  const graded = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (askedGraded) graded.current?.scrollIntoView({ block: 'start' })
  }, [askedGraded])
  // The newest run first: it is the one just made. A run without the skill is the score to
  // beat, not one more version: it closes the table, as it closes the lists that pick an output.
  const runs = [
    ...state.runs.filter((r) => !isWithoutSkill(r)).sort(byNewest),
    ...state.runs.filter(isWithoutSkill).sort(byNewest),
  ]
  // The open run shows even when it lies past the newest few.
  const folded =
    !everyRun && runs.length > RUNS_CAP && runs.findIndex((r) => r.name === openRun) < RUNS_CAP
  const byRun = new Map<string, Output[]>()
  for (const o of outputs) byRun.set(o.run.name, [...(byRun.get(o.run.name) ?? []), o])
  const showMean = standings.length > 1
  // Run, mean and the spare-width column: what an opened run spans.
  const columns = showMean ? 3 : 2
  const lift = liftOf(standings)
  // The version a run would test now, and the skill's cases that have a score on it.
  const version = state.versions.current.version
  const cases = standings.filter((s) => s.known)
  const behind = cases.filter((s) => !s.current)

  const titleOf = (run: string) => `Grade ${run}`
  const grading = (run: string) =>
    grade.busy(titleOf(run)) || gradingRun(jobs, state.skill.path, run)
  const regrade = (run: string) =>
    void grade.start([titleOf(run)], async () => {
      await api.grade(run)
      report(`Grading ${run}`)
    })
  // Runs with an output that has no score a grading would give it: one never graded, one whose
  // grading failed part way, or one graded before its case or the kinds the skill is graded as changed.
  // Without a key a grading would drop what Jev marked, so a run he graded is left to its own Regrade.
  const owed = runs
    .filter((run) => state.jevKey || !run.report?.model)
    .filter((run) =>
      (byRun.get(run.name) ?? []).some(
        (o) => !o.cut && !unreadOutput(o) && totalOf(o, config) === null,
      ),
    )
    .map((run) => run.name)
    .filter((run) => !writingRun(jobs, state.skill.path, run))
  const gradeRuns = (names: string[]) => {
    const idle = names.filter((run) => !grading(run))
    if (!idle.length) return
    void grade.start(idle.map(titleOf), async () => {
      for (const run of idle) await api.grade(run)
      report(`Grading ${plural(idle.length, 'run')}`)
    })
  }
  const gradeFrom = {
    owed: new Set(owed),
    busy: grading,
    waiting: grade.starting(),
    start: regrade,
  }
  // The cases behind whose run on this version only waits to be graded: grading checks them, a run would repeat it.
  const waiting = behind.filter((s) => {
    const run = toGrade(s)
    return run?.version === version && gradeFrom.owed.has(run.run.name)
  })
  const waitingRuns = [...new Set(waiting.map((s) => toGrade(s)?.run.name as string))]
  const unrun = behind.filter((s) => !waiting.includes(s))

  /** What a run answered, for the line under its name: the one case by its title, or how many. */
  const answered = (mine: Output[]): string | null => {
    const ids = [...new Set(mine.map((o) => o.caseId))]
    return ids.length === 1
      ? caseTitle(state, ids[0])
      : ids.length
        ? plural(ids.length, 'case')
        : null
  }

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
      {lift || cases.length ? (
        <ColumnLead>
          {lift ? <LiftFigure lift={lift} aside={liftAsideLine(standings, config)} /> : null}
          {cases.length ? (
            <Coverage
              checked={cases.length - behind.length}
              total={cases.length}
              version={version}
              scored={behind.some((s) => s.latest !== null)}
              onRun={() => runCases(unrun.map((s) => s.id))}
              ungraded={{
                cases: waiting.length,
                runs: waitingRuns.length,
                busy: waitingRuns.every(grading),
                waiting: grade.starting(),
                start: () => gradeRuns(waitingRuns),
              }}
            />
          ) : null}
        </ColumnLead>
      ) : null}
      <ColumnBody>
        <Section>
          <Hint>Scores are out of 100. Open a case to see what its answer missed.</Hint>
          <CaseStandings
            ctx={ctx}
            standings={standings}
            open={openCase}
            onOpen={setOpenCase}
            onRun={runCases}
            grade={gradeFrom}
          />
        </Section>
        <Section rule>
          <SectionHead>
            <Heading level={3}>Runs</Heading>
            {owed.length ? (
              <>
                <Spacer />
                <Toolbar>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={grade.starting()}
                    busy={owed.every(grading)}
                    busyLabel="Grading…"
                    onClick={() => gradeRuns(owed)}
                  >
                    {`Grade ${plural(owed.length, 'run')}`}
                  </Button>
                </Toolbar>
              </>
            ) : null}
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
              {(folded ? runs.slice(0, RUNS_CAP) : runs).map((run) => {
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
                            answered(mine),
                            runStamp(run),
                            cutOff(run, writingRun(jobs, state.skill.path, run.name))
                              ? 'not finished'
                              : null,
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
                          <Text weight="medium">{fmt(scoreOver(mine, config), 0)}</Text>
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
                            grading: grading(run.name),
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
          {runs.length > RUNS_CAP ? (
            <Toolbar>
              <Button
                type="button"
                variant="ghost-muted"
                size="xs"
                className="-ml-2"
                onClick={() => setEveryRun(folded)}
              >
                {folded ? `Show all ${runs.length} runs` : `Show the latest ${RUNS_CAP}`}
              </Button>
            </Toolbar>
          ) : null}
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
  const aside = asideLine(mine, config)
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
              {state.jevKey || view.report?.model ? 'Regrade' : 'Regrade without Jev'}
            </Button>
          </Toolbar>
        </SectionHead>
        <Hint>
          {view.report
            ? `Graded ${stamp(view.report.createdAt) ?? view.report.createdAt}${view.report.model ? (rulesUnmarked(view.report) ? ' by Jev, before rules and checks were marked on this kind of output. Regrade to see them.' : ' by Jev.') : ' without Jev: no rule or check is marked.'}`
            : 'Not graded yet.'}
        </Hint>
        {/* How much of its scores was counted, where Jev left some to the reader. */}
        {aside ? <Hint>{aside}</Hint> : null}
        {view.casesDamaged ? (
          <Hint tone="destructive">
            What this run's cases asked could not be read, so its outputs are judged on the cases as
            they are now.
          </Hint>
        ) : null}
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
            const missed = s?.verdicts.filter(isMissed) ?? []
            const failure = failureOf(o)
            const stopped = o.cut === 'stopped'
            const failed = failedLine(o)
            return (
              <TableRow
                key={o.key}
                align="baseline"
                variant={meta && !meta.ok && !stopped ? 'destructive' : 'default'}
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
                  {failure || stopped || failed || s?.stale.length || missed.length ? (
                    <PlainList gap="md">
                      {failure ? (
                        <Text as="li" size="xs" tone="destructive" measure>
                          {failure}
                        </Text>
                      ) : null}
                      {stopped ? (
                        <Text as="li" size="xs" tone="muted" measure>
                          Stopped before it finished.
                        </Text>
                      ) : null}
                      {failed ? (
                        <Text as="li" size="xs" tone="muted" measure>
                          {failed}
                        </Text>
                      ) : null}
                      {s?.stale.map((why) => (
                        <Text as="li" key={why} size="xs" tone="muted" measure>
                          {why}, so it has no score.
                        </Text>
                      ))}
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
