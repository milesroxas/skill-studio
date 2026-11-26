/**
 * Results: what the agent wrote, compared. The cases a run answered are listed
 * on the left. Where the cases can be read on their checks, each says in words
 * how its newest answer did against the answer it is read against, "Better
 * than without the skill"; All cases says how many cases got better, stayed
 * the same and got worse. Where no case can, each says how its score moved
 * from the version before to the latest, and a score from an earlier version
 * than the skill as it is now stands open, an edge and no fill. Opening a case
 * puts two outputs side by side, with what to fix under them. "All cases" is
 * every case at once, and where each stands on the skill as it is now.
 *
 * The selection lives in the address, so Back and Forward follow it: `case`
 * names the case, `a` and `b` the two outputs when they are not the pair the
 * case opens with, `view=all` the summary, and `against=before` that a case is
 * read against its answer before rather than its answer without the skill.
 */
import { pointsMoved } from '@domain/lift.ts'
import { memo, useMemo } from 'react'
import {
  againstOf,
  type CaseRead,
  compared,
  outcomeLine,
  readCase,
  sideNames,
} from '../case-checks.ts'
import { CaseChecksLine } from '../components/CaseChecks.tsx'
import { unscoredWord } from '../components/CaseStandings.tsx'
import { Comparison } from '../components/Comparison.tsx'
import {
  Column,
  ColumnHeader,
  ColumnSection,
  EmptyState,
  PlainList,
  Workbench,
} from '../components/layout.tsx'
import { NavButton, NavButtonMeta, NavButtonTitle } from '../components/NavButton.tsx'
import { ResultsSummary } from '../components/ResultsSummary.tsx'
import { ListScore, ScoreChange } from '../components/Scores.tsx'
import { Heading } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Ctx } from '../ctx.ts'
import {
  casePair,
  casesRun,
  caseTitle,
  changeBetween,
  cutOf,
  isWithoutSkill,
  liftOf,
  noSkillScore,
  type OutputPair,
  resultsShown,
  runTitle,
  standingsOf,
  totalOf,
  unscoredLine,
  unscoredWords,
  versionOutputs,
  versionScore,
  versionsRun,
  WITHOUT_SKILL,
} from '../model.ts'
import { useArrivals } from '../motion.ts'

