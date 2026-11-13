/** The total chip and what is behind it, a score's move from one version to the next, and the parts one score is made of. */
import { weightMark } from '@domain/case-draft.ts'
import type { Scored } from '@domain/scoring.ts'
import { layerCount } from '@domain/verdict.ts'
import { cva } from 'class-variance-authority'
import { type ReactNode, useRef } from 'react'
import { cn } from '../lib/utils.ts'
import { kindHint, kindLabel, kindOfPart, partLabel, type ScoreBand, scoreBand } from '../model.ts'
import { useArrived } from '../motion.ts'
import { Explained } from './Help.tsx'
import { Text } from './text.tsx'
import { Badge } from './ui/badge.tsx'
import { Popover, PopoverContent, PopoverSection, PopoverTrigger } from './ui/popover.tsx'

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
 * The total chip as a button: a click opens what lies behind the number, in
 * `TotalDetailSection`s. A click, never a hover, so a part's own note opens
 * inside it. Opened by a pointer, it keeps the focus off what it holds, so no
 * ring shows unasked; opened from the keyboard, the focus goes in.
 */
export function TotalDetail({
  total,
  children,
}: {
  total: number | null | undefined
  children: ReactNode
}) {
  const pointed = useRef(false)
  const shown = total === null || total === undefined ? 'not graded yet' : Math.round(total)
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Score ${shown}: what it is counted from`}
        onPointerDown={() => {
          pointed.current = true
        }}
        onKeyDown={() => {
          pointed.current = false
        }}
        className="rounded-sm focus-ring transition-[box-shadow] duration-150 ease-out hover:ring-2 hover:ring-border data-[state=open]:ring-2 data-[state=open]:ring-border"
      >
        <TotalChip total={total} />
      </PopoverTrigger>
      <PopoverContent
        size="help"
        align="end"
        onOpenAutoFocus={(event) => {
          if (pointed.current) event.preventDefault()
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
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

/** A part's count or score: plain while it holds, amber or red once it is weak. */
const partValue = cva('font-semibold whitespace-nowrap tabular-nums text-foreground', {
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

/**
 * A score at the end of a `NavButton` in a list column: the chip alone. When the
 * score changes while the list is in view, as a run is graded, the new one
 * comes up a few pixels; a score there when the list opens rests.
 */
export function ListScore({ total }: { total: number | null | undefined }) {
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
      <TotalChip total={total} />
    </span>
  )
}

/**
 * How a score moved, in words, for the line under a row's title: "Up 11 from
 * v0", "Down 4 from v0", "Same as v0". `against` names the earlier version;
 * null means the earlier score was written without the skill, so the line says
 * what the skill did: "Up 20 with the skill". Only a drop is colored: a rise
 * is the resting state, and the eye should land on what got worse.
 */
export function ScoreChange({
  from,
  to,
  against,
}: {
  from: number
  to: number
  against: string | null
}) {
  const change = Math.round(to) - Math.round(from)
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

/**
 * The parts one score is made of, a row each: the rules followed, the checks
 * met, and whatever else was measured. A part counted from facts says the
 * count, "3 of 4", each fact by its weight so a ×2 check counts two; any other
 * says its score and its move from the other side. Only a weak part is colored,
 * so the eye lands on it.
 */
export function PartList({
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
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5 text-xs">
      {layers.map((layer) => {
        const value = scored.scores[layer] ?? null
        const o = other?.scores[layer] ?? null
        const delta = value !== null && o !== null ? value - o : null
        const band: ScoreBand = scoreBand(value)
        const count = value === null ? null : layerCount(scored.verdicts, layer)
        return (
          <div key={layer} className="contents">
            <dt className="text-muted-foreground">
              <PartName layer={layer} onChangeKinds={onChangeKinds} />
            </dt>
            <dd className="m-0 text-right">
              <span className={partValue({ band })}>
                {count ? `${count.met} of ${count.total}` : (value ?? '–')}
              </span>
              {count ? null : <Delta value={delta} />}
            </dd>
          </div>
        )
      })}
    </dl>
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
