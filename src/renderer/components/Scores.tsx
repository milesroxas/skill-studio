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

/** The total out of 100 as a chip whose color says how good it is. */
export function TotalChip({ total }: { total: number | null | undefined }) {
  return (
    <Badge variant={BADGE_TONE[scoreBand(total)]} className="min-w-9 tabular-nums">
      {total ?? '–'}
    </Badge>
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

const layerValue = cva('block text-[15px] font-semibold tabular-nums text-foreground', {
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
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-x-4 gap-y-3 border-b px-4 py-3 text-xs text-muted-foreground">
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
            <div className="mt-1 h-[3px] overflow-hidden rounded-xs bg-muted">
              <span className={layerBar({ band })} style={{ width: `${value ?? 0}%` }} />
            </div>
          </div>
        )
      })}
    </div>
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
