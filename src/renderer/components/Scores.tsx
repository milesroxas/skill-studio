/** The total chip, a score's move from one version to the next, and the parts one score is made of. */
import { weightMark } from '@domain/case-draft.ts'
import type { Scored } from '@domain/scoring.ts'
import { layerCount } from '@domain/verdict.ts'
import { cva } from 'class-variance-authority'
import { ArrowRightIcon } from 'lucide-react'
import { kindHint, kindLabel, kindOfPart, partLabel, type ScoreBand, scoreBand } from '../model.ts'
import { Explained } from './Help.tsx'
import { Text } from './text.tsx'
import { Badge } from './ui/badge.tsx'

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
    <Badge variant={BADGE_TONE[scoreBand(total)]} numeric>
      {total === null || total === undefined ? '–' : Math.round(total)}
    </Badge>
  )
}

/**
 * How many outputs a mean stands for, "×2". The slot keeps its width when
 * there is one output, so chips beside it line up down a column where only
 * some rows repeat a case. Below `lg` it folds away, so a table of cases fits
 * a 720px window; the score's label says it.
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

const layerValue = cva(
  'block text-md font-semibold whitespace-nowrap tabular-nums text-foreground',
  {
    variants: {
      band: {
        hi: '',
        mid: '',
        lo: 'text-warning',
        vlo: 'text-destructive',
        na: 'text-muted-foreground/70',
      },
    },
  },
)

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

/**
 * A score's move between two outputs or two versions: the earlier chip, an
 * arrow, the later chip and the change. With no earlier score it is the later
 * chip alone, so a list of cases keeps one edge whether or not each was run before.
 */
export function ScoreMove({
  from,
  to,
}: {
  from: number | null | undefined
  to: number | null | undefined
}) {
  const before = from ?? null
  const after = to ?? null
  if (before === null) return <TotalChip total={after} />
  return (
    <span className="inline-flex items-center gap-1">
      <TotalChip total={before} />
      <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="sr-only">then</span>
      <TotalChip total={after} />
      <Delta value={after === null ? null : Math.round(after) - Math.round(before)} />
    </span>
  )
}

/**
 * The parts one score is made of, each with a bar: the rules followed, the
 * checks met, and whatever else was measured. A part counted from facts says
 * the count, "3 of 4", each fact by its weight so a ×2 check counts two and
 * the count agrees with the bar; any other says its score. Bars stay grey
 * until a part is weak, so the eye lands on problems.
 */
/**
 * A part's name. A part a kind of work adds, such as Look, opens what grades
 * it and the way to change that: the reader meets the setting where its
 * score shows, not only where it is kept.
 */
function PartName({ layer, onChangeKinds }: { layer: string; onChangeKinds?: () => void }) {
  const name = partLabel(layer)
  const kind = kindOfPart(layer)
  if (!kind) return name
  return (
    <Explained
      label={name}
      title={name}
      means={`${kindLabel(kind)} grading adds this part. ${kindHint(kind)}`}
      action={
        onChangeKinds ? { label: 'Change what is graded', onClick: onChangeKinds } : undefined
      }
    />
  )
}

export function Parts({
  scored,
  layers,
  other,
  onChangeKinds,
}: {
  scored: Scored
  layers: string[]
  other?: Scored | null
  /** Go to where the kinds of work are ticked. */
  onChangeKinds?: () => void
}) {
  // Every part on one row, or two even rows when there are many: never a lone part on a row of its own.
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
        const count = value === null ? null : layerCount(scored.verdicts, layer)
        return (
          <div key={layer} className={band === 'na' ? 'text-muted-foreground/70' : undefined}>
            <PartName layer={layer} onChangeKinds={onChangeKinds} />
            <b className={layerValue({ band })}>
              {/* A count beside the other side's count already says the change. */}
              {count ? (
                `${count.met} of ${count.total}`
              ) : (
                <>
                  {value ?? '–'}
                  <Delta value={delta} />
                </>
              )}
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
 * A check's ×2 mark after its statement, only when it counts more than the
 * usual 1. Null is a check whose weight is not known yet.
 */
export function CheckWeight({ weight }: { weight: number | null }) {
  if (weight === null || weight === 1) return null
  return (
    <Text tone="muted" size="xs" tabular>
      {' · '}
      {weightMark(weight)}
    </Text>
  )
}
