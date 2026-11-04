/** A folded block: one line that opens to show more. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.tsx'

const disclosureVariants = cva('', {
  variants: {
    variant: {
      /** A line of text that opens in place. */
      plain: '',
      /** On its own card, such as one file of a diff. */
      card: 'rounded-lg bg-card px-3 py-2 shadow-raised',
    },
  },
  defaultVariants: { variant: 'plain' },
})

const triggerVariants = cva('cursor-pointer text-left outline-none focus-visible:underline', {
  variants: {
    variant: {
      plain:
        'text-xs text-muted-foreground hover:text-foreground data-[state=open]:text-foreground',
      card: '',
    },
  },
  defaultVariants: { variant: 'plain' },
})

export function Disclosure({
  summary,
  children,
  defaultOpen,
  variant,
  className,
}: VariantProps<typeof disclosureVariants> & {
  summary: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn(disclosureVariants({ variant }), className)}
    >
      <CollapsibleTrigger className={triggerVariants({ variant })}>{summary}</CollapsibleTrigger>
      <CollapsibleContent className="mt-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}
