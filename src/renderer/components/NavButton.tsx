/**
 * One item in a list column, a thing to open: a case, a score, a file, a
 * version. Every list on the left of a screen is built from these parts, so a
 * row reads the same wherever it stands:
 *
 *   Title, two lines at most ....... end
 *   One quiet line about it
 *
 * The title names the item. The meta line under it says one thing the reader
 * needs before opening it. `end` holds at most one value at the row's end,
 * such as the score chip, in a slot that keeps its edge down the list.
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'
import { useArrived } from '../motion.ts'
import { Dot } from './Status.tsx'
import { Text } from './text.tsx'

export function NavButton({
  current = false,
  arrived = false,
  end,
  className,
  children,
  ...props
}: ComponentProps<'button'> & {
  current?: boolean
  /** The item came into the list while the reader watched, such as a case just added: it fades in. */
  arrived?: boolean
  /** One value at the row's end, beside the title: a `ListScore`. */
  end?: ReactNode
}) {
  return (
    <button
      type="button"
      data-current={current || undefined}
      aria-current={current ? 'true' : undefined}
      className={cn(
        // Hover is a lighter tint than the open item, so pointing at a row never reads as opening it.
        // The fill fades on hover only: the open item changes at once, as a click or an arrow key asks.
        'group/row grid min-h-9 w-full grid-cols-[minmax(0,1fr)_auto] content-center items-center gap-x-3 gap-y-0.5 rounded-sm px-2 py-1.5 text-left whitespace-normal focus-ring-inset transition-[background-color] duration-150 ease-out hover:bg-accent/50 data-[current]:bg-accent data-[current]:text-foreground data-[current]:transition-none pointer-coarse:min-h-11',
        arrived && 'animate-ink',
        className,
      )}
      {...props}
    >
      {children}
      {/* On the title's first line, so a title that wraps never pulls the value down. */}
      {end ? (
        <span className="col-start-2 row-start-1 flex h-5 items-center justify-end self-start">
          {end}
        </span>
      ) : null}
    </button>
  )
}

/**
 * A `NavButton`'s first line: the item's name, on two lines at most, so names
 * that start alike still show the words that tell them apart. Opening the item
 * shows the rest of a longer one, in its column's header. Then
 * the unsaved dot after it, as a `NavItem` marks a draft. The dot is the
 * `warning` one from `Status`; a screen reader hears "unsaved changes". A dot
 * that comes while the reader types stamps in; one there when the list opens rests.
 * `font="mono"` is for a name that is a literal, such as a file's path.
 */
export function NavButtonTitle({
  children,
  unsaved = false,
  font,
}: {
  children: ReactNode
  unsaved?: boolean
  font?: 'sans' | 'mono'
}) {
  const changed = useArrived(String(unsaved))
  return (
    <span className="col-start-1 row-start-1 flex min-w-0 items-start gap-1.5 self-start">
      <Text
        size="ui"
        font={font}
        clamp
        // Held to a measure with pretty wrapping: a second line never holds one word alone.
        measure
        wrap={font === 'mono' ? 'anywhere' : 'normal'}
        className="min-w-0"
      >
        {children}
      </Text>
      {unsaved ? (
        <>
          {/* On the first line's middle, however many lines the name takes. */}
          <span className="flex h-5 shrink-0 items-center">
            <Dot size="sm" tone="warning" stamp={changed} />
          </span>
          <span className="sr-only">, unsaved changes</span>
        </>
      ) : null}
    </span>
  )
}

/**
 * A `NavButton`'s second line: one quiet fact about the item, in a line that
 * runs under the end slot too and is cut short rather than wrapping.
 */
export function NavButtonMeta({ children }: { children: ReactNode }) {
  return (
    <Text tone="muted" size="xs" tabular truncate block className="col-span-full">
      {children}
    </Text>
  )
}
