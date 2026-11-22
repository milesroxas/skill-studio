/** The total chip, a score's move from one version to the next, and a check's weight. */
import { weightMark } from '@domain/case-draft.ts'
import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { scoreBand } from '../model.ts'
import { useArrived } from '../motion.ts'
import { Text } from './text.tsx'
import { Badge } from './ui/badge.tsx'
import { PopoverSection } from './ui/popover.tsx'

const BADGE_TONE = {
  hi: 'success',
  mid: 'secondary',
  lo: 'warning',
  vlo: 'danger',
  na: 'secondary',
} as const

/** A stale score's number: muted while it holds, amber or red once it is weak, so a low one still stands out. */
const staleTone = cva('', {
  variants: {
    band: {
      hi: 'text-muted-foreground',
      mid: 'text-muted-foreground',
      lo: 'text-warning',
      vlo: 'text-destructive',
      na: 'text-muted-foreground',
    },
  },
})

/**
 * The total out of 100 as a chip whose color says how good it is. Every chip
 * is as wide as "100" (40px), so a column of them keeps one edge. A mean
 * shows as a whole number. `stale` is a score from an earlier version than the
 * skill as it is now: the chip stands open, an edge and no fill, until the
 * case runs again. A screen reader hears "from an earlier version".
 */
export function TotalChip({
  total,
  stale = false,
}: {
  total: number | null | undefined
  stale?: boolean
}) {
  const shown = total === null || total === undefined ? '–' : Math.round(total)
  if (stale)
    return (
      <Badge variant="outline" numeric className={staleTone({ band: scoreBand(total) })}>
        {shown}
        <span className="sr-only">, from an earlier version</span>
      </Badge>
    )
  return (
    <Badge variant={BADGE_TONE[scoreBand(total)]} numeric>
      {shown}
    </Badge>
  )
}

/** One part of what is behind a total: its heading, then what it holds. */
export function TotalDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PopoverSection pad="text">
      <Text size="ui" weight="medium">
        {title}
      </Text>
      {children}
    </PopoverSection>
  )
}

/**
 * How many outputs a mean stands for, "×2". The slot keeps its width when
 * there is one output, so chips beside it line up down a column where only
 * some rows repeat a case. Below `lg` it folds away, so a table of cases fits
 * a 720px window.
 */
export function SampleCount({ count }: { count: number }) {
  return (
    <span className="min-w-5 text-left text-xs font-normal text-muted-foreground tabular-nums max-lg:hidden">
      {count > 1 ? `×${count}` : null}
    </span>
  )
}

/** A change between two scores. `lead` is its own space after a score it follows; without one it opens a line or stands alone in a cell. */
export function Delta({ value, lead = true }: { value: number | null; lead?: boolean }) {
  if (!value) return null
  return (
    <Text
      tone={value > 0 ? 'success' : 'destructive'}
      size="xs"
      weight="semibold"
      tabular
      className={lead ? 'ml-1.5' : undefined}
    >
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </Text>
  )
}

/**
 * A score at the end of a row that lists a case: a `NavButton` in a list
 * column, a row of All cases. The chip alone. When the score changes while the
 * list is in view, as a run is graded, the new one comes up a few pixels; a
 * score there when the list opens rests. `stale` is `TotalChip`'s.
 */
export function ListScore({
  total,
  stale = false,
}: {
  total: number | null | undefined
  stale?: boolean
}) {
  const shown = total === null || total === undefined ? '' : String(Math.round(total))
  const changed = useArrived(shown)
  return (
    // On the open row the chip takes an edge: a grey chip on the row's grey fill would vanish.
    <span
      key={shown}
      className={cn(
        'inline-flex group-data-[current]/row:*:border-border',
        changed && 'animate-tick',
      )}
    >
      <TotalChip total={total} stale={stale} />
    </span>
  )
}

/**
 * How a score moved, in words, for the line under a row's title: "Up 11 from
 * v0", "Down 4 from v0", "Same as v0". `change` is in the whole points shown,
 * read as a change is (`changeBetween` in `model.ts`). `against` names the earlier version;
 * null means the earlier score was written without the skill, so the line says
 * what the skill did: "Up 20 with the skill". Only a drop is colored: a rise
 * is the resting state, and the eye should land on what got worse.
 */
export function ScoreChange({ change, against }: { change: number; against: string | null }) {
  const tail = against === null ? 'with the skill' : `from ${against}`
  if (change === 0) return against === null ? 'Same as without the skill' : `Same as ${against}`
  if (change > 0) return `Up ${change} ${tail}`
  return (
    <>
      <Text tone="destructive">Down {-change}</Text> {tail}
    </>
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
