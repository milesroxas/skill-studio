import { cn } from '@renderer/lib/utils.ts'
import type * as React from 'react'
import { FIELD_SURFACE } from './input.tsx'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        `${FIELD_SURFACE} flex field-sizing-content min-h-16 w-full rounded-sm px-3 py-2 text-base transition-[color,box-shadow] focus-edge placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm`,
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
