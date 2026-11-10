import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

/**
 * A field's surface: a hairline edge, the card fill (on porcelain the 1.5:1
 * edge alone does not show a field) and a tint in the dark scope. Every field
 * shares it: Input, TextArea and the Select trigger.
 */
export const FIELD_SURFACE = 'border border-input bg-card shadow-xs dark:bg-input/30'

const inputVariants = cva(
  `${FIELD_SURFACE} min-w-0 rounded-sm px-3 py-1 text-base transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-edge aria-invalid:border-destructive`,
  {
    variants: {
      /** How much of its row the field takes. */
      width: {
        full: 'w-full',
        /** Sized by its content, for a field in a toolbar. */
        auto: 'w-auto',
        /** A search box: wide, but never wider than its row. */
        wide: 'w-[min(320px,100%)]',
        /** A search box in a bar of filters: 320px when the bar has it, and it gives way before the bar wraps. */
        search: 'max-w-80 grow basis-52',
      },
      font: {
        sans: '',
        /** An identifier or a path. */
        mono: 'font-mono',
      },
      size: {
        default: 'h-9',
        /** A value beside a slider or in a dense row. */
        sm: 'h-7 px-2 md:text-ui',
      },
    },
    defaultVariants: { width: 'full', font: 'sans', size: 'default' },
  },
)

function Input({
  className,
  type,
  width,
  font,
  size,
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ width, font, size }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
