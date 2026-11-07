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
      /** Running. Lime, and it pulses: the one moving thing in the window. */
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

export function Status({
  tone,
  detail,
  children,
}: Pick<VariantProps<typeof dotVariants>, 'tone'> & { detail?: ReactNode; children: ReactNode }) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <Dot tone={tone} />
      <Text weight="medium">{children}</Text>
      {detail ? <Text tone="muted">{detail}</Text> : null}
    </p>
  )
}
