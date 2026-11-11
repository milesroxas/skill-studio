/** One item in a list of things to open: a case, a queued output, a file. */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { Dot } from './Status.tsx'
import { Text } from './text.tsx'

export function NavButton({
  current = false,
  className,
  ...props
}: ComponentProps<'button'> & { current?: boolean }) {
  return (
    <button
      type="button"
      data-current={current || undefined}
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex min-h-10 w-full flex-col items-start justify-center gap-0.5 rounded-sm px-2 py-1 text-left *:max-w-full text-sm whitespace-normal focus-ring-inset transition-colors hover:bg-accent data-[current]:bg-accent data-[current]:text-foreground pointer-coarse:min-h-11',
        className,
      )}
      {...props}
    />
  )
}

/**
 * A `NavButton`'s first line: the item's name, cut short when it is long, and
 * the unsaved dot after it, as a `NavItem` marks a draft. The dot is the
 * `warning` one from `Status`; a screen reader hears "unsaved changes".
 */
export function NavButtonTitle({ children, unsaved }: { children: ReactNode; unsaved?: boolean }) {
  return (
    <span className="flex w-full min-w-0 items-center gap-1.5">
      <Text size="ui" truncate className="min-w-0">
        {children}
      </Text>
      {unsaved ? (
        <>
          <Dot size="sm" tone="warning" />
          <span className="sr-only">, unsaved changes</span>
        </>
      ) : null}
    </span>
  )
}
