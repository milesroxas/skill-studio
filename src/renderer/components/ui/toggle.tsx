import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'
import type * as React from 'react'

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,scale] duration-150 ease-out outline-none active:scale-[0.96] aria-disabled:active:scale-100 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Hovers as a ghost button does, so the two sit side by side in a bar. */
        default:
          'bg-transparent hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 dark:data-[state=on]:hover:bg-accent',
        /** One item's state, or a segment of a choice. Pressed is ink fill: see `compoundVariants`. */
        outline:
          'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
        /** A filter: what is shown reads plain, what is hidden fades. */
        filter:
          'bg-transparent text-muted-foreground/70 hover:bg-transparent hover:text-muted-foreground data-[state=on]:bg-transparent data-[state=on]:text-foreground',
      },
      size: {
        default: 'h-9 min-w-9 px-2',
        sm: 'h-8 min-w-8 px-1.5 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1.5',
        /** One icon: 32px to look at, 44px to touch, as the button of the same name. */
        'icon-sm':
          'size-8 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5',
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
    compoundVariants: [
      {
        /** "On" reads the same everywhere: ink fill. A tone states its verdict instead. */
        variant: 'outline',
        tone: 'default',
        class:
          'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground',
      },
    ],
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
