/**
 * How something stands, said in color once: the dot. Every dot in the app is
 * this one, so a state means the same thing wherever it is read. `Status` puts
 * the dot before a state in a word or two, with the detail after it.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { Text } from './text.tsx'

const dotVariants = cva('shrink-0 rounded-full', {
  variants: {
    tone: {
      success: 'bg-success',
      warning: 'bg-warning',
      destructive: 'bg-destructive',
      muted: 'bg-muted-foreground/50',
      /** Running. Yellow, and it pulses: the one moving thing in the window. */
      signal: 'animate-pulse bg-signal',
    },
    /** `sm` beside 12px text in the chrome, `default` beside body text. */
    size: {
      sm: 'size-1.5',
      default: 'size-2',
    },
  },
  defaultVariants: { tone: 'muted', size: 'default' },
})

export type Tone = NonNullable<VariantProps<typeof dotVariants>['tone']>

/** The dot alone. The words beside it carry the state: the dot repeats it. */
export function Dot({ tone, size }: VariantProps<typeof dotVariants>) {
  return <span className={dotVariants({ tone, size })} aria-hidden="true" />
}

/**
 * Something running, named in a word or two on an ink chip: the running dot
 * needs ink under it, since yellow cannot be seen on paper.
 */
export function RunningChip({ children }: { children: ReactNode }) {
  return (
    <span
      data-surface="ink"
      className="inline-flex h-5 items-center gap-1.5 rounded-sm px-1.5 align-middle font-mono text-2xs font-medium tabular-nums"
    >
      <Dot size="sm" tone="signal" />
      {children}
    </span>
  )
}

const statusVariants = cva('m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5', {
  variants: {
    /** `default` in a section's text; `ui` at the end of a row whose title is `text-ui`. */
    size: {
      default: 'text-sm',
      ui: 'text-ui',
    },
  },
  defaultVariants: { size: 'default' },
})

export function Status({
  tone,
  size,
  detail,
  id,
  children,
}: Pick<VariantProps<typeof dotVariants>, 'tone'> &
  VariantProps<typeof statusVariants> & {
    detail?: ReactNode
    /** For a control the state explains, through its `aria-describedby`. */
    id?: string
    children: ReactNode
  }) {
  return (
    <p id={id} className={statusVariants({ size })}>
      <Dot tone={tone} />
      <Text weight="medium">{children}</Text>
      {detail ? <Text tone="muted">{detail}</Text> : null}
    </p>
  )
}
