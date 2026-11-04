/** One item in a list of things to open: a case, a queued output, a file. */
import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'

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
        'flex min-h-10 w-full flex-col items-start justify-center gap-0.5 rounded-md px-2 py-1 text-left text-sm whitespace-normal outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[current]:bg-accent data-[current]:text-foreground pointer-coarse:min-h-11',
        className,
      )}
      {...props}
    />
  )
}
