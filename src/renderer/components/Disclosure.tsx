/** A folded block: one line with a chevron that opens to show more. */
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.tsx'

const disclosureVariants = cva('', {
  variants: {
    variant: {
      /** A line of text that opens in place. */
      plain: '',
      /** On its own bordered block, such as one file of a diff. */
      card: 'rounded-lg border bg-card px-3 py-1',
    },
  },
  defaultVariants: { variant: 'plain' },
})

const triggerVariants = cva(
  'group/disclosure inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 pointer-coarse:min-h-11 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:ease-out-strong data-[state=open]:[&>svg]:rotate-90',
  {
    variants: {
      variant: {
        plain:
          'text-[13px] text-muted-foreground hover:text-foreground data-[state=open]:text-foreground',
        card: 'w-full',
      },
    },
    defaultVariants: { variant: 'plain' },
  },
)

const contentVariants = cva('', {
  variants: {
    variant: {
      plain: 'pt-1 pb-2',
      card: 'pb-2',
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
      <CollapsibleTrigger className={triggerVariants({ variant })}>
        <ChevronRightIcon aria-hidden="true" />
        {summary}
      </CollapsibleTrigger>
      <CollapsibleContent className={contentVariants({ variant })}>{children}</CollapsibleContent>
    </Collapsible>
  )
}
