/**
 * Results: what the agent wrote, compared. The cases a run answered are listed
 * on the left, each with how its score moved from the version before to the
 * latest. Opening one puts those two outputs side by side, with what each
 * missed. "All cases" is every run at once.
 *
 * The selection lives in the address, so Back and Forward follow it: `case`
 * names the case, `a` and `b` the two outputs when they are not the pair the
 * case opens with, and `view=all` the summary.
 */
import { memo, useMemo } from 'react'
import { Comparison } from '../components/Comparison.tsx'
import {
  Column,
  ColumnBody,
  ColumnHeader,
  EmptyState,
  PlainList,
  Workbench,
} from '../components/layout.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { ResultsSummary } from '../components/ResultsSummary.tsx'
import { ScoreMove } from '../components/Scores.tsx'
import { Heading, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import type { Ctx } from '../ctx.ts'
import {
  casePair,
  casesRun,
  caseTitle,
  liftOf,
  type Output,
  outputByKey,
  totalOf,
  versionScore,
  versionsRun,
} from '../model.ts'

export const Results = memo(function Results({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, openRun } = ctx
  const current = state.versions.current
  // These read every output, and the list is drawn again on each job's log line: worked out
  // only when the outputs or the scoring change.
  const caseIds = useMemo(() => casesRun(state, outputs), [state, outputs])
  // The same figures All cases opens with: one writer's first version against its latest.
  const lift = useMemo(() => liftOf(state, outputs, config), [state, outputs, config])
  const latest = useMemo(() => versionsRun(outputs).at(-1), [outputs])
  const latestScore = useMemo(
    () => (latest ? versionScore(outputs, config, latest) : null),
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
        return { id, pair, totals }
      }),
    [caseIds, outputs, config],
  )

  if (!state.runs.length)
    return (
      <EmptyState
        size="screen"
        title="No runs yet"
        actions={
          state.cases.length ? (
            <Button type="button" onClick={openRun}>
              Run {current.version}
            </Button>
          ) : (
            <Button type="button" onClick={() => go('cases', { new: '1' })}>
              Add a case
            </Button>
          )
        }
      >
        A run has an agent do each case with {state.skill.name} installed, then Jev marks what it
        wrote against your rules and each case’s checks.{' '}
        {state.cases.length
          ? `${state.cases.length === 1 ? 'One case is' : `${state.cases.length} cases are`} ready.`
          : 'Write a case first.'}
      </EmptyState>
    )
  if (!outputs.length)
    return (
      <EmptyState size="screen" title="Nothing written yet">
        The first outputs show here as the run writes them. Its progress is at the foot of the
        sidebar.
      </EmptyState>
    )

  const params = route.params
  const all = params.get('view') === 'all'
  // An address may name the outputs and not their case: the first one named says which case it is.
  const named = outputByKey(outputs, params.get('b')) ?? outputByKey(outputs, params.get('a'))
  const asked = params.get('case') ?? named?.caseId ?? null
  const caseId = asked !== null && caseIds.includes(asked) ? asked : caseIds[0]
  const pinned = params.has('a') || params.has('b')
  const inCase = (key: string | null): Output | null => {
    const output = outputByKey(outputs, key)
    return output?.caseId === caseId ? output : null
  }
  const shown = pinned ? { a: inCase(params.get('a')), b: inCase(params.get('b')) } : null

  return (
    <Workbench>
      <Column kind="list">
        <nav aria-label="Results" className="contents">
          <ColumnHeader inset="list">
            <Heading level={3} as="h2">
              Cases
            </Heading>
            <Text tone="muted" size="xs" tabular>
              {caseIds.length}
            </Text>
          </ColumnHeader>
          <ColumnBody inset="list">
            <PlainList gap="none">
              <li>
                <NavButton current={all} onClick={() => go('results', { view: 'all' })}>
                  <Text size="ui">All cases</Text>
                  {lift ? (
                    <span className="flex items-center gap-2">
                      <ScoreMove from={lift.first.mean} to={lift.latest.mean} />
                      <Text tone="muted" size="xs">
                        {lift.first.version} to {lift.latest.version}
                      </Text>
                    </span>
                  ) : latest ? (
                    <span className="flex items-center gap-2">
                      <ScoreMove from={null} to={latestScore} />
                      <Text tone="muted" size="xs">
                        {latest}
                      </Text>
                    </span>
                  ) : null}
                </NavButton>
              </li>
              {rows.map(({ id, totals }) => (
                <li key={id}>
                  <NavButton
                    current={!all && id === caseId}
                    onClick={() => go('results', { case: id })}
                  >
                    <Text size="ui" truncate block>
                      {caseTitle(state, id)}
                    </Text>
                    <ScoreMove from={totals.a} to={totals.b} />
                  </NavButton>
                </li>
              ))}
            </PlainList>
          </ColumnBody>
        </nav>
      </Column>
      <Column>
        {all ? (
          <ResultsSummary ctx={ctx} />
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
