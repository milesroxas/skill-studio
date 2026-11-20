/**
 * The pair being compared, in a band under the column's header: one head a
 * side, each with its letter, the field that picks its output, its score and
 * how it moved. The band holds still while the stage and the lists under it
 * scroll, so what picks the pair, and what the rest of the column is about,
 * never leaves view.
 *
 * While the outputs are read one at a time the two heads are also the switch
 * that says which is on the stage: the one in view takes an open row's fill
 * and a filled letter, and a press on the other shows it.
 */
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Slot, SlotButton } from './OutputCard.tsx'

/**
 * The band. It sticks under the header from `lg` up; below that the header
 * wraps to two rows and the band scrolls with the page. Its heads bleed 12px
 * past the column's inset, so the fill of the one in view stands clear of its
 * text and the text still starts on the column's edge.
 */
export function PairBand({
  two,
  children,
}: {
  /** Two sides, in two equal columns; one head otherwise. */
  two: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-label="Outputs compared"
      className="top-12 z-10 shrink-0 border-b bg-background px-3 py-1.5 lg:sticky"
    >
      {/* Two heads are one height, whichever says more, so the fill of the one in view is too. */}
      <div className={cn('grid gap-1', two && 'md:grid-cols-2')}>{children}</div>
    </section>
  )
}

/** A side with no output yet: the field that fills it, inset as a head's text is. */
export function PairEmpty({ children }: { children: ReactNode }) {
  return <div className="px-3 py-1.5">{children}</div>
}

/** How a head stands for the stage: whether its output is the one in view, and how to show it. */
export interface HeadFlip {
  on: boolean
  show: () => void
  /** The letter's hover text: the key that shows the output. */
  hint?: string
  /** The output's name, for a screen reader. */
  name: string
}

/**
 * One side's head: its letter, its title, its total, and under them a line of
 * meta. With `flip` it is half of the switch. The letter is the button a
 * keyboard uses; a press anywhere else on the head that is not one of its own
 * controls does the same.
 */
export function PairHead({
  letter,
  title,
  total,
  action,
  meta,
  flip = null,
}: {
  /** The side's letter; none for an output read alone. */
  letter?: string
  title: ReactNode
  total?: ReactNode
  /**
   * One thing to do with the output: a `ghost-muted` `xs` button at the end of
   * the meta's line, or beside the total when there is no meta. It stands 8px
   * past the head's inset, so its label, not its hover box, ends on the edge.
   */
  action?: ReactNode
  meta?: ReactNode
  /** Null where both outputs are in view, or there is only one. */
  flip?: HeadFlip | null
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the letter is the control; this is the pointer's larger way to it.
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard uses the letter, and the A and B keys.
    <div
      className={cn(
        'grid min-w-0 content-start items-center gap-x-2.5 rounded-md px-3 py-1.5 transition-[background-color] duration-150 ease-out',
        letter ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
        flip?.on && 'bg-accent',
        flip && !flip.on && 'cursor-pointer hover:bg-accent/50',
      )}
      onClick={
        flip && !flip.on
          ? (event) => {
              // A press on one of the head's own controls is for that control.
              if (!(event.target as HTMLElement).closest('button,[role="combobox"],a')) flip.show()
            }
          : undefined
      }
    >
      {!letter ? null : flip ? (
        <SlotButton
          pressed={flip.on}
          aria-label={`Show ${letter}, ${flip.name}`}
          title={flip.hint}
          onClick={flip.show}
        >
          {letter}
        </SlotButton>
      ) : (
        <Slot>{letter}</Slot>
      )}
      <span className="min-w-0 font-semibold">{title}</span>
      <span className="flex items-center gap-2">
        {total}
        {action && !meta ? <span className="-mr-2">{action}</span> : null}
      </span>
      {meta ? (
        <span className="-col-start-3 -col-end-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {meta}
          {action ? <span className="-mr-2 ml-auto">{action}</span> : null}
        </span>
      ) : null}
    </div>
  )
}
