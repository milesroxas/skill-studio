import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Popover as PopoverPrimitive } from 'radix-ui'
import type * as React from 'react'
import { floatingMotion, floatingRow, floatingRowTone, floatingSheet } from './floating.ts'

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

const popoverContentVariants = cva(
  [floatingSheet, floatingMotion, 'origin-(--radix-popover-content-transform-origin)'],
  {
    variants: {
      size: {
        default: 'w-72 p-1',
        /** A list to pick from, in sections divided by rules (`PopoverSection`). */
        menu: 'flex w-80 flex-col p-0',
        /** The sidebar, opened from the top bar on a narrow window: ink, as the sidebar is. */
        nav: 'flex max-h-[80dvh] w-64 flex-col bg-sidebar p-0 py-2 text-sidebar-foreground',
        /** A log or a long reading, as wide as the window allows. */
        wide: 'w-[min(520px,calc(100vw-280px))] p-2',
        /** A few fields under their labels. */
        form: 'flex w-72 flex-col gap-4 p-3',
        /** A request to write and the reply under it, in sections (`PopoverSection`). */
        compose: 'flex w-[min(440px,calc(100vw-32px))] flex-col p-0',
        /** The same, for a reply as long as a file. */
        'compose-wide': 'flex w-[min(640px,calc(100vw-32px))] flex-col p-0',
        /** What a screen is for and the words it uses, in sections (`PopoverSection`). */
        help: 'flex w-[min(340px,calc(100vw-32px))] flex-col p-0',
        /** One word and what it means, beside the word. */
        note: 'flex w-64 flex-col gap-1 px-3 py-2.5',
        /** The list under a field (`ComboBox`): as wide as the field it opens from. */
        field: 'flex w-(--radix-popover-trigger-width) min-w-40 flex-col p-0',
        /** A row of actions over a selection in the editor: as wide as its buttons. */
        selection: 'flex w-auto flex-row items-center gap-0.5 p-1',
      },
      /** Opened from the keyboard many times a day: no animation at all. */
      still: {
        true: 'data-[state=closed]:animate-none data-[state=open]:animate-none',
        false: '',
      },
    },
    defaultVariants: { size: 'default', still: false },
  },
)

/**
 * Scales in from its trigger (Radix sets the origin) in 150ms and fades out
 * faster than it came.
 */
function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  size,
  still,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> &
  VariantProps<typeof popoverContentVariants>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-surface={size === 'nav' ? 'ink' : undefined}
        align={align}
        sideOffset={sideOffset}
        className={cn(popoverContentVariants({ size, still }), className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

const popoverSectionVariants = cva('flex flex-col [&+&]:border-t', {
  variants: {
    pad: {
      /** Rows to pick from, each with its own padding. */
      rows: 'gap-px p-1',
      /** Text to read. */
      text: 'gap-2 p-3',
    },
    /** Scrolls on its own when the list runs long. Rows keep their height: a flex column would squeeze them to fit. */
    scroll: {
      true: 'max-h-80 overflow-y-auto overscroll-contain *:shrink-0',
      false: '',
    },
  },
  defaultVariants: { pad: 'rows', scroll: false },
})

/** One part of a `menu` popover: a search, a list, a footer. Parts are divided by a rule. */
function PopoverSection({
  className,
  pad,
  scroll,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof popoverSectionVariants>) {
  return <div className={cn(popoverSectionVariants({ pad, scroll }), className)} {...props} />
}

const popoverActionVariants = cva(
  [
    floatingRow,
    'focus-ring-inset transition-[background-color] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      tone: {
        default: [floatingRowTone.default, 'hover:bg-accent'],
        /** It deletes something the reader made, as `destructive-ghost`. */
        destructive: [
          floatingRowTone.destructive,
          'hover:bg-destructive/10 dark:hover:bg-destructive/20',
        ],
      },
    },
    defaultVariants: { tone: 'default' },
  },
)

/** A row that does something, in a section of rows: an icon, what it does, and its shortcut. */
function PopoverAction({
  icon,
  hint,
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof popoverActionVariants> & {
    icon?: React.ReactNode
    /** A shortcut, at the far edge. */
    hint?: string
  }) {
  return (
    <button type="button" className={cn(popoverActionVariants({ tone }), className)} {...props}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <kbd className="font-sans text-xs text-muted-foreground">{hint}</kbd> : null}
    </button>
  )
}

/** The name of a list inside a popover, or a line in place of an empty one. */
function PopoverLabel({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('m-0 px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAction,
  PopoverAnchor,
  PopoverContent,
  PopoverLabel,
  PopoverSection,
  PopoverTrigger,
}
