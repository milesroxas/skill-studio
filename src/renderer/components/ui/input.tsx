import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

const inputVariants = cva(
  'min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
  {
    variants: {
      /** How much of its row the field takes. */
      width: {
        full: 'w-full',
        /** Sized by its content, for a field in a toolbar. */
        auto: 'w-auto',
        /** Takes what a toolbar leaves. */
        grow: 'w-auto flex-1',
        /** A short value: a criterion, a name. */
        narrow: 'w-35',
        /** A search box: wide, but never wider than its row. */
        wide: 'w-[min(320px,100%)]',
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
