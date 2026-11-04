/** A state in a word or two, with a dot that says how it stands, and the detail after it. */
import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { Text } from './text.tsx'

const dotVariants = cva('size-2 shrink-0 rounded-full', {
  variants: {
    tone: {
      success: 'bg-success',
      warning: 'bg-warning',
      destructive: 'bg-destructive',
      muted: 'bg-muted-foreground/50',
    },
  },
  defaultVariants: { tone: 'muted' },
})

export function Status({
  tone,
  detail,
  children,
}: VariantProps<typeof dotVariants> & { detail?: ReactNode; children: ReactNode }) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <span className={dotVariants({ tone })} aria-hidden="true" />
      <Text weight="medium">{children}</Text>
      {detail ? <Text tone="muted">{detail}</Text> : null}
    </p>
  )
}
