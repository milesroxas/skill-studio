/**
 * A row's actions in a table: buttons at its end while the table has room,
 * folded into one "More actions" menu when it is narrow. Each action is
 * written once and drawn either way, so the two never drift apart. The width
 * of the table decides, not the window's (the `bleed` table is the container),
 * at the width a `fold="first"` column goes. Its head takes `fold="menu"`.
 * `MoreActions` is the menu alone, outside a table.
 */

import { EllipsisIcon } from 'lucide-react'
import {
  Children,
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useRef,
  useState,
} from 'react'
import { Toolbar } from './layout.tsx'
import { Button } from './ui/button.tsx'
import { Popover, PopoverAction, PopoverContent, PopoverTrigger } from './ui/popover.tsx'

/** Where an action is drawn: in the row, or in the menu (`close` shuts it), for the row's `subject`. */
type Place = { in: 'row'; subject: string } | { in: 'menu'; subject: string; close: () => void }

const PlaceContext = createContext<Place>({ in: 'row', subject: '' })

/** The keys that walk a menu, as steps from the item in focus: -1 when the menu itself has it. */
const STEPS: Record<string, (at: number, count: number) => number> = {
  ArrowDown: (at, count) => (at + 1) % count,
  ArrowUp: (at, count) => (at < 0 ? count - 1 : (at - 1 + count) % count),
  Home: () => 0,
  End: (_, count) => count - 1,
}

/** Arrows, Home and End move between the menu's items, as in any menu. */
function walk(event: KeyboardEvent<HTMLDivElement>) {
  const step = STEPS[event.key]
  if (!step) return
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)'),
  ]
  if (!items.length) return
  event.preventDefault()
  const at = items.indexOf(document.activeElement as HTMLButtonElement)
  items[step(at, items.length)]?.focus()
}

/** The "More actions" button and the menu it opens, holding `RowAction`s. */
function Menu({ subject, children }: { subject: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  /** Opened by a pointer: the menu takes the focus, not its first item, as a native menu does. */
  const pointed = useRef(false)
  const menu = useRef<HTMLDivElement>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost-muted"
          size="icon-sm"
          aria-label={`More actions for ${subject}`}
          aria-haspopup="menu"
          title="More actions"
          onPointerDown={() => {
            pointed.current = true
          }}
          onKeyDown={() => {
            pointed.current = false
          }}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        size="actions"
        align="end"
        role="menu"
        aria-label={`Actions for ${subject}`}
        // A wider table puts the actions back in the row: the menu goes with its button.
        hideWhenDetached
        ref={menu}
        onOpenAutoFocus={(event) => {
          if (!pointed.current) return
          event.preventDefault()
          menu.current?.focus()
        }}
        onKeyDown={walk}
      >
        <PlaceContext.Provider value={{ in: 'menu', subject, close: () => setOpen(false) }}>
          {children}
        </PlaceContext.Provider>
      </PopoverContent>
    </Popover>
  )
}

export function RowActions({
  subject,
  children,
}: {
  /** What the row is, such as a skill's name: a screen reader hears which row an action is for. */
  subject: string
  /** `RowAction`s; none, and nothing is drawn. */
  children: ReactNode
}) {
  if (!Children.toArray(children).length) return null
  return (
    <>
      <div className="@max-2xl:hidden">
        <Toolbar gap="xs" justify="end" wrap={false} line>
          <PlaceContext.Provider value={{ in: 'row', subject }}>{children}</PlaceContext.Provider>
        </Toolbar>
      </div>
      <div className="@2xl:hidden">
        <Toolbar justify="end" wrap={false} line>
          <Menu subject={subject}>{children}</Menu>
        </Toolbar>
      </div>
    </>
  )
}

/**
 * The same menu at every width, for what is done to a column's subject now and
 * then: the actions a header would otherwise show beside the one its reader
 * came for. It holds `RowAction`s; none, and nothing is drawn.
 */
export function MoreActions({
  subject,
  children,
}: {
  /** What the actions are done to, such as a case's name. */
  subject: string
  children: ReactNode
}) {
  if (!Children.toArray(children).length) return null
  return <Menu subject={subject}>{children}</Menu>
}

export function RowAction({
  icon,
  show = 'label',
  disabled,
  busy,
  title,
  onSelect,
  children,
}: {
  icon: ReactNode
  /** How it shows in the row: its label, or its icon alone. The menu always shows both. */
  show?: 'label' | 'icon'
  disabled?: boolean
  /** Its work is on the way: disabled, and `aria-busy`. */
  busy?: boolean
  /** More about it, on hover. An icon alone takes its label. */
  title?: string
  onSelect: () => void
  /** What it does, as a verb and its object. */
  children: string
}) {
  const place = useContext(PlaceContext)
  const off = disabled || busy
  if (place.in === 'menu')
    return (
      <PopoverAction
        role="menuitem"
        icon={icon}
        title={title}
        disabled={off}
        aria-busy={busy || undefined}
        onClick={() => {
          // The menu leaves first, so whatever the action moves is seen moving.
          place.close()
          onSelect()
        }}
      >
        {children}
      </PopoverAction>
    )
  return show === 'icon' ? (
    <Button
      type="button"
      variant="ghost-muted"
      size="icon-sm"
      aria-label={`${children}: ${place.subject}`}
      title={title ?? children}
      disabled={off}
      aria-busy={busy || undefined}
      onClick={onSelect}
    >
      {icon}
    </Button>
  ) : (
    <Button
      type="button"
      variant="ghost-muted"
      size="sm"
      title={title}
      disabled={off}
      aria-busy={busy || undefined}
      onClick={onSelect}
    >
      {children}
    </Button>
  )
}
