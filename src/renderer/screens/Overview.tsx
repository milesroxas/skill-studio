/** Runs against cases: totals per cell, cost and time per run, versions, cases. */

import { mean } from '@domain/stats.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import { EmptyState, Panel, Screen, Section, Spacer, Toolbar } from '../components/layout.tsx'
import { TotalChip } from '../components/Scores.tsx'
import { Heading, Hint, Text, VisuallyHidden } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx'
import type { Ctx } from '../ctx.ts'
import {
  caseTitle,
  fmt,
  money,
  type Output,
  runLabel,
  runStamp,
  scoreOf,
  totalOf,
  versionName,
} from '../model.ts'

export function Overview({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, go, toast } = ctx
  const [openRun, setOpenRun] = useState<string | null>(null)
  const caseIds = [...new Set(outputs.map((o) => o.caseId))].sort()
  const runs = state.runs
  const byRun = new Map<string, Output[]>()
  for (const o of outputs) byRun.set(o.run.name, [...(byRun.get(o.run.name) ?? []), o])
  const totalsOf = (list: Output[]) => list.map((o) => totalOf(o, config)).filter((t) => t !== null)
  const flagsOf = (list: Output[]) =>
    list.reduce((s, o) => s + (scoreOf(o, config)?.flags.length ?? 0), 0)
  const showMean = caseIds.length > 1
  const showFlags = runs.some((run) => flagsOf(byRun.get(run.name) ?? []) > 0)

  const regrade = async (run: string) => {
    try {
      await api.grade(run, state.jevKey)
      toast(`Grading ${run}`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  if (!runs.length)
    return (
      <EmptyState
        title="No runs yet"
        actions={
          state.cases.length ? (
            <Button type="button" onClick={() => go('generate')}>
              Start the first run
            </Button>
          ) : (
            <Button type="button" onClick={() => go('cases', { new: '1' })}>
              Add a case
            </Button>
          )
        }
      >
        A run has an agent answer each case with {state.skill.name} installed, then grades the
        answers.{' '}
        {state.cases.length
          ? `${state.cases.length === 1 ? 'One case is' : `${state.cases.length} cases are`} ready.`
          : 'Write a case first.'}
      </EmptyState>
    )

  return (
    <Screen>
      <Section>
        <Hint>
          Each cell is a case's mean score out of 100. Click a score to read the answers, or a run
          for its details.
        </Hint>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              {caseIds.map((c) => (
                <TableHead key={c} numeric title={caseTitle(state, c)}>
                  {c}
                </TableHead>
              ))}
              {showMean ? <TableHead numeric>Mean</TableHead> : null}
              <TableHead numeric>Cost</TableHead>
              <TableHead numeric>Time</TableHead>
              {showFlags ? <TableHead numeric>Flags</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const mine = byRun.get(run.name) ?? []
              const cost = run.meta?.samples.reduce((s, x) => s + (x.costUsd ?? 0), 0) ?? null
              const seconds = run.meta?.samples.reduce((s, x) => s + x.seconds, 0) ?? 0
              const open = openRun === run.name
              return (
                <TableRow key={run.name}>
                  <TableCell wrap>
                    <Button
                      type="button"
                      variant="link"
                      size="inline"
                      aria-expanded={open}
                      title={run.name}
                      onClick={() => setOpenRun(open ? null : run.name)}
                    >
                      {runLabel(run)}
                    </Button>
                    <Text block tone="muted" size="xs">
                      {runStamp(run)}
                      {run.meta?.note ? ` · ${run.meta.note}` : ''}
                    </Text>
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
                          title={`Read ${c} from this run`}
                          onClick={() => go('compare', { a: cell[0].key })}
                        >
                          {total === null ? (
                            <Text tone="muted">Not graded</Text>
                          ) : (
                            <TotalChip total={Math.round(total)} />
                          )}
                          {cell.length > 1 ? (
                            <Text tone="muted" size="xs">
                              ×{cell.length}
                            </Text>
                          ) : null}
                        </Button>
                      </TableCell>
                    )
                  })}
                  {showMean ? <TableCell numeric>{fmt(mean(totalsOf(mine)), 0)}</TableCell> : null}
                  <TableCell numeric>{money(cost)}</TableCell>
                  <TableCell numeric>{seconds ? `${seconds}s` : '–'}</TableCell>
                  {showFlags ? <TableCell numeric>{flagsOf(mine) || ''}</TableCell> : null}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        {openRun ? <RunDetail ctx={ctx} run={openRun} regrade={regrade} /> : null}
      </Section>
    </Screen>
  )
}

function RunDetail({
  ctx,
  run,
  regrade,
}: {
  ctx: Ctx
  run: string
  regrade: (run: string) => void
}) {
  const { state, config, outputs, go } = ctx
  const view = state.runs.find((r) => r.name === run)
  if (!view) return null
  const mine = outputs.filter((o) => o.run.name === run)
  return (
    <Panel gap="sm">
      <Toolbar>
        <Heading level={3}>{versionName(view)}</Heading>
        <Text font="mono" tone="muted" size="xs">
          {view.name}
        </Text>
        <Spacer />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!view.meta?.skillVersion}
          onClick={() =>
            go('versions', { left: view.meta?.skillVersion ?? 'current', right: 'current' })
          }
        >
          Compare skill with now
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => regrade(run)}>
          {state.jevKey ? 'Regrade' : 'Regrade with code checks'}
        </Button>
      </Toolbar>
      <Hint>
        {view.report
          ? `Graded ${view.report.createdAt.slice(0, 16).replace('T', ' ')} with ${view.report.model ?? 'code checks only'}, ${view.report.inputTokens.toLocaleString()} input tokens.`
          : 'Not graded yet.'}
      </Hint>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sample</TableHead>
            <TableHead numeric>Total</TableHead>
            <TableHead numeric>Words</TableHead>
            <TableHead numeric>Cost</TableHead>
            <TableHead numeric>Time</TableHead>
            <TableHead numeric>Tool calls</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead numeric>
              <VisuallyHidden>Open</VisuallyHidden>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mine.map((o) => {
            const s = scoreOf(o, config)
            const meta = view.meta?.samples.find((x) => x.dir === o.sample.name)
            return (
              <TableRow key={o.key} variant={meta && !meta.ok ? 'destructive' : 'default'}>
                <TableCell>
                  <Text font="mono">{o.sample.name}</Text>
                </TableCell>
                <TableCell numeric>
                  <TotalChip total={s?.scores.total} />
                </TableCell>
                <TableCell numeric>{o.result?.words ?? '–'}</TableCell>
                <TableCell numeric>{money(meta?.costUsd)}</TableCell>
                <TableCell numeric>{meta ? `${meta.seconds}s` : '–'}</TableCell>
                <TableCell numeric>{meta?.toolCalls ?? '–'}</TableCell>
                <TableCell wrap>
                  <Text size="xs">
                    {meta?.error ? <Text tone="destructive">{meta.error}</Text> : null}
                    {s?.flags.join('; ')}
                  </Text>
                </TableCell>
                <TableCell numeric>
                  <Toolbar gap="md" justify="end" wrap={false}>
                    <Button
                      type="button"
                      variant="link-muted"
                      size="inline"
                      onClick={() => go('compare', { a: o.key })}
                    >
                      Read
                    </Button>
                    {o.sample.hasTranscript ? (
                      <Button
                        type="button"
                        variant="link-muted"
                        size="inline"
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
    </Panel>
  )
}
