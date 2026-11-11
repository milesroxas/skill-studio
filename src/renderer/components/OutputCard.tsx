/** The card one output is read in: a head with its slot, title, total and meta, then the sections. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
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
   * One thing to do with the output, at the end of the meta's last line, under
   * the total: a `ghost-muted` `xs` button. It stands 8px past the head's
   * inset, so its label, not the box that shows on hover, ends on the card's edge.
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
      <span>{total}</span>
      {meta || action ? (
        <span className="-col-start-3 -col-end-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {meta}
          {action ? <span className="-mr-2 ml-auto">{action}</span> : null}
        </span>
      ) : null}
    </header>
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
