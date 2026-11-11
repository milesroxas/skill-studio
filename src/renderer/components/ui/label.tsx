import { cn } from '@renderer/lib/utils.ts'
import { Label as LabelPrimitive } from 'radix-ui'
import type * as React from 'react'

/**
 * A field's name. `optional` says after it, in muted text, that the field may
 * be left empty: a form with one required field marks the others, so the
 * reader knows which one the form cannot do without.
 */
function Label({
  className,
  optional,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { optional?: boolean }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-ui leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      {optional ? <span className="font-normal text-muted-foreground">optional</span> : null}
    </LabelPrimitive.Root>
  )
}

export { Label }
