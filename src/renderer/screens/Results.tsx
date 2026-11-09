/**
 * Results: what the agent wrote, compared. The cases a run answered are listed
 * on the left, each with how its score moved from the version before to the
 * latest. Picking one puts those two outputs side by side, with what each
 * missed and the pick between them. "All cases" is every run at once, and the
 * scoring behind the numbers.
 *
 * The selection lives in the address, so Back and Forward follow it: `case`
 * names the case, `a` and `b` the two outputs when they are not the pair the
 * case opens with, and `view=all` the summary.
 */
import { pickBetween, pickStanding } from '@domain/picks.ts'
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
  sideName,
  totalOf,
  versionScore,
  versionsRun,
} from '../model.ts'

export function Results({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, route, go, openRun } = ctx
  const current = state.versions.current

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

  const caseIds = casesRun(state, outputs)
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
  // The same figures All cases opens with: one writer's first version against its latest.
  const lift = liftOf(state, outputs, config)
  const latest = versionsRun(outputs).at(-1)

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
                      <ScoreMove from={null} to={versionScore(outputs, config, latest)} />
                      <Text tone="muted" size="xs">
                        {latest}
                      </Text>
                    </span>
                  ) : null}
                </NavButton>
              </li>
              {caseIds.map((id) => {
                const pair = casePair(outputs, id)
                const vote =
                  pair.a && pair.b
                    ? pickBetween(state.reviews.preferences, pair.a.key, pair.b.key)
                    : null
                const totals = {
                  a: pair.a ? totalOf(pair.a, config) : null,
                  b: pair.b ? totalOf(pair.b, config) : null,
                }
                const differs = pickStanding(vote, totals.a, totals.b) === 'differs'
                const side = vote === 'a' ? pair.a : vote === 'b' ? pair.b : null
                return (
                  <li key={id}>
                    <NavButton
                      current={!all && id === caseId}
                      onClick={() => go('results', { case: id })}
                    >
                      <Text size="ui" truncate block>
                        {caseTitle(state, id)}
                      </Text>
                      <span className="flex items-center gap-2">
                        <ScoreMove from={totals.a} to={totals.b} />
                        {vote ? (
                          <Text tone={differs ? 'warning' : 'muted'} size="xs">
                            {side ? `you picked ${sideName(side)}` : 'you called a tie'}
                          </Text>
                        ) : null}
                      </span>
                    </NavButton>
                  </li>
                )
              })}
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
            {...(shown ?? casePair(outputs, caseId))}
          />
        )}
      </Column>
    </Workbench>
  )
}
