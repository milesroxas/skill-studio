/** Your marks against the bench, per layer: what to change, the skill or the benchmark. */
import { mean, spearman } from '@core/stats.ts'
import { useState } from 'react'
import type { Ctx } from '../ctx.ts'
import {
  capital,
  layerHomeOf,
  layersOf,
  type Output,
  outputByKey,
  reviewOf,
  runName,
  runStamp,
  scoreOf,
  totalOf,
} from '../model.ts'

type Bucket = 'bothGood' | 'bothBad' | 'missed' | 'harsh'
const BUCKETS: Array<[Bucket, string, string]> = [
  ['bothGood', 'Both good', 'You good, bench good'],
  ['bothBad', 'Both bad', 'You bad, bench low: the skill'],
  ['missed', 'Bench missed', 'You bad, bench high: the benchmark missed it'],
  ['harsh', 'Too harsh', 'You good, bench low: the benchmark is too harsh'],
]

export function Insights({ ctx }: { ctx: Ctx }) {
  const { state, config, outputs, go } = ctx
  const [open, setOpen] = useState<{ layer: string; bucket: Bucket } | null>(null)
  const layers = layersOf(config)
  const at = config.agreeAt
  const cells: Record<string, Record<Bucket, string[]>> = Object.fromEntries(
    layers.map((l) => [l, { bothGood: [], bothBad: [], missed: [], harsh: [] }]),
  )
  const rated: Array<{ output: Output; rating: number; total: number }> = []
  for (const output of outputs) {
    const review = reviewOf(state, output.key)
    const s = scoreOf(output, config)
    if (!review || !s) continue
    if (review.rating && s.scores.total !== null)
      rated.push({ output, rating: review.rating, total: s.scores.total })
    for (const [layer, mark] of Object.entries(review.layers)) {
      const value = s.scores[layer]
      if (value === null || value === undefined || !cells[layer]) continue
      const high = value >= at
      const bucket: Bucket =
        mark === 'good' ? (high ? 'bothGood' : 'harsh') : high ? 'missed' : 'bothBad'
      cells[layer][bucket].push(output.key)
    }
  }
  const rho = spearman(
    rated.map((r) => r.rating),
    rated.map((r) => r.total),
  )
  const prefs = state.reviews.preferences.filter((p) => p.by === 'human')
  // A vote can name an output whose run is gone; it then has no bench side.
  const totalByKey = (key: string) => {
    const output = outputByKey(outputs, key)
    return output ? totalOf(output, config) : null
  }
  const prefRows = prefs.map((p) => {
    const sa = totalByKey(p.a)
    const sb = totalByKey(p.b)
    const bench = sa === null || sb === null ? null : sa === sb ? 'tie' : sa > sb ? 'a' : 'b'
    return { p, bench, agree: bench === p.vote }
  })
  const agreed = prefRows.filter((r) => r.agree).length
  const marked = Object.values(cells).some((c) => Object.values(c).some((l) => l.length))

  if (!marked && !rated.length && !prefs.length)
    return (
      <div className="empty">
        <h2>No reviews yet</h2>
        <p className="help">
          Insights sets your judgement against the bench's. Rate outputs and mark their layers Good
          or Bad, and this shows which layers need a skill change and which need a bench change.
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={() => go('blind')}>
            Start a blind review
          </button>
        </div>
      </div>
    )

  return (
    <div className="screen narrow">
      {marked ? (
        <section className="section">
          <div className="section-head">
            <h2>Your marks against the bench</h2>
            <p className="help">
              A layer score of {at} or more counts as good. Open a count to list those outputs.
            </p>
          </div>
          <table className="grid-table">
            <thead>
              <tr>
                <th>Layer</th>
                {BUCKETS.map(([id, label, title]) => (
                  <th key={id} className="num" title={title}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {layers.map((layer) => (
                <tr key={layer}>
                  <td>{capital(layer)}</td>
                  {BUCKETS.map(([bucket]) => {
                    const n = cells[layer][bucket].length
                    return (
                      <td key={bucket} className="num">
                        {n ? (
                          <button
                            type="button"
                            className="cell-btn"
                            onClick={() => setOpen({ layer, bucket })}
                          >
                            {n}
                          </button>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {open ? (
            <div className="stack">
              {cells[open.layer][open.bucket].map((k) => (
                <button
                  key={k}
                  type="button"
                  className="link"
                  onClick={() => go('compare', { a: k })}
                >
                  {k}
                </button>
              ))}
            </div>
          ) : null}
          {layers.map((layer) => {
            const c = cells[layer]
            const markCount =
              c.bothGood.length + c.bothBad.length + c.missed.length + c.harsh.length
            if (!markCount) return null
            const home = layerHomeOf(layer)
            const wrong = c.missed.length + c.harsh.length
            if (wrong && wrong >= c.bothBad.length)
              return (
                <div key={layer} className="verdict bench">
                  <b>{capital(layer)}: tune the benchmark</b>
                  {c.missed.length
                    ? `It scored ${c.missed.length} output(s) high that you marked bad. `
                    : ''}
                  {c.harsh.length
                    ? `It scored ${c.harsh.length} output(s) low that you marked good. `
                    : ''}
                  {home ? `Change: ${home.bench}.` : ''}
                </div>
              )
            if (c.bothBad.length)
              return (
                <div key={layer} className="verdict skill">
                  <b>{capital(layer)}: change the skill</b>
                  You and the bench agree {c.bothBad.length} output(s) fall short.{' '}
                  {home ? `Change: ${home.skill}.` : ''}
                </div>
              )
            return (
              <div key={layer} className="verdict ok">
                <b>{capital(layer)}: holding</b>
                You and the bench agree the outputs you marked are good.
              </div>
            )
          })}
        </section>
      ) : null}

      {rated.length ? (
        <section className="section">
          <div className="section-head">
            <h2>Your rating against the total</h2>
            <p className="help">
              {rated.length} rated · rank correlation{' '}
              {rho === null
                ? 'needs 3 or more'
                : `${rho.toFixed(2)}${rho > 0.6 ? ': the bench ranks like you do.' : rho > 0.2 ? ': loosely related; read the disagreements.' : ': the bench does not rank like you yet.'}`}
            </p>
          </div>
          <svg
            className="scatter"
            viewBox="0 0 320 170"
            role="img"
            aria-label="Rating against bench total"
          >
            <line className="axis" x1="40" y1="150" x2="310" y2="150" />
            <line className="axis" x1="40" y1="10" x2="40" y2="150" />
            {[1, 2, 3, 4, 5].map((n) => (
              <text key={n} x={40 + (n - 1) * 66} y="165" textAnchor="middle">
                {n}
              </text>
            ))}
            {[0, 50, 100].map((v) => (
              <text key={v} x="34" y={150 - v * 1.4 + 3} textAnchor="end">
                {v}
              </text>
            ))}
            {rated.map((r, i) => (
              <circle
                key={r.output.key}
                className="dot"
                cx={40 + (r.rating - 1) * 66 + ((i * 7) % 15) - 7}
                cy={150 - r.total * 1.4}
                r="4.5"
              >
                <title>
                  {r.output.key}: you {r.rating}, bench {r.total}
                </title>
              </circle>
            ))}
          </svg>
        </section>
      ) : null}

      {prefs.length ? (
        <section className="section">
          <div className="section-head">
            <h2>Pairs</h2>
            <p className="help">
              The bench agrees with your pick in {agreed} of {prefs.length}.
            </p>
          </div>
          {prefRows
            .filter((r) => !r.agree && r.bench)
            .map(({ p, bench }) => (
              <div key={`${p.a}|${p.b}|${p.criterion}`} className="verdict bench">
                <b>
                  You picked {p.vote === 'tie' ? 'a tie' : p.vote.toUpperCase()}, the bench{' '}
                  {bench === 'tie' ? 'a tie' : bench?.toUpperCase()} ({p.criterion})
                </b>
                {p.a} vs {p.b}
              </div>
            ))}
        </section>
      ) : null}

      <section className="section">
        <h2>Runs</h2>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Run</th>
              <th className="num">Outputs</th>
              <th className="num">Bench mean</th>
              <th className="num">Your mean</th>
              <th>Top flags</th>
            </tr>
          </thead>
          <tbody>
            {state.runs.map((run) => {
              const mine = outputs.filter((o) => o.run.name === run.name)
              const totals = mine.map((o) => totalOf(o, config)).filter((v) => v !== null)
              const ratings = mine
                .map((o) => reviewOf(state, o.key)?.rating ?? null)
                .filter((v) => v !== null)
              const counts = new Map<string, number>()
              for (const o of mine)
                for (const f of scoreOf(o, config)?.flags ?? []) {
                  const kind = f.replace(/:.*$/, '')
                  counts.set(kind, (counts.get(kind) ?? 0) + 1)
                }
              const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 2)
              const avg = (v: number[]) => {
                const m = mean(v)
                return m === null ? '–' : (Math.round(m * 10) / 10).toString()
              }
              return (
                <tr key={run.name}>
                  <td>
                    {runName(run)}
                    <span className="sub">{runStamp(run)}</span>
                  </td>
                  <td className="num">{mine.length}</td>
                  <td className="num">{avg(totals)}</td>
                  <td className="num">{avg(ratings)}</td>
                  <td className="small">{top.map(([k, n]) => `${k} ×${n}`).join(', ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}
