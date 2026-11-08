/** Layer bars, the total chip and the flag list for one scored output. */
import type { Scored } from '@domain/scoring.ts'
import { cva } from 'class-variance-authority'
import { capital, type ScoreBand, scoreBand } from '../model.ts'
import { Text } from './text.tsx'
import { Badge } from './ui/badge.tsx'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.tsx'

const BADGE_TONE = {
  hi: 'success',
  mid: 'secondary',
  lo: 'warning',
  vlo: 'danger',
  na: 'secondary',
} as const

/**
 * The total out of 100 as a chip whose color says how good it is. Every chip
 * is as wide as "100" (40px), so a column of them keeps one edge. A mean
 * shows as a whole number.
 */
export function TotalChip({ total }: { total: number | null | undefined }) {
  return (
    <Badge variant={BADGE_TONE[scoreBand(total)]} className="min-w-10 font-mono tabular-nums">
      {total === null || total === undefined ? '–' : Math.round(total)}
    </Badge>
  )
}

/**
 * How many outputs a mean stands for, "×2". The slot keeps its width when
 * there is one output, so chips beside it line up down a column where only
 * some rows repeat a case. Below `lg` it folds away, as an optional column
 * does, so a table of cases fits a 720px window; the score's label says it.
 */
export function SampleCount({ count }: { count: number }) {
  return (
    <span className="min-w-5 text-left text-xs font-normal text-muted-foreground tabular-nums max-lg:hidden">
      {count > 1 ? `×${count}` : null}
    </span>
  )
}

export function Delta({ value }: { value: number | null }) {
  if (!value) return null
  return (
    <Text
      tone={value > 0 ? 'success' : 'destructive'}
      size="xs"
      weight="semibold"
      tabular
      className="ml-1.5"
    >
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </Text>
  )
}

const layerValue = cva('block text-md font-semibold tabular-nums text-foreground', {
  variants: {
    band: {
      hi: '',
      mid: '',
      lo: 'text-warning',
      vlo: 'text-destructive',
      na: 'text-muted-foreground/70',
    },
  },
})

const layerBar = cva('block h-full bg-input', {
  variants: {
    band: {
      hi: '',
      mid: '',
      lo: 'bg-warning',
      vlo: 'bg-destructive',
      na: '',
    },
  },
})

/** Each layer's score with a bar. Bars stay grey until a layer is weak, so the eye lands on problems. */
export function Layers({
  scored,
  layers,
  other,
}: {
  scored: Scored
  layers: string[]
  other?: Scored | null
}) {
  // Every layer on one row, or two even rows when there are many: never a lone layer on a row of its own.
  const perRow = layers.length > 6 ? Math.ceil(layers.length / 2) : layers.length
  return (
    <div
      className="grid gap-x-4 gap-y-3 border-b px-4 py-3 text-xs text-muted-foreground"
      style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
    >
      {layers.map((layer) => {
        const value = scored.scores[layer] ?? null
        const o = other?.scores[layer] ?? null
        const delta = value !== null && o !== null ? value - o : null
        const band: ScoreBand = scoreBand(value)
        return (
          <div key={layer} className={band === 'na' ? 'text-muted-foreground/70' : undefined}>
            {capital(layer)}
            <b className={layerValue({ band })}>
              {value ?? '–'}
              <Delta value={delta} />
            </b>
            <div className="mt-1 h-0.75 overflow-hidden rounded-xs bg-muted">
              <span className={layerBar({ band })} style={{ width: `${value ?? 0}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * How much a check counts, after its statement, only when it is not the usual
 * 1: "weight 2" counts twice. Null is a check whose weight is not known yet.
 */
export function CheckWeight({ weight }: { weight: number | null }) {
  if (weight === null || weight === 1) return null
  return (
    <Text tone="muted" size="xs" tabular>
      {' · '}weight {weight}
    </Text>
  )
}

export function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return null
  return (
    <Collapsible defaultOpen={flags.length <= 3} className="border-b px-4 py-2.5 text-xs">
      <CollapsibleTrigger className="cursor-pointer text-warning hover:underline">
        {flags.length} flag{flags.length > 1 ? 's' : ''}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1.5 list-disc pl-4.5">
          {flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
