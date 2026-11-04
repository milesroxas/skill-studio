import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'
import type * as React from 'react'

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
        /** A filter: what is shown reads plain, what is hidden fades. */
        filter:
          'bg-transparent text-muted-foreground/70 hover:bg-transparent hover:text-muted-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground',
      },
      size: {
        default: 'h-9 min-w-9 px-2',
        sm: 'h-8 min-w-8 px-1.5',
        lg: 'h-10 min-w-10 px-2.5',
      },
      /** The verdict a pressed toggle states, so color says good or bad and nothing else. */
      tone: {
        default: '',
        success:
          'data-[state=on]:bg-success/10 data-[state=on]:text-success dark:data-[state=on]:bg-success/20',
        destructive:
          'data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive dark:data-[state=on]:bg-destructive/20',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      tone: 'default',
    },
  },
)

function Toggle({
  className,
  variant,
  size,
  tone,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, tone, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
