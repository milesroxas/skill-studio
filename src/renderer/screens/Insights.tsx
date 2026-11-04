/** Your marks against the bench, per layer: what to change, the skill or the benchmark. */
import { mean, spearman } from '@domain/stats.ts'
import { useState } from 'react'
import { EmptyState, Screen, Section, SectionHead, Stack } from '../components/layout.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.tsx'
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
  capital,
  layerHomeOf,
  layersOf,
  type Output,
  outputByKey,
  reviewOf,
  runLabel,
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
      <EmptyState
        title="No reviews yet"
        actions={
          <Button type="button" onClick={() => go('blind')}>
            Start a blind review
          </Button>
        }
      >
        Once you rate some answers, this shows where you and the judge disagree, and whether to
        change the skill or the scoring.
      </EmptyState>
    )

  return (
    <Screen width="narrow">
      {marked ? (
        <Section>
          <SectionHead>
            <Heading level={2}>Your marks against the bench</Heading>
            <Hint>
              A layer score of {at} or more counts as good. Open a count to list those outputs.
            </Hint>
          </SectionHead>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Layer</TableHead>
                {BUCKETS.map(([id, label, title]) => (
                  <TableHead key={id} numeric title={title}>
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {layers.map((layer) => (
                <TableRow key={layer}>
                  <TableCell>{capital(layer)}</TableCell>
                  {BUCKETS.map(([bucket]) => {
                    const n = cells[layer][bucket].length
                    return (
                      <TableCell key={bucket} numeric>
                        {n ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="cell"
                            onClick={() => setOpen({ layer, bucket })}
                          >
                            {n}
                          </Button>
                        ) : (
                          <Text tone="muted">0</Text>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {open ? (
            <Stack align="start">
              {cells[open.layer][open.bucket].map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant="link-muted"
                  size="inline"
                  onClick={() => go('compare', { a: k })}
                >
                  {k}
                </Button>
              ))}
            </Stack>
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
                <Alert key={layer} variant="warning">
                  <AlertTitle>{capital(layer)}: tune the benchmark</AlertTitle>
                  <AlertDescription>
                    {c.missed.length
                      ? `It scored ${c.missed.length} output(s) high that you marked bad. `
                      : ''}
                    {c.harsh.length
                      ? `It scored ${c.harsh.length} output(s) low that you marked good. `
                      : ''}
                    {home ? `Change: ${home.bench}.` : ''}
                  </AlertDescription>
                </Alert>
              )
            if (c.bothBad.length)
              return (
                <Alert key={layer} variant="destructive">
                  <AlertTitle>{capital(layer)}: change the skill</AlertTitle>
                  <AlertDescription>
                    You and the bench agree {c.bothBad.length} output(s) fall short.{' '}
                    {home ? `Change: ${home.skill}.` : ''}
                  </AlertDescription>
                </Alert>
              )
            return (
              <Alert key={layer} variant="success">
                <AlertTitle>{capital(layer)}: holding</AlertTitle>
                <AlertDescription>
                  You and the bench agree the outputs you marked are good.
                </AlertDescription>
              </Alert>
            )
          })}
        </Section>
      ) : null}

      {rated.length ? (
        <Section>
          <SectionHead>
            <Heading level={2}>Your rating against the total</Heading>
            <Hint>
              {rated.length} rated · rank correlation{' '}
              {rho === null
                ? 'needs 3 or more'
                : `${rho.toFixed(2)}${rho > 0.6 ? ': the bench ranks like you do.' : rho > 0.2 ? ': loosely related; read the disagreements.' : ': the bench does not rank like you yet.'}`}
            </Hint>
          </SectionHead>
          <Scatter rated={rated} />
        </Section>
      ) : null}

      {prefs.length ? (
        <Section>
          <SectionHead>
            <Heading level={2}>Pairs</Heading>
            <Hint>
              The bench agrees with your pick in {agreed} of {prefs.length}.
            </Hint>
          </SectionHead>
          {prefRows
            .filter((r) => !r.agree && r.bench)
            .map(({ p, bench }) => (
              <Alert key={`${p.a}|${p.b}|${p.criterion}`} variant="warning">
                <AlertTitle>
                  You picked {p.vote === 'tie' ? 'a tie' : p.vote.toUpperCase()}, the bench{' '}
                  {bench === 'tie' ? 'a tie' : bench?.toUpperCase()} ({p.criterion})
                </AlertTitle>
                <AlertDescription>
                  {p.a} vs {p.b}
                </AlertDescription>
              </Alert>
            ))}
        </Section>
      ) : null}

      <Section>
        <Heading level={2}>Runs</Heading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead numeric>Outputs</TableHead>
              <TableHead numeric>Bench mean</TableHead>
              <TableHead numeric>Your mean</TableHead>
              <TableHead>Top flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
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
                <TableRow key={run.name}>
                  <TableCell wrap>
                    {runLabel(run)}
                    <Text block tone="muted" size="xs">
                      {runStamp(run)}
                    </Text>
                  </TableCell>
                  <TableCell numeric>{mine.length}</TableCell>
                  <TableCell numeric>{avg(totals)}</TableCell>
                  <TableCell numeric>{avg(ratings)}</TableCell>
                  <TableCell wrap>
                    <Text size="xs">{top.map(([k, n]) => `${k} ×${n}`).join(', ')}</Text>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Section>
    </Screen>
  )
}

/** Your 1 to 5 against the bench total, one dot per rated output. */
function Scatter({ rated }: { rated: Array<{ output: Output; rating: number; total: number }> }) {
  return (
    <svg
      className="h-auto w-full max-w-[420px] fill-muted-foreground text-[10px]"
      viewBox="0 0 320 170"
      role="img"
      aria-label="Rating against bench total"
    >
      <line className="stroke-input" x1="40" y1="150" x2="310" y2="150" />
      <line className="stroke-input" x1="40" y1="10" x2="40" y2="150" />
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
          className="fill-foreground opacity-70"
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
  )
}
