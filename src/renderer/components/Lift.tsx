/**
 * The version lift on Results: the one data figure drawn as a ribbon, the
 * brand's own S-curve. One band of one thickness runs flat at the first
 * version's mean, rises once and runs flat at the latest version's mean. The
 * top edge of the band stands for the mean. The rise is held at 1.75 times the
 * band, as in the mark, so the vertical axis is scaled to fit and both ends
 * carry their real numbers. Without the skill is a dashed hairline on the same
 * scale. When the latest version is no higher, no ribbon is drawn: the mean
 * and its change say it. See docs/design/brand.md.
 *
 * The figure is a fixed height and stretches only sideways, so the band keeps
 * its thickness at any width; its labels are text over it, at the type scale's
 * own sizes.
 */
import type { Lift } from '@domain/lift.ts'
import type { CSSProperties, ReactNode } from 'react'
import { Delta } from './Scores.tsx'
import { Text } from './text.tsx'

/** The figure's box: its height in px, and a width in its own units that stretches to the column. */
const BOX = { width: 520, height: 104 }
/** The band's thickness and its rise (the mark's 1.75), in px. */
const BAND = 20
const RISE = BAND * 1.75
/** Where the curve starts and ends across the box. */
const CURVE = { from: 0.42, to: 0.72 }
/** The top of the latest band, under its label's line. */
const TOP = 22

/** One band: flat, the mark's curve (both control points at the midpoint), flat. */
function band(y0: number, y1: number): string {
  const a = BOX.width * CURVE.from
  const b = BOX.width * CURVE.to
  const m = (a + b) / 2
  return [
    `M 0 ${y0} H ${a} C ${m} ${y0} ${m} ${y1} ${b} ${y1} H ${BOX.width}`,
    `V ${y1 + BAND} H ${b} C ${m} ${y1 + BAND} ${m} ${y0 + BAND} ${a} ${y0 + BAND} H 0 Z`,
  ].join(' ')
}

const round = (n: number) => Math.round(n)

/** A label over the figure, its foot `top` px down, at one end. */
function Label({
  top,
  end = false,
  inside = false,
  children,
}: {
  top: number
  end?: boolean
  /** Inside the band: centred on its thickness, in the page color. */
  inside?: boolean
  children: ReactNode
}) {
  const style: CSSProperties = inside
    ? { top, height: BAND, [end ? 'right' : 'left']: 8 }
    : { top, [end ? 'right' : 'left']: 0, transform: 'translateY(-100%)' }
  return (
    <span
      style={style}
      className={
        inside
          ? 'absolute flex items-center font-mono text-2xs text-background tabular-nums'
          : 'absolute pb-1 font-mono text-2xs text-muted-foreground tabular-nums'
      }
    >
      {children}
    </span>
  )
}

/** The ribbon itself, when the latest version rises above the first. */
function Ribbon({ lift }: { lift: Lift }) {
  const { first, latest, baseline } = lift
  // Px per point: the rise is fixed, so a lift of 5 and a lift of 40 draw the same shape.
  const scale = RISE / (latest.mean - first.mean)
  const y1 = TOP
  const y0 = TOP + RISE
  const floor = baseline ? y0 + (first.mean - baseline.mean) * scale : null
  // A floor above the first version, or below the box, is left to the words.
  const showFloor = floor !== null && floor > y0 && floor <= BOX.height - 2
  return (
    <div aria-hidden="true" className="relative h-26 w-full max-w-[520px]">
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        {showFloor ? (
          <line
            x1={0}
            x2={BOX.width}
            y1={floor}
            y2={floor}
            className="stroke-muted-foreground"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <path d={band(y0, y1)} className="fill-foreground" />
      </svg>
      <Label top={y0}>{first.version}</Label>
      <Label top={y0} inside>
        {round(first.mean)}
      </Label>
      <Label top={y1} end>
        {latest.version}
      </Label>
      <Label top={y1} end inside>
        {round(latest.mean)}
      </Label>
      {showFloor && baseline ? (
        <Label top={floor} end>
          without skill {round(baseline.mean)}
        </Label>
      ) : null}
    </div>
  )
}

/**
 * The head of Results: the latest version's mean, large, what it gained since
 * the first, and the ribbon beside it. A screen reader reads it as one sentence.
 */
export function VersionLift({
  lift,
  writer,
}: {
  lift: Lift
  /** Who wrote both runs: the lift compares one writer with itself. */
  writer: string
}) {
  const { first, latest, baseline } = lift
  const change = round(latest.mean) - round(first.mean)
  const summary = `Version lift for ${writer}: ${first.version} scored ${round(first.mean)}, ${latest.version} scored ${round(latest.mean)}${baseline ? `, and without the skill ${round(baseline.mean)}` : ''}${lift.casesDiffer ? `, over the ${lift.sharedCases} cases both runs answered` : ''}.`
  return (
    <figure
      aria-label={summary}
      className="m-0 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-b pb-6"
    >
      <div aria-hidden="true" className="flex flex-col gap-1">
        <Text caps tone="muted">
          Version lift
        </Text>
        <div className="flex items-end gap-3">
          <span className="text-display tabular-nums">{round(latest.mean)}</span>
          <span className="flex flex-col pb-1.5">
            <Text size="ui" tone="muted">
              {change ? <Delta value={change} /> : 'No change'} since {first.version}
            </Text>
            {/* Delta keeps its own lead from the score; this line starts where it does. */}
            <Text size="ui" tone="muted" className={change ? 'pl-1.5' : undefined}>
              {writer}
              {lift.casesDiffer
                ? `, over the ${lift.sharedCases} ${lift.sharedCases === 1 ? 'case' : 'cases'} both runs answered`
                : null}
            </Text>
          </span>
        </div>
      </div>
      {lift.rises ? <Ribbon lift={lift} /> : null}
    </figure>
  )
}
