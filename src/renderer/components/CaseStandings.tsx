/**
 * All cases' table: one row per case, saying where it stands on the skill as
 * it is now. A case is run when its writer chooses, so each row is read against
 * the case's own runs. Where the cases are read on their checks (`checks`), a
 * row is how many checks the answer it is read against met, how many its
 * newest met, and whether it got better, stayed the same or got worse; else
 * it is its latest score, the run it came from and how it moved from the run
 * before. The cases
 * checked on the version a run would test now come first, then the ones that
 * are not, each group with what needs a look on top. The columns stay four
 * however many runs there are; a long list shows its first rows and a field
 * that finds a case by name.
 *
 * A row holds answers to one request. Answers written before a case's prompt
 * or files changed stand in a row of their own, in a group after the skill's
 * cases, and so do the answers to a case since deleted.
 *
 * Opening a row says what happened in one sentence, what the answer missed,
 * and the one step to take next, with the case's other runs beside it. Where
 * a run only waits to be graded, that step is to grade it.
 */
import { isMissed } from '@domain/pack.ts'
import { attemptsOf, byNeed } from '@domain/standing.ts'
import { XIcon } from 'lucide-react'
import { Fragment, useState } from 'react'
import { type CaseRead, compared, rowVersion, type SideName, sideCount } from '../case-checks.ts'
import type { Ctx } from '../ctx.ts'
import { useToggleSet } from '../hooks.ts'
import { gradingRun, writingRun } from '../job-start.ts'
import {
  asideLine,
  attemptsLine,
  type CaseStand,
  type CaseTry,
  changeLine,
  isWithoutSkill,
  modelShort,
  type Output,
  plural,
  readParams,
  regradeOwed,
  runStamp,
  runTitle,
  scoreOf,
  spreadWords,
  standingUnshared,
  toGrade,
  totalOf,
  unreadOutput,
  writerName,
} from '../model.ts'
import { ChecksChange } from './CaseChecks.tsx'
import { PlainList, Rows, Stack, Toolbar } from './layout.tsx'
import { Delta, ListScore, SampleCount, TotalChip } from './Scores.tsx'
import { Hint, Said, Text } from './text.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'
import {
  rowAction,
  Table,
  TableBody,
  TableCell,
  TableDetail,
  TableGroupHead,
  TableHead,
  TableHeader,
  TableRow,
  TableRowToggle,
} from './ui/table.tsx'

/** Case, last run, score, change; or case, the two sides' checks met, change. */
const COLUMNS = 4
/** How many rows of a group show before the rest wait under a button. */
const CAP = 8
/** The same for an opened case: its runs, and the rules it missed. */
const HISTORY_CAP = 4
const MISSED_CAP = 3
/** A name longer than this is cut in its row, so an opened case says it whole. */
const LONG_NAME = 44

/** A run in a few words: "v12 · Opus", or "Without skill · Opus". */
const tryName = (t: CaseTry): string =>
  `${runTitle(t.run, { short: true })} · ${modelShort(t.run.meta?.writer)}`

/** The version a run tested, inside a sentence. */
const versionOf = (t: CaseTry): string => runTitle(t.run, { short: true })

/** The output of a run that stands for it: the first with a score, else the first. */
const outputOf = (t: CaseTry, ctx: Ctx): Output =>
  t.outputs.find((o) => totalOf(o, ctx.config) !== null) ?? t.outputs[0]

/** Grading a run from a case's row: the runs a grading would give a score, and the step that starts one. */
export interface GradeRuns {
  /** The runs with an output that has no score a grading would give it. */
  owed: ReadonlySet<string>
  /** A grade of this run is being started, or is still going. */
  busy: (run: string) => boolean
  /** A grade of some run is being started: one start at a time. */
  waiting: boolean
  start: (run: string) => void
}

/**
 * Why a run of a case has no score, in a word or two: it is being written or
 * graded now, or it was cut short, or its grading no longer holds, or nothing
 * has graded it. `opens` is false while a job is still at work on it, when
 * there is nothing whole to read.
 */
