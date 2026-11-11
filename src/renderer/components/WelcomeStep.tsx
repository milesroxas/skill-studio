/**
 * One step of the welcome, the frame the tour and the setup share: the step's
 * number large, its title and one sentence in a column, what it shows or asks
 * beside them, and Back and the way forward at the foot. A step that stands
 * alone, as the setup does, has no number: "01" of one counts nothing.
 *
 * The frame holds still from step to step, so the way forward stays under the
 * pointer and only the step itself changes. The step comes in from the side
 * the reader is heading to.
 */
import type { ReactNode } from 'react'
import { Heading, Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** The welcome's way in, on the opening and at the end of the tour: the walkthrough's sample skill. */
export const TRY_SAMPLE = 'Try it on a sample skill'

/** When a step's own parts start to move: it has slid in and the eye has reached them. */
export const STEP_BEAT = 260

/** A step's number as the welcome shows it: two figures, "01". */
const numeral = (index: number): string => String(index + 1).padStart(2, '0')

/**
 * How far through the steps the reader is: each step's number in mono, the
 * current one yellow on ink. A screen reader hears it in words.
 */
export function StepProgress({ count, index }: { count: number; index: number }) {
  return (
    <div className="flex animate-in items-center gap-1 duration-300 ease-out fade-in-0">
      {Array.from({ length: count }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the numbers are the positions themselves
          key={i}
          aria-hidden="true"
          data-surface={i === index ? 'ink' : undefined}
          className="flex h-5 w-7.5 items-center justify-center rounded-sm font-mono text-2xs font-medium text-muted-foreground tabular-nums transition-colors duration-150 ease-out data-[surface=ink]:text-signal"
        >
          {numeral(i)}
        </span>
      ))}
      <span className="sr-only">
        Step {index + 1} of {count}
      </span>
    </div>
  )
}

export function StepFrame({
  label,
  id,
  index,
  from,
  title,
  say,
  busy,
  onBack,
  next,
  children,
}: {
  /** What the steps are, for a screen reader: "How it works", "Set up". */
  label: string
  /** The step's own name, so a new step mounts and plays its entrance. */
  id: string
  /** Where the step stands among its own; left out for a step that stands alone. */
  index?: number
  /** The step before it, which says which side this one arrives from. */
  from?: number
  title: string
  say: string
  /** The welcome is on its way out, or onward: neither button can be pressed. */
  busy: boolean
  onBack: () => void
  /**
   * The way forward. Filled unless it says `outline`, as it does while the
   * step's own control is the one to press. `busyLabel` is what it says while
   * its own press is what the welcome is busy with.
   */
  next: {
    label: ReactNode
    onClick: () => void
    variant?: 'default' | 'outline'
    busyLabel?: string
  }
  /** What the step shows or asks for, beside its words. */
  children: ReactNode
}) {
  return (
    <section aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div
        key={id}
        aria-live="polite"
        data-from={from !== undefined && index !== undefined && from > index ? 'before' : 'after'}
        className="flex min-h-0 flex-1 items-start gap-10 overflow-y-auto px-12 pt-9"
      >
        <div className="flex w-58 shrink-0 animate-in flex-col duration-300 ease-out-strong fade-in-0 in-data-[from=after]:slide-in-from-right-3 in-data-[from=before]:slide-in-from-left-3">
          {index === undefined ? null : (
            // The number's stroke, not its box, stands on the column's edge.
            <span aria-hidden="true" className="-ml-1.5 pb-7 text-numeral tabular-nums">
              {numeral(index)}
            </span>
          )}
          <Heading level="step">{title}</Heading>
          <Text as="p" tone="muted" className="m-0 pt-2.5 text-pretty">
            {say}
          </Text>
        </div>
        {children}
      </div>

      {/* Two buttons and nothing between them: what a step has to say, it says above. */}
      <div className="flex h-21 shrink-0 items-center justify-between px-12">
        <Button type="button" variant="outline" disabled={busy} onClick={onBack}>
          Back
        </Button>
        {/* One button on every step, so it keeps the focus and its place from the first step to the last. */}
        <Button
          type="button"
          variant={next.variant}
          autoFocus
          disabled={busy}
          busy={busy && next.busyLabel !== undefined}
          busyLabel={next.busyLabel}
          onClick={next.onClick}
        >
          {next.label}
        </Button>
      </div>
    </section>
  )
}

/**
 * What a setup step asks for, beside its words. Controls, not a picture: no
 * sheet around them, since a region is never a card. It arrives with the step.
 */
export function StepPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 animate-in flex-col gap-5 pb-6 delay-75 duration-300 ease-out-strong fill-mode-backwards fade-in-0 in-data-[from=after]:slide-in-from-right-4 in-data-[from=before]:slide-in-from-left-4">
      {children}
    </div>
  )
}
