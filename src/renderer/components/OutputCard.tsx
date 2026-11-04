/** The card one output is read in: a head with its slot, title, total and meta, then the sections. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Card } from './ui/card.tsx'

export function OutputCard({ className, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      role="article"
      className={cn('gap-0 overflow-hidden rounded-lg py-0', className)}
      {...props}
    />
  )
}

export function OutputCardHead({
  slot,
  title,
  total,
  meta,
}: {
  slot: ReactNode
  title: ReactNode
  total?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 border-b px-4 py-3">
      {slot}
      <span className="font-semibold">{title}</span>
      <span>{total}</span>
      {meta ? (
        <span className="col-start-2 -col-end-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {meta}
        </span>
      ) : null}
    </header>
  )
}

const slotVariants = cva(
  'inline-grid h-5 min-w-5 place-items-center rounded-xs border px-1.25 font-mono text-[11px] leading-none font-semibold',
  {
    variants: {
      variant: {
        a: 'border-foreground bg-foreground text-background',
        b: 'border-foreground text-foreground',
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

/** A folded block inside the card: the prompt, the checks. */
export function CardFold({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('border-b px-4 py-2.5 text-xs', className)} {...props} />
}