function unscored(t: CaseTry, ctx: Ctx): { word: string; says: string; opens: boolean } {
  const { jobs, state } = ctx
  if ((t.cut === null || t.cut === 'unfinished') && writingRun(jobs, state.skill.path, t.run.name))
    return { word: 'Writing…', says: 'still being written', opens: false }
  if (!t.cut && gradingRun(jobs, state.skill.path, t.run.name))
    return { word: 'Grading…', says: 'being graded', opens: false }
  if (t.cut === 'stopped')
    return { word: 'Stopped', says: 'stopped before it finished', opens: true }
  if (t.cut === 'failed') return { word: 'Failed', says: 'could not finish', opens: true }
  if (t.cut === 'unfinished') return { word: 'Not finished', says: 'not finished', opens: true }
  if (t.outputs.every(unreadOutput))
    return { word: 'No score', says: 'on a file Jev cannot read', opens: true }
  // Graded, and held to something else since: its output says what.
  if (t.outputs.some((o) => regradeOwed(scoreOf(o, ctx.config))))
    return { word: 'Needs grading', says: 'to be graded again', opens: true }
  return { word: 'Not graded', says: 'not graded yet', opens: true }
}

/** Why a run of a case has no score, in the table's word for it: "Writing…", "Not graded". */
export const unscoredWord = (t: CaseTry, ctx: Ctx): string => unscored(t, ctx).word

/** The cases read on their checks, by row, and what the two columns of marks are headed by. */
export interface ChecksTable {
  reads: ReadonlyMap<string, CaseRead>
  names: { from: SideName; to: SideName }
}

/**
 * What a case with a score is waiting on: a newer run that has none yet. A
 * stopped run is the reader's own doing, and one that failed has nothing more
 * to come: neither is waited on, so each is left to the case's list of runs.
 */
function waitingOn(standing: CaseStand, ctx: Ctx): string | null {
  const { latest, tries } = standing
  const newer = latest ? tries.slice(tries.indexOf(latest) + 1) : tries
  const next = newer.findLast(
    (t) =>
      t.score === null &&
      t.cut !== 'stopped' &&
      t.cut !== 'failed' &&
      !t.outputs.every(unreadOutput),
  )
  if (!next) return null
  const { word } = unscored(next, ctx)
  return word.endsWith('…')
    ? `${word.slice(0, -1)} ${versionOf(next)}…`
    : `${versionOf(next)} ${word.toLowerCase()}`
}