export const Results = memo(function Results({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, openRun } = ctx
  const current = state.versions.current
  // These read every output, and the list is drawn again on each job's log line: worked out
  // only when the outputs or the scoring change.
  const caseIds = useMemo(() => casesRun(state, outputs), [state, outputs])
  // Where each case stands on the skill as it is now, and the figure All cases opens with:
  // each case's first score against its latest.
  const standings = useMemo(() => standingsOf(state, outputs, config), [state, outputs, config])
  const lift = useMemo(() => liftOf(standings), [standings])
  // Answers to a case before it changed are in a row of their own: they say nothing of where the case stands.
  const behind = useMemo(
    () => new Set(standings.filter((s) => !s.earlier && !s.current).map((s) => s.id)),
    [standings],
  )
  const versions = useMemo(() => versionsRun(outputs), [outputs])
  const latest = versions.at(-1)
  const latestScore = useMemo(
    () => (latest ? versionScore(outputs, config, latest) : null),
    [outputs, config, latest],
  )
  // Before the skill's first run, the only score is the one written without it.
  const floor = useMemo(
    () => (latest ? null : noSkillScore(outputs, config)),
    [outputs, config, latest],
  )
  /** Each case's pair to read first, with both totals. */
  const rows = useMemo(
    () =>
      caseIds.map((id) => {
        const pair = casePair(outputs, id)
        const totals = {
          a: pair.a ? totalOf(pair.a, config) : null,
          b: pair.b ? totalOf(pair.b, config) : null,
        }
        // Read from Jev's answers, with yours only where both outputs hold one.
        const change = pair.a && pair.b ? changeBetween(pair.a, pair.b, config) : null
        return { id, pair, totals, change }
      }),
    [caseIds, outputs, config],
  )
  // Each case on its checks, against what the address asks, and whether any case can be read so on
  // either: a skill none of whose cases can keeps the screen read on scores.
  const against = againstOf(route.params)
  const checks = useMemo(() => {
    const read = (on: typeof against) =>
      new Map<string, CaseRead>(
        standings.map((s) => [s.key, readCase(s, config, on, (t) => unscoredWord(t, ctx))]),
      )
    const reads = read(against)
    const other = read(against === 'without' ? 'before' : 'without')
    if (![...reads.values(), ...other.values()].some(compared)) return null
    // The head counts the cases as they stand: answers to a case before it changed are a row apart.
    const head = standings.filter((s) => !s.earlier).map((s) => reads.get(s.key) as CaseRead)
    return { against, reads, head, names: sideNames(head, against) }
    // The words for a run with no score turn on the jobs running, as the table's do.
  }, [standings, config, against, ctx])
  // A case whose first output lands while the list is open fades in; the ones there when it opened rest.
  const arrivedCase = useArrivals(caseIds)

  if (!state.runs.length)
    return (
      <EmptyState
        size="screen"
        title="No runs yet"
        actions={
          state.cases.length ? (
            <Button type="button" onClick={() => openRun()}>
              Run {current.version}
            </Button>
          ) : (
            <Button type="button" onClick={() => go('cases', { new: '1' })}>
              Add a case
            </Button>
          )
        }
      >
        A run answers each case using {state.skill.name}, then grades the answers against your rules
        and checks.{' '}
        {state.cases.length
          ? `${state.cases.length === 1 ? 'One case is' : `${state.cases.length} cases are`} ready.`
          : 'Write a case first.'}
      </EmptyState>
    )
  if (!outputs.length)
    return (
      <EmptyState size="screen" title="Nothing written yet">
        Outputs show here as they are written. Progress is at the foot of the sidebar.
      </EmptyState>
    )

  const params = route.params
  const all = params.get('view') === 'all'
  const { caseId, shown } = resultsShown(outputs, caseIds, params)

  return (
    <Workbench>
      <Column kind="list" fold={{ panel: 'list', name: 'the case list' }}>
        <nav aria-label="Results" className="contents">
          <ColumnHeader inset="list">
            {/* Scores, not Cases: the Cases screen's list is headed Cases, and the two must not read alike. */}
            <Heading level={3} as="h2">
              Scores
            </Heading>
          </ColumnHeader>
          {/* All cases is the run as a whole, not one more case: a rule sets it apart from them. */}
          <ColumnSection inset="list">
            <PlainList gap="xs" bleed>
              <li>
                <NavButton
                  current={all}
                  onClick={() => go('results', { view: 'all' })}
                  end={
                    checks ? null : lift ? (
                      <ListScore total={lift.latest} />
                    ) : latest ? (
                      <ListScore total={latestScore} />
                    ) : floor !== null ? (
                      <ListScore total={floor} />
                    ) : null
                  }
                >
                  <NavButtonTitle>All cases</NavButtonTitle>
                  {checks ? (
                    <NavButtonMeta>{outcomeLine(checks.head)}</NavButtonMeta>
                  ) : lift ? (
                    <NavButtonMeta>
                      <ScoreChange
                        change={pointsMoved(lift.first, lift.latest)}
                        against="first runs"
                      />
                    </NavButtonMeta>
                  ) : latest ? (
                    // With no lift to show, the line says only what is sure: one version ran, or the latest has no score.
                    versions.length === 1 ? (
                      <NavButtonMeta>Only {latest} so far</NavButtonMeta>
                    ) : latestScore === null ? (
                      <NavButtonMeta>
                        {latest} {unscoredWords(cutOf(versionOutputs(outputs, latest)))}
                      </NavButtonMeta>
                    ) : null
                  ) : floor !== null ? (
                    <NavButtonMeta>{WITHOUT_SKILL}</NavButtonMeta>
                  ) : null}
                </NavButton>
              </li>
            </PlainList>
          </ColumnSection>
          <ColumnSection inset="list">
            <PlainList gap="xs" bleed>
              {rows.map(({ id, pair, totals, change }) => {
                const read = checks?.reads.get(id)
                return (
                  <li key={id}>
                    <NavButton
                      current={!all && id === caseId}
                      arrived={arrivedCase(id)}
                      onClick={() => go('results', { case: id })}
                      // The later output's score, or none: an earlier version's never stands under its name.
                      end={
                        read ? null : (
                          <ListScore total={pair.b ? totals.b : totals.a} stale={behind.has(id)} />
                        )
                      }
                    >
                      <NavButtonTitle>{caseTitle(state, id)}</NavButtonTitle>
                      <NavButtonMeta>
                        {read ? (
                          <CaseChecksLine read={read} />
                        ) : (
                          <CaseMove pair={pair} totals={totals} change={change} />
                        )}
                      </NavButtonMeta>
                    </NavButton>
                  </li>
                )
              })}
            </PlainList>
          </ColumnSection>
        </nav>
      </Column>
      <Column>
        {all ? (
          <ResultsSummary ctx={ctx} standings={standings} checks={checks} />
        ) : (
          <Comparison
            key={caseId}
            ctx={ctx}
            caseId={caseId}
            {...(shown ?? rows.find((row) => row.id === caseId)?.pair ?? { a: null, b: null })}
          />
        )}
      </Column>
    </Workbench>
  )
})

/**
 * The line under a case on the list: how its score moved between the two
 * outputs it opens with. Where one of them has no score the line says which
 * and why, and with one output, that only one version has run the case.
 */
function CaseMove({
  pair,
  totals,
  change,
}: {
  pair: OutputPair
  totals: { a: number | null; b: number | null }
  /** The change between the two, as a change is read (`changeBetween`). */
  change: number | null
}) {
  if (pair.a && pair.b) {
    if (totals.b === null) return unscoredLine(pair.b)
    if (totals.a === null) return unscoredLine(pair.a)
    // Two answers to different requests, or graded two ways, have no change to read between them.
    if (change === null) return null
    return (
      <ScoreChange
        change={change}
        against={isWithoutSkill(pair.a.run) ? null : runTitle(pair.a.run, { short: true })}
      />
    )
  }
  const only = pair.b ?? pair.a
  if (!only) return null
  // One output has nothing to move from: the line says so, rather than a bare "v0".
  return isWithoutSkill(only.run)
    ? WITHOUT_SKILL
    : `Only ${runTitle(only.run, { short: true })} so far`
}
