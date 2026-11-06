/**
 * One step of the welcome, the frame the tour and the setup share: the step's
 * number large, its title and one sentence in a column, what it shows or asks
 * beside them, and Back and the way forward at the foot.
 *
 * The frame holds still from step to step, so the way forward stays under the
 * pointer and only the step itself changes. The step comes in from the side
 * the reader is heading to.
 */
import type { ReactNode } from 'react'
import { after } from '../motion.ts'
import { Heading, Hint, Text } from './text.tsx'

/** When a step's own parts start to move: it has slid in and the eye has reached them. */
export const STEP_BEAT = 260

/** A step's number as the welcome shows it: two figures, "01". */
const numeral = (index: number): string => String(index + 1).padStart(2, '0')

/**
 * How far through the steps the reader is: each step's number in mono, the
 * current one lime on ink. A screen reader hears it in words.
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
          className="flex h-5 w-7.5 items-center justify-center rounded-xs font-mono text-2xs font-medium text-muted-foreground tabular-nums transition-colors duration-150 ease-out data-[surface=ink]:text-signal"
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
  hint,
  back,
  next,
  children,
}: {
  /** What the steps are, for a screen reader: "How it works", "Set up". */
  label: string
  /** The step's own name, so a new step mounts and plays its entrance. */
  id: string
  index: number
  /** The step before it, which says which side this one arrives from. */
  from: number
  title: string
  say: string
  /** A line beside the way forward, on the steps that need one. */
  hint?: ReactNode
  back: ReactNode
  next: ReactNode
  /** What the step shows or asks for, beside its words. */
  children: ReactNode
}) {
  return (
    <section aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div
        key={id}
        aria-live="polite"
        data-from={from > index ? 'before' : 'after'}
        className="flex min-h-0 flex-1 items-start gap-10 overflow-y-auto px-12 pt-9"
      >
        <div className="flex w-58 shrink-0 animate-in flex-col duration-300 ease-out-strong fade-in-0 in-data-[from=after]:slide-in-from-right-3 in-data-[from=before]:slide-in-from-left-3">
          {/* The number's stroke, not its box, stands on the column's edge. */}
          <span aria-hidden="true" className="-ml-1.5 text-numeral tabular-nums">
            {numeral(index)}
          </span>
          <Heading level={2} className="pt-7 text-2xl">
            {title}
          </Heading>
          <Text as="p" tone="muted" className="m-0 pt-2.5 text-pretty">
            {say}
          </Text>
        </div>
        {children}
      </div>

      <div className="flex h-21 shrink-0 items-center gap-6 px-12">
        {back}
        {/* Held on every step, so the way forward keeps its place from the first step to the last. */}
        <Hint className="flex-1">
          {hint ? (
            <span key={id} className="block animate-rise" style={after(STEP_BEAT)}>
              {hint}
            </span>
          ) : null}
        </Hint>
        {next}
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
