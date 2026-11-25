/**
 * What an output is shown through beside another: the card that holds what it
 * missed, the place it holds while it is still being written, and its letter.
 */
import type { ComponentProps } from 'react'
import { cn } from '../lib/utils.ts'
import { RunningChip } from './Status.tsx'
import { Text, Working } from './text.tsx'
import { Card } from './ui/card.tsx'

/** What one output missed: an object a reader sets beside another's, so it stands on its own card. */
export function OutputCard({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card role="article" className={cn('gap-0 overflow-hidden py-0', className)} {...props} />
}

/**
 * An output still being written, in the frame it will be drawn in on the
 * stage. The running chip says it is under way, and the line under it that the
 * reader has nothing to do: it comes by itself.
 */
export function OutputWriting() {
  return (
    <div
      role="status"
      className="m-0 flex size-full flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <RunningChip>
        <Working>Writing…</Working>
      </RunningChip>
      <Text size="xs" tone="muted">
        It shows here when it is done.
      </Text>
    </div>
  )
}

const SLOT =
  'inline-grid h-5 min-w-5 place-items-center rounded-sm border border-current px-1.25 font-mono text-2xs leading-none font-semibold'

/** A side's letter, A or B: an outline in the color of the text around it. Never filled: fill says "on". */
export function Slot({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn(SLOT, className)} {...props} />
}

/**
 * A side's letter as a switch: filled while its side is the one in view. Its
 * 20px box reaches 8px past itself each way, so it is 36px to press.
 */
export function SlotButton({
  pressed,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'type'> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        SLOT,
        'relative focus-ring transition-[color,background-color] duration-150 ease-out before:absolute before:-inset-2',
        pressed && 'bg-foreground text-background',
        className,
      )}
      {...props}
    />
  )
}
