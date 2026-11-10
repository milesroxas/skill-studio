import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { FIELD_SURFACE } from './input.tsx'

const textareaVariants = cva(
  'flex field-sizing-content min-h-16 w-full rounded-sm px-3 py-2 text-base transition-[color,box-shadow] focus-edge placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
  {
    variants: {
      variant: {
        /** A field on its own: the field's edge and fill. */
        default: FIELD_SURFACE,
        /**
         * Inside a frame that draws the edge and shows the focus, such as the
         * composer's box: no edge, no fill and no shadow in any theme, and no
         * resize grip, since the frame sets the height.
         */
        bare: 'resize-none',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<'textarea'> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Textarea }