export function CaseStandings({
  ctx,
  standings,
  open,
  onOpen,
  onRun,
  grade,
  checks = null,
}: {
  ctx: Ctx
  standings: CaseStand[]
  /** Read on checks: the two sides' checks met in place of the last run and its score. */
  checks?: ChecksTable | null
  /** The row that is open, by its key. */
  open: string | null
  onOpen: (key: string | null) => void
  /** Open Run on these cases. */
  onRun: (cases: string[]) => void
  grade: GradeRuns
}) {
  const { state } = ctx
  const version = state.versions.current.version
  const [find, setFind] = useState('')
  const [whole, toggleWhole] = useToggleSet<string>([])
  const query = find.trim().toLowerCase()
  const groups = [
    {
      id: 'checked',
      title: `Checked on ${version}`,
      rows: standings.filter((s) => s.known && s.current),
    },
    {
      id: 'behind',
      title: `Not checked on ${version} yet`,
      rows: standings.filter((s) => s.known && !s.current),
    },
    {
      id: 'earlier',
      title: 'Answered before the case changed',
      rows: standings.filter((s) => s.earlier),
    },
    {
      id: 'gone',
      title: 'No longer in Cases',
      rows: standings.filter((s) => !s.known && !s.earlier),
    },
  ]
    .filter((group) => group.rows.length)
    .map((group) => ({ ...group, rows: group.rows.sort(byNeed) }))
  // With every case checked there is one group, and its name would say what the head already does.
  const headed = groups.length > 1 || groups[0]?.id !== 'checked'
  // A count of attempts beside one score holds its room beside them all, so the chips keep one edge.
  const repeated = standings.some((s) => (s.latest?.scored ?? 0) > 1)
  const found = groups
    .map((group) => ({
      ...group,
      hits: query ? group.rows.filter((s) => s.title.toLowerCase().includes(query)) : group.rows,
    }))
    .filter((group) => group.hits.length)

  return (
    <>
      {standings.length > CAP ? (
        <Toolbar>
          <Input
            type="search"
            enterKeyHint="search"
            size="sm"
            width="search"
            aria-label="Find a case"
            placeholder="Find a case"
            autoComplete="off"
            spellCheck={false}
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
        </Toolbar>
      ) : null}
      {found.length ? (
        <Table
          bleed
          stick
          // Read on checks, the two sides' columns keep their width whatever a filter leaves, and the case takes the rest.
          layout={checks ? 'fixed' : 'auto'}
        >
          <TableHeader>
            {checks ? (
              // The older side folds away first as the table narrows, then the newer: the case and its change stay.
              <TableRow>
                <TableHead clip>Case</TableHead>
                <TableHead col="lg" fold="first">
                  {checks.names.from.name}
                </TableHead>
                <TableHead col="lg" fold="narrowest">
                  {checks.names.to.name}
                </TableHead>
                <TableHead col="sm" trailing>
                  Change
                </TableHead>
              </TableRow>
            ) : (
              <TableRow>
                <TableHead clip>Case</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead numeric>Score</TableHead>
                <TableHead trailing>Change</TableHead>
              </TableRow>
            )}
          </TableHeader>
          {found.map((group) => {
            // The open case shows even when it lies past the first rows.
            const folded =
              !query &&
              !whole.has(group.id) &&
              group.hits.findIndex((s) => s.key === open) < CAP &&
              group.hits.length > CAP
            const rows = folded ? group.hits.slice(0, CAP) : group.hits
            return (
              <TableBody key={group.id}>
                {headed ? (
                  <TableGroupHead colSpan={COLUMNS} count={group.rows.length}>
                    {group.title}
                  </TableGroupHead>
                ) : null}
                {rows.map((standing) => (
                  <CaseRow
                    key={standing.key}
                    ctx={ctx}
                    standing={standing}
                    version={version}
                    repeated={repeated}
                    checks={checks}
                    open={open === standing.key}
                    onToggle={() => onOpen(open === standing.key ? null : standing.key)}
                    onRun={onRun}
                    grade={grade}
                  />
                ))}
                {!query && group.hits.length > CAP ? (
                  <TableRow>
                    <TableCell colSpan={COLUMNS}>
                      <Button
                        type="button"
                        variant="ghost-muted"
                        size="xs"
                        className="-ml-2"
                        onClick={() => toggleWhole(group.id)}
                      >
                        {folded
                          ? `Show ${plural(group.hits.length - CAP, 'more case')}`
                          : `Show the first ${CAP}`}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            )
          })}
        </Table>
      ) : (
        <Hint>No case has “{find.trim()}” in its name.</Hint>
      )}
    </>
  )
}

function CaseRow({
  ctx,
  standing,
  version,
  repeated,
  checks,
  open,
  onToggle,
  onRun,
  grade,
}: {
  ctx: Ctx
  standing: CaseStand
  version: string
  repeated: boolean
  checks: ChecksTable | null
  open: boolean
  onToggle: () => void
  onRun: (cases: string[]) => void
  grade: GradeRuns
}) {
  const name = standing.title
  const { latest, floor, change, apart, uncounted, current, history } = standing
  // Before its first run with the skill, a case stands on its score without it.
  const stands = latest ?? floor
  const waiting = waitingOn(standing, ctx)
  const read = checks?.reads.get(standing.key) ?? null
  return (
    <Fragment>
      <TableRow interactive onClick={rowAction(onToggle)}>
        <TableCell clip>
          <TableRowToggle open={open} clip title={name} onClick={onToggle}>
            {name}
          </TableRowToggle>
        </TableCell>
        {checks && read ? (
          <CountCells read={read} names={checks.names} waiting={waiting} />
        ) : stands ? (
          <>
            <TableCell>
              <Text
                tone="muted"
                title={`${writerName(stands.run.meta?.writer)} · ${runStamp(stands.run)}`}
              >
                {tryName(stands)}
              </Text>
            </TableCell>
            <TableCell numeric>
              <span className="inline-flex items-center gap-1">
                <ListScore total={stands.score} stale={!current} />
                {repeated ? <SampleCount count={stands.scored} /> : null}
              </span>
            </TableCell>
            <TableCell trailing>
              {waiting ? (
                <Text tone="faint" size="xs">
                  <Said>{waiting}</Said>
                </Text>
              ) : change ? (
                <Delta value={change} lead={false} />
              ) : (
                <Text tone="faint" size="xs">
                  {change === 0 ? 'Same' : latest && !apart && !uncounted ? 'First run' : ''}
                </Text>
              )}
            </TableCell>
          </>
        ) : (
          // No score to show: the row says why once, across the columns a score would fill.
          <TableCell colSpan={COLUMNS - 1}>
            <Text tone="faint" size="xs">
              <Said>{history[0] ? unscored(history[0], ctx).word : 'Not run yet'}</Said>
            </Text>
          </TableCell>
        )}
      </TableRow>
      {open ? (
        <TableDetail colSpan={COLUMNS}>
          <CaseDetail ctx={ctx} standing={standing} version={version} onRun={onRun} grade={grade} />
        </TableDetail>
      ) : null}
    </Fragment>
  )
}

/** Waiting words in the change column: a newer run with no score yet. */
const Waiting = ({ words }: { words: string }) => (
  <Text tone="faint" size="xs">
    <Said>{words}</Said>
  </Text>
)

/**
 * A row read on checks: how many checks the answer it is read against met,
 * then its newest answer, each followed by its version where the column's
 * head names none, and its change, or a newer run it waits on. A case with
 * nothing to compare says why once, across the columns a comparison would
 * fill.
 */
function CountCells({
  read,
  names,
  waiting,
}: {
  read: CaseRead
  names: ChecksTable['names']
  waiting: string | null
}) {
  // A case with no answer of the skill's to read waits on nothing else: its why says what is under way.
  const waits = read.to ? waiting : null
  if (!compared(read))
    return (
      <>
        <TableCell colSpan={waits ? COLUMNS - 2 : COLUMNS - 1}>
          <Text tone="faint" size="xs">
            <Said>{read.why ?? ''}</Said>
          </Text>
        </TableCell>
        {waits ? (
          <TableCell trailing>
            <Waiting words={waits} />
          </TableCell>
        ) : null}
      </>
    )
  const side = (which: 'a' | 'b') => {
    const version = rowVersion(
      which === 'a' ? read.from : read.to,
      which === 'a' ? names.from : names.to,
    )
    return (
      <span className="inline-flex items-baseline gap-2">
        <Text tone={which === 'a' ? 'muted' : undefined} tabular>
          {sideCount(read, which)}
        </Text>
        {version ? (
          <Text tone="faint" size="xs">
            {version}
          </Text>
        ) : null}
      </span>
    )
  }
  return (
    <>
      <TableCell fold="first">{side('a')}</TableCell>
      <TableCell fold="narrowest">{side('b')}</TableCell>
      <TableCell trailing>
        {waiting ? <Waiting words={waiting} /> : <ChecksChange read={read} />}
      </TableCell>
    </>
  )
}

/**
 * Where an opened case stands, in one sentence. Answers to an earlier request,
 * and to a case since deleted, say so after it: no run can check them again.
 */
function StandingLine({ standing, version }: { standing: CaseStand; version: string }) {
  const { latest, previous, floor, change, apart, current, known, earlier, history } = standing
  const since = known
    ? ''
    : earlier
      ? ' Its prompt or files have changed since.'
      : ' It is no longer in Cases.'
  if (!latest) {
    if (floor)
      return (
        <>
          Scored <Text weight="semibold">{Math.round(floor.score as number)}</Text> without the
          skill. It has not run with the skill yet.{since}
        </>
      )
    if (!history.length) return 'This case has not run yet.'
    return `${
      history[0].cut === 'stopped'
        ? 'This case has no score yet. Its last run was stopped before it finished.'
        : 'This case has no score yet.'
    }${since}`
  }
  const score = <Text weight="semibold">{Math.round(latest.score as number)}</Text>
  if (!known && !current)
    return (
      <>
        Last scored {score} on {versionOf(latest)}.{since}
      </>
    )
  if (!current)
    return (
      <>
        Last scored {score} on {versionOf(latest)}.{' '}
        {toGrade(standing)?.version === version
          ? `Its run on ${version} has no score yet.`
          : `It has not run on ${version}, so this score may no longer hold.`}
      </>
    )
  if (standing.uncounted)
    return (
      <>
        Scored {score} on {version}. Nothing was marked on both this run and the one before, so
        there is no change to read.{since}
      </>
    )
  if (!previous || change === null)
    return apart ? (
      <>
        Scored {score} on {version}. Its runs before were graded{' '}
        {latest.run.report?.model ? 'without Jev' : 'by Jev'}, so there is no change to read.
        {since}
      </>
    ) : (
      <>
        Scored {score} on {version}, its first run.{since}
      </>
    )
  const from =
    versionOf(previous) === versionOf(latest)
      ? `its run before on ${modelShort(previous.run.meta?.writer)}`
      : versionOf(previous)
  // The change is read over what both runs counted, so it may not be the difference of the two scores shown.
  const why =
    standingUnshared(standing) && standing.moved ? changeLine('runs', standing.moved) : null
  const answers = why ? ` ${why}` : ''
  return (
    <>
      Scored {score} on {version},{' '}
      {change === 0 ? (
        `the same as ${from}`
      ) : change > 0 ? (
        `up ${change} from ${from}`
      ) : (
        <>
          <Text tone="destructive">down {-change}</Text> from {from}
        </>
      )}
      .{answers}
      {since}
    </>
  )
}

/** What the answer a case stands on missed: the first few rules and checks, and how many more its output lists. */
function MissedList({ ctx, stands }: { ctx: Ctx; stands: CaseTry }) {
  const verdicts = scoreOf(outputOf(stands, ctx), ctx.config)?.verdicts ?? []
  // Graded without Jev, an output has no rule or check marked: there is nothing to say it missed or met.
  if (!verdicts.length) return null
  const missed = verdicts.filter(isMissed)
  const on = isWithoutSkill(stands.run) ? 'without the skill' : `on ${versionOf(stands)}`
  if (!missed.length)
    return (
      <Text as="p" size="ui" tone="muted">
        It missed nothing {on}.
      </Text>
    )
  return (
    <Stack gap="sm">
      <Text size="xs" tone="muted" weight="medium">
        Missed {on}
      </Text>
      <PlainList gap="md">
        {missed.slice(0, MISSED_CAP).map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: two rules may read the same
          <li key={`${v.id}#${i}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <XIcon aria-hidden="true" className="mt-1 size-3.5 text-destructive" />
            <Text size="ui" measure>
              {v.text}
            </Text>
          </li>
        ))}
      </PlainList>
      {missed.length > MISSED_CAP ? (
        <Text size="xs" tone="muted" className="pl-5.5">
          and {missed.length - MISSED_CAP} more, in the output
        </Text>
      ) : null}
    </Stack>
  )
}

function CaseDetail({
  ctx,
  standing,
  version,
  onRun,
  grade,
}: {
  ctx: Ctx
  standing: CaseStand
  version: string
  onRun: (cases: string[]) => void
  grade: GradeRuns
}) {
  const { outputs, go } = ctx
  const [whole, setWhole] = useState(false)
  const { id, title: name, latest, previous, floor, current, known, history } = standing
  const stands = latest ?? floor
  // How much of the score it stands on was counted, where Jev left some of it to the reader.
  const aside = stands ? asideLine(stands.outputs, ctx.config) : null
  // How many attempts its score and the one it moved from are over, and how far they were apart.
  const attempts = attemptsLine(standing)
  // A run that only waits to be graded: grading it is a step, and the next one when it is the run on this version.
  const waits = toGrade(standing)
  const ungraded = waits && grade.owed.has(waits.run.name) ? waits : null
  const toRun = known && !current && ungraded?.version !== version
  const read = (t: CaseTry) => go('results', readParams(outputs, id, outputOf(t, ctx)))
  const runs = whole ? history : history.slice(0, HISTORY_CAP)
  return (
    // Inset past the chevron, so the detail starts under the name it opens.
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,16rem)] items-start gap-x-12 gap-y-5 pl-5 @max-2xl:grid-cols-1">
      <Stack gap="md">
        <Stack gap="xs">
          {name.length > LONG_NAME ? (
            <Text as="p" size="xs" tone="muted" measure>
              {name}
            </Text>
          ) : null}
          <Text as="p" measure>
            <StandingLine standing={standing} version={version} />
          </Text>
          {aside ? (
            <Text as="p" size="ui" tone="muted" measure>
              {aside.text}
            </Text>
          ) : null}
          {attempts ? (
            <Text as="p" size="ui" tone="muted" measure>
              {attempts}
            </Text>
          ) : null}
        </Stack>
        {stands ? <MissedList ctx={ctx} stands={stands} /> : null}
        {/* The next step first: the run that checks the case, or the grading its run waits on; with it checked, its output. */}
        <Toolbar>
          {toRun ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onRun([id])}>
              Run it on {version}
            </Button>
          ) : null}
          {ungraded ? (
            <Button
              type="button"
              variant={toRun ? 'ghost' : 'outline'}
              size="sm"
              disabled={grade.waiting}
              busy={grade.busy(ungraded.run.name)}
              busyLabel="Grading…"
              onClick={() => grade.start(ungraded.run.name)}
            >
              Grade its {versionOf(ungraded)} run
            </Button>
          ) : null}
          {stands ? (
            <Button
              type="button"
              variant={toRun || ungraded ? 'ghost' : 'outline'}
              size="sm"
              onClick={() => read(stands)}
            >
              {current || !latest ? 'Read the output' : `Read the ${versionOf(latest)} output`}
            </Button>
          ) : null}
          {current && latest && previous ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                go('results', {
                  case: id,
                  a: outputOf(previous, ctx).key,
                  b: outputOf(latest, ctx).key,
                })
              }
            >
              Compare with{' '}
              {versionOf(previous) === versionOf(latest) ? 'the run before' : versionOf(previous)}
            </Button>
          ) : null}
        </Toolbar>
      </Stack>
      {history.length > 1 || (history.length === 1 && !stands) ? (
        <Stack gap="xs">
          <Text size="xs" tone="muted" weight="medium">
            {history.length === 1 ? 'Its run' : `${history.length} runs of this case, newest first`}
          </Text>
          <Rows as="ul">
            {runs.map((t) => (
              <li key={t.run.name} className="flex min-h-9 items-center gap-2">
                <Text size="ui" truncate className="min-w-0 flex-1">
                  {tryName(t)}
                </Text>
                <Text size="xs" tone="muted" tabular>
                  {runStamp(t.run)}
                </Text>
                <TryScore ctx={ctx} name={name} attempt={t} onRead={() => read(t)} />
              </li>
            ))}
          </Rows>
          {history.length > HISTORY_CAP ? (
            <Toolbar>
              <Button
                type="button"
                variant="ghost-muted"
                size="xs"
                className="-ml-2"
                onClick={() => setWhole(!whole)}
              >
                {whole ? `Show the latest ${HISTORY_CAP}` : `Show all ${history.length} runs`}
              </Button>
            </Toolbar>
          ) : null}
        </Stack>
      ) : null}
    </div>
  )
}

/**
 * One run's score of a case, at the end of its line in the case's runs. Only
 * what opens something looks like it does: a score, or the word for an output
 * that has none, opens the output. A run still being written or graded says so
 * in faint words and is no button.
 */
function TryScore({
  ctx,
  name,
  attempt,
  onRead,
}: {
  ctx: Ctx
  /** The case, for a screen reader. */
  name: string
  attempt: CaseTry
  onRead: () => void
}) {
  const label = `${name}, ${tryName(attempt)}`
  if (attempt.score === null) {
    const why = unscored(attempt, ctx)
    return why.opens ? (
      <Button
        type="button"
        variant="link-muted"
        size="cell-inline"
        className="text-xs"
        aria-label={`${label}: ${why.says}. Read it.`}
        onClick={onRead}
      >
        {why.word}
      </Button>
    ) : (
      <Text tone="faint" size="xs">
        <Said>{why.word}</Said>
      </Text>
    )
  }
  const shown = Math.round(attempt.score)
  const several = attemptsOf(attempt)
  return (
    <Button
      type="button"
      variant="ghost"
      size="cell"
      aria-label={`${label}: ${shown}${several && several.count > 1 ? `, the mean of ${several.count} attempts, ${spreadWords(several)}` : ''}. Read it.`}
      onClick={onRead}
    >
      <TotalChip total={shown} />
    </Button>
  )
}
