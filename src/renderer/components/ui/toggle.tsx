import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Toggle as TogglePrimitive } from 'radix-ui'
import type * as React from 'react'

const toggleVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.96] aria-disabled:active:scale-100 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
      /**
       * Where the focus line goes. `alone`: outside the toggle. `group`: inside
       * it, in its own text color, since a group scrolls and would clip a line
       * outside, and a pressed segment is ink a ring color would vanish into.
       */
      place: {
        alone: 'focus-ring',
        group: 'focus-ring-segment',
      },
      /** `mono` for a literal, such as a file's name. */
      font: {
        sans: '',
        mono: 'font-mono',
      },
      /**
       * The label's step on the type scale. `xs` for a picker over an object, as the
       * files over an output are: the size of the meta beside it, not of a control.
       */
      text: {
        sm: '',
        xs: 'text-xs',
      },
    },
    compoundVariants: [
      {
        /** "On" reads the same everywhere: ink fill. */
        variant: 'outline',
        class:
          'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
      place: 'alone',
      font: 'sans',
      text: 'sm',
    },
  },
)

function Toggle({
  className,
  variant,
  size,
  font,
  text,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, font, text, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
