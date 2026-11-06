import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-out outline-none active:scale-[0.96] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        /** The next step of the loop, in the top bar only: the window's one lime control. */
        signal: 'bg-signal text-signal-foreground hover:bg-signal/85',
        /** An action a row repeats, such as its remove: quieter than the row's text until pointed at. */
        'ghost-muted':
          'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:text-foreground dark:hover:bg-accent/50',
        /**
         * A destructive action a row repeats, such as its delete: as quiet as the
         * row's other icons at rest, and red once pointed at or focused, so the
         * intent shows just before the click.
         */
        'destructive-muted':
          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive focus-visible:ring-destructive/20 dark:hover:bg-destructive/20',
        /** A rare, destructive action that should not shout: red text on a quiet surface. */
        'destructive-ghost':
          'text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/20 dark:hover:bg-destructive/20',
        /**
         * The destructive action that stands alone, such as the last section of a form. Its
         * border puts the button's edge on the column's edge at rest, where a ghost only
         * shows its box on hover and so reads as indented.
         */
        'destructive-outline':
          'border bg-background text-destructive shadow-xs hover:border-destructive/30 hover:bg-destructive/10 focus-visible:ring-destructive/20 dark:border-input dark:bg-input/30 dark:hover:border-destructive/40 dark:hover:bg-destructive/20',
        /** A quiet text link: muted, with a hairline underline that darkens on hover. */
        'link-muted':
          'text-muted-foreground underline decoration-input underline-offset-3 hover:text-foreground hover:decoration-current',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        /**
         * 32px to look at. Under a finger its hit area reaches 6px past the box
         * above and below (44px); a row of them needs 12px between its lines.
         */
        sm: 'h-8 gap-1.5 rounded-sm px-3 has-[>svg]:px-2.5 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1.5',
        lg: 'h-10 rounded-sm px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-xs': "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        /**
         * 32px to look at, 44px to touch: under a finger the hit area reaches 6px
         * past the box on every side, so neighbours stand 12px apart there.
         */
        'icon-sm':
          'size-8 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5',
        'icon-lg': 'size-10',
        /** Sits in running text or a table cell: no box of its own, wraps like a word. */
        inline: 'h-auto rounded-xs p-0 text-left font-[inherit] whitespace-normal',
        /** The small inline form, for a secondary link under a form or in a list. */
        'inline-sm': 'h-auto rounded-xs p-0 text-left text-xs whitespace-normal',
        /**
         * Fills a table cell without widening it, at the table's own type size.
         * The box stays 28px; the hit area reaches 4px past it above and below
         * (36px), the most a single-line row has to give before two rows collide.
         */
        cell: 'relative -mx-1 h-7 px-1 align-middle text-ui tabular-nums before:absolute before:inset-x-0 before:-inset-y-1',
        /**
         * A text link in a table cell: reads as a word at the cell's size, and
         * its hit area takes the cell's padding (36px high, 6px past each end,
         * so two links 12px apart meet and never overlap).
         */
        'cell-inline':
          'relative h-auto rounded-xs p-0 text-left text-[length:inherit] before:absolute before:-inset-x-1.5 before:-inset-y-2',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
