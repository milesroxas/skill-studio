/**
 * The card one output is read in: a head with its slot, title, total and meta,
 * the sections, and a foot. An output still being written holds its place.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { RunningChip } from './Status.tsx'
import { Text } from './text.tsx'
import { Card } from './ui/card.tsx'

/** One output: an object a reader sets beside another, so it stands on its own card. */
export function OutputCard({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card role="article" className={cn('gap-0 overflow-hidden py-0', className)} {...props} />
}

export function OutputCardHead({
  slot,
  title,
  total,
  action,
  meta,
}: {
  /** Its letter beside another output; none for an output read alone. */
  slot?: ReactNode
  title: ReactNode
  total?: ReactNode
  /**
   * One thing to do with the output: a `ghost-muted` `xs` button at the end of
   * the meta's last line, under the total, or beside the total when there is no
   * meta, so it never stands on a line of its own. It stands 8px past the
   * head's inset, so its label, not the box that shows on hover, ends on the card's edge.
   */
  action?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header
      className={cn(
        'grid items-center gap-x-2.5 gap-y-0.5 border-b px-4 py-3',
        slot ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      {slot}
      <span className="font-semibold">{title}</span>
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
    </header>
  )
}

/** The card's last row: one quiet action at its end, such as reading the transcript in place of the output. */
export function OutputCardFoot({ children }: { children: ReactNode }) {
  return <footer className="flex justify-end border-t px-2 py-1.5">{children}</footer>
}

/** Facts about an output, a label and its value a row, such as who wrote it and when. */
export function FactList({ facts }: { facts: ReadonlyArray<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
      {facts.map((fact) => (
        <div key={fact.label} className="contents">
          <dt className="text-muted-foreground">{fact.label}</dt>
          <dd className="m-0 text-pretty">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

const writingVariants = cva('m-0 flex flex-col items-center gap-2 text-center', {
  variants: {
    /** `stage`: fills the frame the output will be drawn in. `card`: the card's body, as tall as an empty section. */
    place: {
      stage: 'size-full justify-center p-6',
      card: 'px-4 py-14',
    },
  },
})

/**
 * An output still being written, in the place it will show. The running chip
 * says it is under way, and the line under it that the reader has nothing to
 * do: it comes by itself.
 */
export function OutputWriting({ place }: Required<VariantProps<typeof writingVariants>>) {
  return (
    <div role="status" className={writingVariants({ place })}>
      <RunningChip>Writing…</RunningChip>
      <Text size="xs" tone="muted">
        It shows here when it is done.
      </Text>
    </div>
  )
}

const slotVariants = cva(
  'inline-grid h-5 min-w-5 place-items-center rounded-sm border px-1.25 font-mono text-2xs leading-none font-semibold',
  {
    variants: {
      variant: {
        /** A side's letter, A or B, in the color of the text around it. Never filled: fill says "on". */
        letter: 'border-current',
        plain: 'border-input font-sans text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'plain' },
  },
)

/** The letter of a side, or a small plain label. */
export function Slot({
  variant,
  className,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof slotVariants>) {
  return <span className={cn(slotVariants({ variant }), className)} {...props} />
}
