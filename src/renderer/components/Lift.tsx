/**
 * The lift on Results: the one data figure drawn as a ribbon, the brand's own
 * S-curve. One band of one thickness runs flat at the mean of the cases' first
 * scores, rises once and runs flat at the mean of their latest. The top edge
 * of the band stands for the mean. The rise is held at 1.75 times the band, as
 * in the mark, so the vertical axis is scaled to fit and both ends carry their
 * real numbers. Without the skill is a dashed hairline on the same scale. When
 * the latest mean is no higher in the whole points shown, no ribbon is drawn:
 * the mean and its change say it. See docs/design/brand.md.
 *
 * The figure is a fixed height and stretches only sideways, so the band keeps
 * its thickness at any width; its labels are text over it, at the type scale's
 * own sizes. It ends where its lower band ends, and that foot stands on the
 * baseline of the mean beside it.
 */
import { pointsMoved } from '@domain/lift.ts'
import type { CaseLift } from '@domain/standing.ts'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { plural } from '../model.ts'
import { Delta } from './Scores.tsx'
import { Text } from './text.tsx'

/** The band's thickness and its rise (the mark's 1.75), in px. */
const BAND = 20
const RISE = BAND * 1.75
/** The top of the latest band, under its label's line. */
const TOP = 22
/** The figure's box: a width in its own units that stretches to the column, and its height in px, the lower band's foot. */
const BOX = { width: 520, height: TOP + RISE + BAND }
/** The room under the lower band that the line without the skill may take. */
const UNDER = 28
/** Where the curve starts and ends across the box. */
const CURVE = { from: 0.42, to: 0.72 }

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
          : 'absolute pb-1 font-mono text-2xs whitespace-nowrap text-muted-foreground tabular-nums'
      }
    >
      {children}
    </span>
  )
}

/** Where the line without the skill falls under the lower band, in px; null when it is left to the words. */
function floorAt(lift: CaseLift): number | null {
  if (lift.floor === null || !lift.rises) return null
  const y0 = TOP + RISE
  const at = y0 + (lift.first - lift.floor) * (RISE / (lift.latest - lift.first))
  // A floor above the first scores, or below the figure's room, is left to the words.
  return at > y0 && at <= BOX.height + UNDER - 2 ? at : null
}

/** The ribbon itself, when the latest scores rise above the first. */
function Ribbon({ lift, floor }: { lift: CaseLift; floor: number | null }) {
  const y1 = TOP
  const y0 = TOP + RISE
  return (
    // The digits beside it stand 7px above their line's foot: the band's foot is set on that line.
    <div
      aria-hidden="true"
      className="relative mb-[7px] h-[77px] w-full max-w-[520px] flex-[1_1_240px]"
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        {floor !== null ? (
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
      <Label top={y0}>first runs</Label>
      <Label top={y0} inside>
        {round(lift.first)}
      </Label>
      <Label top={y1} end>
        latest runs
      </Label>
      <Label top={y1} end inside>
        {round(lift.latest)}
      </Label>
      {floor !== null && lift.floor !== null ? (
        <Label top={floor} end>
          without skill {round(lift.floor)}
        </Label>
      ) : null}
    </div>
  )
}

/** Which cases the lift is read over, as the line under its change. */
const overLine = (lift: CaseLift): string =>
  `Over ${plural(lift.cases, 'case')} that ran more than once${lift.mixed ? ', on more than one model' : ''}${floorRules(lift)}`

/** What the line under the change says when a score without the skill was graded on another version's rules. */
const floorRules = (lift: CaseLift): string =>
  lift.floor !== null && lift.floorApart
    ? '; without the skill, graded on another version’s rules'
    : ''

/** The same, for a screen reader, with the score without the skill and how many cases it is over. */
function floorNote(lift: CaseLift): string {
  if (lift.floor === null) return ''
  const some = lift.floorCases < lift.cases ? `, over ${lift.floorCases} of them` : ''
  return ` Without the skill they scored ${round(lift.floor)}${some}.`
}

/**
 * The head of All cases: the mean of the cases' latest scores, large, what
 * they gained since their first runs, and the ribbon beside it. A screen
 * reader reads it as one sentence.
 */
export function LiftFigure({ lift }: { lift: CaseLift }) {
  const change = pointsMoved(lift.first, lift.latest)
  const floor = floorAt(lift)
  const summary = `Lift: ${overLine(lift).toLowerCase()}, from ${round(lift.first)} on their first runs to ${round(lift.latest)} on their latest.${floorNote(lift)}`
  return (
    <figure
      aria-label={summary}
      // With the line without the skill, the figure keeps the room it falls in under the band.
      className={cn(
        'm-0 flex flex-wrap items-end justify-between gap-x-10 gap-y-4',
        floor === null ? 'pb-5' : 'pb-12',
      )}
    >
      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <Text caps tone="muted">
          Lift
        </Text>
        <div className="flex items-end gap-3">
          {/* A round digit overhangs a straight edge to look flush with the label over it. */}
          <span className="-ml-0.5 text-display tabular-nums">{round(lift.latest)}</span>
          <span className="flex max-w-[30ch] flex-col pb-px text-pretty">
            <Text size="ui" tone="muted">
              {change ? <Delta value={change} lead={false} /> : 'No change'} since each case’s first
              run
            </Text>
            <Text size="ui" tone="muted">
              {overLine(lift)}
            </Text>
          </span>
        </div>
      </div>
      {lift.rises ? <Ribbon lift={lift} floor={floor} /> : null}
    </figure>
  )
}
