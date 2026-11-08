/**
 * One step of a transcript in a `Rows` list: when, what kind, and the body.
 * A tool call sits on the muted ground; an error, or a step that failed, on
 * the destructive tint. On narrow screens the body drops under the time.
 */
import type { TranscriptKind } from '@domain/schemas.ts'
import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { Text } from './text.tsx'

const eventVariants = cva(
  'grid grid-cols-[44px_minmax(0,1fr)] gap-3 px-3 py-2 text-ui md:grid-cols-[52px_64px_minmax(0,1fr)]',
  {
    variants: {
      kind: {
        system: '',
        text: '',
        thinking: '',
        tool: 'bg-muted',
        result: '',
        error: 'bg-destructive/10 dark:bg-destructive/20',
      },
      failed: {
        true: 'bg-destructive/10 dark:bg-destructive/20',
        false: '',
      },
    },
    defaultVariants: { failed: false },
  },
)

export function TranscriptEvent({
  kind,
  failed,
  at,
  children,
}: {
  kind: TranscriptKind
  failed: boolean
  /** The step's time from the start, already formatted. */
  at: string
  children: ReactNode
}) {
  return (
    <li className={eventVariants({ kind, failed })}>
      <Text tone="muted" tabular align="end">
        {at}
      </Text>
      <Text tone="muted" className="max-md:hidden">
        {kind}
      </Text>
      <span className="min-w-0 break-words max-md:col-span-full">{children}</span>
    </li>
  )
}
