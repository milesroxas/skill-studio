import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { Popover as PopoverPrimitive } from 'radix-ui'
import type * as React from 'react'

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
  'z-popover origin-(--radix-popover-content-transform-origin) rounded-lg bg-popover text-popover-foreground shadow-popover outline-hidden duration-150 ease-out-strong data-[state=closed]:duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]',
  {
    variants: {
      size: {
        default: 'w-72 p-1',
        /** A list to pick from, in sections divided by rules (`PopoverSection`). */
        menu: 'flex w-80 flex-col p-0',
        /** The sidebar, opened from the top bar on a narrow window. */
        nav: 'flex max-h-[80dvh] w-64 flex-col p-0 py-2',
        /** A log or a long reading, as wide as the window allows. */
        wide: 'w-[min(520px,calc(100vw-280px))] p-2',
        /** A few fields under their labels. */
        form: 'flex w-72 flex-col gap-4 p-3',
        /** A request to write and the reply under it, in sections (`PopoverSection`). */
        compose: 'flex w-[min(440px,calc(100vw-32px))] flex-col p-0',
        /** The same, for a reply as long as a file. */
        'compose-wide': 'flex w-[min(640px,calc(100vw-32px))] flex-col p-0',
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
        align={align}
        sideOffset={sideOffset}
        className={cn(popoverContentVariants({ size, still }), className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

const popoverSectionVariants = cva('flex flex-col gap-px p-1 [&+&]:border-t', {
  variants: {
    /** Scrolls on its own when the list runs long. Rows keep their height: a flex column would squeeze them to fit. */
    scroll: {
      true: 'max-h-80 overflow-y-auto overscroll-contain *:shrink-0',
      false: '',
    },
  },
  defaultVariants: { scroll: false },
})

/** One part of a `menu` popover: a search, a list, a footer. Parts are divided by a rule. */
function PopoverSection({
  className,
  scroll,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof popoverSectionVariants>) {
  return <div className={cn(popoverSectionVariants({ scroll }), className)} {...props} />
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

export { Popover, PopoverAnchor, PopoverContent, PopoverLabel, PopoverSection, PopoverTrigger }
