import { cn } from '@renderer/lib/utils.ts'
import { cva, type VariantProps } from 'class-variance-authority'
import { HoverCard as HoverCardPrimitive } from 'radix-ui'
import type * as React from 'react'

/**
 * More about a control, shown while the pointer rests on it or the keyboard
 * stands on it. Nothing in it is needed to use the control, and a screen
 * reader is not told of it: what it holds must be reachable another way. It
 * waits a beat before it opens, so a pointer passing over on its way elsewhere
 * opens nothing, and it stays while the pointer travels into it.
 */
function HoverCard({
  openDelay = 150,
  closeDelay = 120,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return (
    <HoverCardPrimitive.Root
      data-slot="hover-card"
      openDelay={openDelay}
      closeDelay={closeDelay}
      {...props}
    />
  )
}

function HoverCardTrigger({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

/**
 * Parts stacked in a column (`HoverCardSection`), never taller than the room
 * the window leaves. It scales in from its trigger like a popover and leaves
 * faster than it came.
 */
function HoverCardContent({
  className,
  align = 'start',
  sideOffset = 8,
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'z-popover flex max-h-[min(30rem,var(--radix-hover-card-content-available-height))] w-[min(360px,calc(100vw-16px))] origin-(--radix-hover-card-content-transform-origin) flex-col rounded-chin bg-popover text-popover-foreground shadow-popover outline-hidden duration-150 ease-out-strong data-[state=closed]:animate-out data-[state=closed]:duration-100 data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97]',
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

const hoverCardSectionVariants = cva('px-5', {
  variants: {
    part: {
      /** What the card is about: a line and the line under it. */
      head: 'flex shrink-0 flex-col gap-0.5 pt-4 pb-3',
      /** The reading. It scrolls on its own when it runs long. */
      body: 'min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4',
      /** The way to more, under a rule. */
      foot: 'flex shrink-0 border-t py-3',
    },
  },
  defaultVariants: { part: 'body' },
})

function HoverCardSection({
  className,
  part,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof hoverCardSectionVariants>) {
  return <div className={cn(hoverCardSectionVariants({ part }), className)} {...props} />
}

export { HoverCard, HoverCardContent, HoverCardSection, HoverCardTrigger }
