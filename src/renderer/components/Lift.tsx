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
 *
 * The head holds no sentence: an eyebrow, the mean, and one line under it with
 * the change and the count of cases. What stands behind the number is a note
 * the count opens (`liftNotes`).
 */
import { pointsMoved } from '@domain/lift.ts'
import type { CaseLift } from '@domain/standing.ts'
import { type CSSProperties, type ReactNode, useRef } from 'react'
import { type AsideLine, type LiftNote, liftNotes, plural } from '../model.ts'
import { EXPLAINED } from './Help.tsx'
import { Delta, TotalDetailSection } from './Scores.tsx'
import { Text } from './text.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

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
      className="relative mb-[7px] h-[77px] w-full max-w-[520px] justify-self-end"
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

/** The score without the skill and how many cases it is over, for a screen reader. */
function floorNote(lift: CaseLift): string {
  if (lift.floor === null) return ''
  const some = lift.floorCases < lift.cases ? `, over ${lift.floorCases} of them` : ''
  return ` Without the skill they scored ${round(lift.floor)}${some}.`
}

/**
 * The count of cases under the mean, as the way in to what stands behind the
 * lift: a click opens the notes, each under its heading. Opened by a pointer,
 * it keeps the focus off what it holds, so no ring shows unasked; opened from
 * the keyboard, the focus goes in.
 */
function Cases({ count, notes }: { count: number; notes: readonly LiftNote[] }) {
  const pointed = useRef(false)
  const cases = plural(count, 'case')
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${cases}: how the lift is counted`}
        onPointerDown={() => {
          pointed.current = true
        }}
        onKeyDown={() => {
          pointed.current = false
        }}
        className={EXPLAINED}
      >
        <Text size="xs" tone="muted" tabular>
          {cases}
        </Text>
      </PopoverTrigger>
      <PopoverContent
        size="help"
        align="start"
        onOpenAutoFocus={(event) => {
          if (pointed.current) event.preventDefault()
        }}
      >
        {notes.map((note) => (
          <TotalDetailSection key={note.title} title={note.title}>
            <Text as="p" size="xs" tone="muted" className="m-0 text-pretty">
              {note.text}
            </Text>
          </TotalDetailSection>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The head of All cases: an eyebrow, the mean of the cases' latest scores,
 * large, with the ribbon beside it, and under the mean one small line: what
 * the cases gained since their first runs, and how many they are. The count
 * opens what stands behind the number (`liftNotes`). A screen reader reads
 * the figure as one sentence.
 */
export function LiftFigure({
  lift,
  aside = null,
}: {
  lift: CaseLift
  /** How much of the latest scores was counted, where Jev left some to the reader (`liftAsideLine`). */
  aside?: AsideLine | null
}) {
  const change = pointsMoved(lift.first, lift.latest)
  const floor = floorAt(lift)
  const moved = change ? `${change > 0 ? 'up' : 'down'} ${Math.abs(change)}` : 'no change'
  const summary = `Lift: ${round(lift.latest)}, ${moved} since each case’s first run, over ${plural(lift.cases, 'case')}, from ${round(lift.first)} on their first runs to ${round(lift.latest)} on their latest.${floorNote(lift)}`
  return (
    // Under the band's foot: the line of words, and with it the room the line without the skill falls in.
    <div className="flex flex-col gap-1.5 pb-4">
      <figure
        aria-label={summary}
        className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-10"
      >
        {/* The eyebrow shares its line with the ribbon's upper label, and the mean's foot the band's. */}
        <div aria-hidden="true" className="flex flex-col gap-1.5">
          <Text caps tone="muted">
            Lift
          </Text>
          {/* A round digit overhangs a straight edge to look flush with the eyebrow over it. */}
          <span className="-ml-0.5 text-display tabular-nums">{round(lift.latest)}</span>
        </div>
        {lift.rises ? <Ribbon lift={lift} floor={floor} /> : null}
      </figure>
      <div className="flex items-baseline gap-1.5">
        <span aria-hidden="true" className="flex items-baseline gap-1.5">
          {change ? (
            <Delta value={change} lead={false} />
          ) : (
            <Text size="xs" tone="muted">
              No change
            </Text>
          )}
          <Text size="xs" tone="faint">
            ·
          </Text>
        </span>
        <Cases count={lift.cases} notes={liftNotes(lift, aside)} />
      </div>
    </div>
  )
}
