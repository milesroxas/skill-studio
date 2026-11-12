import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

/*
 * Padding beside an icon: the icon's side gives up 2px, because a 16px icon
 * holds about 2px of air inside its box, so its ink would sit further from the
 * edge than the text's. Only the side the icon is on changes: a leading icon
 * trims the left, a trailing one the right, and the text keeps the size's own
 * padding. `data-icon` says which side; `iconSide` below reads it from the
 * children, since CSS cannot tell an icon before a text node from one after it.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-out focus-ring active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        /** The confirm button of a destructive dialog. Its text flips with the red, as the filled button's does. */
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        /** The next step of the loop, in the top bar only: the window's one yellow control. */
        signal: 'bg-signal text-signal-foreground hover:bg-signal/85',
        /** An action a row repeats, such as its remove: quieter than the row's text until pointed at. */
        'ghost-muted':
          'text-muted-foreground hover:bg-accent hover:text-foreground focus-key:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground dark:hover:bg-accent/50 dark:data-[state=open]:bg-accent/50',
        /**
         * A destructive action a row repeats, such as its delete: as quiet as the
         * row's other icons at rest, and red once pointed at or focused, so the
         * intent shows just before the click.
         */
        'destructive-muted':
          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-key:text-destructive dark:hover:bg-destructive/20',
        /** A rare, destructive action that should not shout: red text on a quiet surface. */
        'destructive-ghost':
          'text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20',
        /**
         * The destructive action that stands alone, such as the last section of a form. Its
         * border puts the button's edge on the column's edge at rest, where a ghost only
         * shows its box on hover and so reads as indented.
         */
        'destructive-outline':
          'border bg-background text-destructive shadow-xs hover:border-destructive/30 hover:bg-destructive/10 dark:border-input dark:bg-input/30 dark:hover:border-destructive/40 dark:hover:bg-destructive/20',
        /** A quiet text link: muted, with a hairline underline that darkens on hover. */
        'link-muted':
          'text-muted-foreground underline decoration-input underline-offset-3 hover:text-foreground hover:decoration-current',
      },
      size: {
        default:
          'h-9 px-4 py-2 data-[icon=lead]:pl-3.5 data-[icon=trail]:pr-3.5 data-[icon=both]:px-3.5',
        /** 24px to look at. Under a finger its hit area reaches 10px past the box above and below (44px). */
        xs: "h-6 gap-1 rounded-sm px-2 text-xs data-[icon=lead]:pl-1.5 data-[icon=trail]:pr-1.5 data-[icon=both]:px-1.5 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2.5 [&_svg:not([class*='size-'])]:size-3",
        /**
         * 32px to look at. Under a finger its hit area reaches 6px past the box
         * above and below (44px); a row of them needs 12px between its lines.
         */
        sm: 'h-8 gap-1.5 rounded-sm px-3 data-[icon=lead]:pl-2.5 data-[icon=trail]:pr-2.5 data-[icon=both]:px-2.5 pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1.5',
        lg: 'h-10 rounded-sm px-6 data-[icon=lead]:pl-5.5 data-[icon=trail]:pr-5.5 data-[icon=both]:px-5.5',
        icon: 'size-9',
        /** 24px to look at. Under a finger its hit area reaches 10px past the box on every side (44px). */
        'icon-xs':
          "size-6 rounded-sm pointer-coarse:relative pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 [&_svg:not([class*='size-'])]:size-3",
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
        /**
         * A full-width row in a list, such as a question to ask: left-aligned,
         * at the text's own weight, wrapping onto a second line when it is long.
         */
        row: 'h-auto w-full justify-start rounded-sm px-3 py-1.5 text-left font-normal whitespace-normal',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

/** The children as a flat list, with fragments opened and blank strings dropped. */
function flatten(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap((node) => {
    if (React.isValidElement<{ children?: React.ReactNode }>(node) && node.type === React.Fragment)
      return flatten(node.props.children)
    return typeof node === 'string' && !node.trim() ? [] : [node]
  })
}

/** An icon in a button is `aria-hidden="true"`; nothing else in one is. */
const isIcon = (node: React.ReactNode): boolean =>
  React.isValidElement<{ 'aria-hidden'?: unknown }>(node) &&
  (node.props['aria-hidden'] === 'true' || node.props['aria-hidden'] === true)

/** Which side of the label the icon sits on, for the padding that side gives up. Undefined with no label. */
function iconSide(children: React.ReactNode): 'lead' | 'trail' | 'both' | undefined {
  const list = flatten(children)
  if (list.length < 2) return undefined
  const lead = isIcon(list[0])
  const trail = isIcon(list[list.length - 1])
  return lead && trail ? 'both' : lead ? 'lead' : trail ? 'trail' : undefined
}

/**
 * A label and the label it shows while busy, laid over each other in one cell,
 * so the button is as wide as the wider of the two from the start and nothing
 * beside it moves when the work begins. The one not showing keeps its box and
 * is hidden from assistive technology.
 */
function BusyLabel({
  busy,
  label,
  children,
}: {
  busy: boolean
  label: React.ReactNode
  children: React.ReactNode
}) {
  const face = 'col-start-1 row-start-1 inline-flex items-center justify-center gap-[inherit]'
  return (
    <span data-slot="label" className="inline-grid gap-[inherit]">
      <span className={cn(face, busy && 'invisible')} aria-hidden={busy || undefined}>
        {children}
      </span>
      <span className={cn(face, !busy && 'invisible')} aria-hidden={!busy || undefined}>
        {label}
      </span>
    </span>
  )
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  busy = false,
  busyLabel,
  disabled,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /**
     * The action is under way: the button is disabled, says so to assistive
     * technology, and shows `busyLabel` in place of its label at the same width.
     */
    busy?: boolean
    /** What the button says while busy: a verb in progress with an ellipsis, "Saving…". */
    busyLabel?: React.ReactNode
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-icon={asChild ? undefined : iconSide(children)}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busyLabel !== undefined ? (
        <BusyLabel busy={busy} label={busyLabel}>
          {children}
        </BusyLabel>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
