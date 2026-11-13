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
  isWithoutSkill,
  liftOf,
  noSkillScore,
  type Output,
  type OutputPair,
  outputByKey,
  runTitle,
  totalOf,
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
  // The same figures All cases opens with: one writer's first version against its latest.
  const lift = useMemo(() => liftOf(state, outputs, config), [state, outputs, config])
  const latest = useMemo(() => versionsRun(outputs).at(-1), [outputs])
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
        return { id, pair, totals }
      }),
    [caseIds, outputs, config],
  )
  // A case whose first output lands while the list is open fades in; the ones there when it opened rest.
  const arrivedCase = useArrivals(caseIds)

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
                    lift ? (
                      <ListScore total={lift.latest.mean} />
                    ) : latest ? (
                      <ListScore total={latestScore} />
                    ) : floor !== null ? (
                      <ListScore total={floor} />
                    ) : null
                  }
                >
                  <NavButtonTitle>All cases</NavButtonTitle>
                  {lift ? (
                    <NavButtonMeta>
                      <ScoreChange
                        from={lift.first.mean}
                        to={lift.latest.mean}
                        against={lift.first.version}
                      />
                    </NavButtonMeta>
                  ) : latest ? (
                    <NavButtonMeta>Only {latest} so far</NavButtonMeta>
                  ) : floor !== null ? (
                    <NavButtonMeta>{WITHOUT_SKILL}</NavButtonMeta>
                  ) : null}
                </NavButton>
              </li>
            </PlainList>
          </ColumnSection>
          <ColumnSection inset="list">
            <PlainList gap="xs" bleed>
              {rows.map(({ id, pair, totals }) => (
                <li key={id}>
                  <NavButton
                    current={!all && id === caseId}
                    arrived={arrivedCase(id)}
                    onClick={() => go('results', { case: id })}
                    end={<ListScore total={totals.b ?? totals.a} />}
                  >
                    <NavButtonTitle>{caseTitle(state, id)}</NavButtonTitle>
                    <NavButtonMeta>
                      <CaseMove pair={pair} totals={totals} />
                    </NavButtonMeta>
                  </NavButton>
                </li>
              ))}
            </PlainList>
          </ColumnSection>
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

/**
 * The line under a case on the list: how its score moved between the two
 * outputs it opens with, or, with one output, that only one version has run it.
 */
function CaseMove({
  pair,
  totals,
}: {
  pair: OutputPair
  totals: { a: number | null; b: number | null }
}) {
  if (pair.a && pair.b && totals.a !== null && totals.b !== null)
    return (
      <ScoreChange
        from={totals.a}
        to={totals.b}
        against={isWithoutSkill(pair.a.run) ? null : runTitle(pair.a.run, { short: true })}
      />
    )
  const only = pair.b ?? pair.a
  if (!only) return null
  // One output has nothing to move from: the line says so, rather than a bare "v0".
  return isWithoutSkill(only.run)
    ? WITHOUT_SKILL
    : `Only ${runTitle(only.run, { short: true })} so far`
}
