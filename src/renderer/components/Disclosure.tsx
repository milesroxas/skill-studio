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
      card: 'rounded-chin border bg-card px-3 py-1',
      /** One row of a `DisclosureList`: the list draws the edges. */
      row: 'px-3 py-2',
    },
  },
  defaultVariants: { variant: 'plain' },
})

const triggerVariants = cva(
  'group/disclosure inline-flex min-h-8 items-center gap-1.5 rounded-xs text-left focus-ring pointer-coarse:min-h-11 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:transition-transform [&>svg]:duration-150 [&>svg]:ease-out-strong data-[state=open]:[&>svg]:rotate-90',
  {
    variants: {
      variant: {
        // The chevron's stroke starts 4px into its box; pulled back, it starts on the column's edge.
        plain:
          'text-ui text-muted-foreground hover:text-foreground data-[state=open]:text-foreground [&>svg]:-ml-1',
        card: 'w-full',
        // A title over a line of detail: the chevron sits on the title's line, not between the two.
        row: 'min-w-0 flex-1 items-start [&>svg]:mt-0.75 [&>svg]:text-muted-foreground hover:[&>svg]:text-foreground',
      },
      /** A row with nothing to open: the chevron's slot stays empty, so titles line up. */
      still: {
        true: 'cursor-default',
        false: 'cursor-pointer',
      },
    },
    defaultVariants: { variant: 'plain', still: false },
  },
)

/** The control at the end of the line. A row's is one width, so its buttons and states line up down the list. */
const actionVariants = cva('shrink-0', {
  variants: {
    variant: {
      plain: '',
      card: '',
      row: 'flex w-20 justify-end',
    },
  },
  defaultVariants: { variant: 'plain' },
})

const contentVariants = cva('', {
  variants: {
    variant: {
      plain: 'pt-1 pb-2',
      card: 'pb-2',
      // Indented past the chevron, under the title it opens.
      row: 'pt-2 pb-1 pl-5 data-[state=open]:animate-ink',
    },
  },
  defaultVariants: { variant: 'plain' },
})

/** The line that opens the block, or when there is nothing to open, the same line at rest. */
function Head({
  variant,
  summary,
  still,
}: VariantProps<typeof disclosureVariants> & { summary: ReactNode; still: boolean }) {
  if (still)
    return (
      <div className={triggerVariants({ variant, still: true })}>
        <span className="size-3.5 shrink-0" aria-hidden="true" />
        {summary}
      </div>
    )
  return (
    <CollapsibleTrigger className={triggerVariants({ variant })}>
      <ChevronRightIcon aria-hidden="true" />
      {summary}
    </CollapsibleTrigger>
  )
}

export function Disclosure({
  summary,
  children,
  action,
  defaultOpen,
  variant,
  className,
}: VariantProps<typeof disclosureVariants> & {
  summary: ReactNode
  /** What opens. Without it the row has nothing to open and shows no chevron. */
  children?: ReactNode
  /** One control at the end of the line, outside the part that opens and closes. */
  action?: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const head = <Head variant={variant} summary={summary} still={children === undefined} />
  const block = (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn(disclosureVariants({ variant }), className)}
    >
      {action ? (
        <div className="flex items-center gap-3">
          {head}
          <div className={actionVariants({ variant })}>{action}</div>
        </div>
      ) : (
        head
      )}
      {children === undefined ? null : (
        <CollapsibleContent className={contentVariants({ variant })}>{children}</CollapsibleContent>
      )}
    </Collapsible>
  )
  return variant === 'row' ? <li>{block}</li> : block
}

/** Rows of `Disclosure variant="row"` as one object, divided by hairlines. */
export function DisclosureList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="m-0 list-none divide-y rounded-chin border bg-card p-0">
      {children}
    </ul>
  )
}
