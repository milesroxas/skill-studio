/** Runs against cases: totals per cell, cost and time per run, versions, cases. */

import { mean } from '@core/stats.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import { TotalChip } from '../components/Scores.tsx'
import type { Ctx } from '../ctx.ts'
import {
  caseTitle,
  fmt,
  money,
  type Output,
  runName,
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
      <div className="empty">
        <h2>No runs yet</h2>
        <p className="help">
          A run has an agent answer each case with {state.skill.name} installed, then grades the
          answers.{' '}
          {state.cases.length
            ? `${state.cases.length === 1 ? 'One case is' : `${state.cases.length} cases are`} ready.`
            : 'Write a case first.'}
        </p>
        <div className="actions">
          {state.cases.length ? (
            <button type="button" className="primary" onClick={() => go('generate')}>
              Start the first run
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => go('cases', { new: '1' })}>
              Add a case
            </button>
          )}
        </div>
      </div>
    )

  return (
    <div className="screen narrow">
      <section className="section">
        <p className="help">
          Each cell is a case's mean score out of 100. Click a score to read the answers, or a run
          for its details.
        </p>
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Run</th>
                {caseIds.map((c) => (
                  <th key={c} className="num" title={caseTitle(state, c)}>
                    {c}
                  </th>
                ))}
                {showMean ? <th className="num">Mean</th> : null}
                <th className="num">Cost</th>
                <th className="num">Time</th>
                {showFlags ? <th className="num">Flags</th> : null}
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const mine = byRun.get(run.name) ?? []
                const cost = run.meta?.samples.reduce((s, x) => s + (x.costUsd ?? 0), 0) ?? null
                const seconds = run.meta?.samples.reduce((s, x) => s + x.seconds, 0) ?? 0
                const open = openRun === run.name
                return (
                  <tr key={run.name}>
                    <td>
                      <button
                        type="button"
                        className="link"
                        aria-expanded={open}
                        title={run.name}
                        onClick={() => setOpenRun(open ? null : run.name)}
                      >
                        {runName(run)}
                      </button>
                      <span className="sub">
                        {runStamp(run)}
                        {run.meta?.note ? ` · ${run.meta.note}` : ''}
                      </span>
                    </td>
                    {caseIds.map((c) => {
                      const cell = mine.filter((o) => o.caseId === c)
                      if (!cell.length)
                        return (
                          <td key={c} className="num muted">
                            –
                          </td>
                        )
                      const total = mean(totalsOf(cell))
                      return (
                        <td key={c} className="num">
                          <button
                            type="button"
                            className="cell-btn"
                            title={`Read ${c} from this run`}
                            onClick={() => go('compare', { a: cell[0].key })}
                          >
                            {total === null ? (
                              <span className="muted">Not graded</span>
                            ) : (
                              <TotalChip total={Math.round(total)} />
                            )}
                            {cell.length > 1 ? (
                              <small className="muted"> ×{cell.length}</small>
                            ) : null}
                          </button>
                        </td>
                      )
                    })}
                    {showMean ? <td className="num">{fmt(mean(totalsOf(mine)), 0)}</td> : null}
                    <td className="num">{money(cost)}</td>
                    <td className="num">{seconds ? `${seconds}s` : '–'}</td>
                    {showFlags ? <td className="num">{flagsOf(mine) || ''}</td> : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {openRun ? <RunDetail ctx={ctx} run={openRun} regrade={regrade} /> : null}
      </section>

      <section className="section">
        <h2>Skill versions</h2>
        <div className="scroll-x">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Name</th>
                <th>Date</th>
                <th>Hash</th>
                <th className="num">Runs</th>
              </tr>
            </thead>
            <tbody>
              {state.versions.versions.map((v) => (
                <tr key={v.version}>
                  <td>{v.version}</td>
                  <td>{v.name || <span className="muted">Unnamed</span>}</td>
                  <td className="tnum">{v.date ?? '–'}</td>
                  <td className="mono muted">{v.hash}</td>
                  <td className="num">
                    {runs.filter((r) => r.meta?.skillVersion === v.version).length}
                  </td>
                </tr>
              ))}
              {state.versions.current.changed ? (
                <tr>
                  <td>{state.versions.current.version}</td>
                  <td className="muted">Working tree, not run yet</td>
                  <td>–</td>
                  <td className="mono muted">{state.versions.current.hash}</td>
                  <td className="num">0</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
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
    <div className="run-detail">
      <div className="toolbar">
        <h3>{versionName(view)}</h3>
        <span className="mono muted small">{view.name}</span>
        <span className="spacer" />
        <button type="button" onClick={() => go('skill', { right: run })}>
          Skill changes
        </button>
        <button type="button" onClick={() => regrade(run)}>
          {state.jevKey ? 'Regrade' : 'Regrade with code checks'}
        </button>
      </div>
      <p className="help">
        {view.report
          ? `Graded ${view.report.createdAt.slice(0, 16).replace('T', ' ')} with ${view.report.model ?? 'code checks only'}, ${view.report.inputTokens.toLocaleString()} input tokens.`
          : 'Not graded yet.'}
      </p>
      <table className="grid-table">
        <thead>
          <tr>
            <th>Sample</th>
            <th className="num">Total</th>
            <th className="num">Words</th>
            <th className="num">Cost</th>
            <th className="num">Time</th>
            <th className="num">Tool calls</th>
            <th>Flags</th>
            <th className="num">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {mine.map((o) => {
            const s = scoreOf(o, config)
            const meta = view.meta?.samples.find((x) => x.dir === o.sample.name)
            return (
              <tr key={o.key} className={meta && !meta.ok ? 'bad-row' : ''}>
                <td className="mono">{o.sample.name}</td>
                <td className="num">
                  <TotalChip total={s?.scores.total} />
                </td>
                <td className="num">{o.result?.words ?? '–'}</td>
                <td className="num">{money(meta?.costUsd)}</td>
                <td className="num">{meta ? `${meta.seconds}s` : '–'}</td>
                <td className="num">{meta?.toolCalls ?? '–'}</td>
                <td className="small">
                  {meta?.error ? <span className="bad">{meta.error}</span> : null}
                  {s?.flags.join('; ')}
                </td>
                <td className="num">
                  <span className="actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => go('compare', { a: o.key })}
                    >
                      Read
                    </button>
                    {o.sample.hasTranscript ? (
                      <button
                        type="button"
                        className="link"
                        onClick={() => go('transcript', { run, sample: o.sample.name })}
                      >
                        Transcript
                      </button>
                    ) : null}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
