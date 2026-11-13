/**
 * Actions on one thing, written once as `RowAction`s and drawn in three places
 * so the places never drift apart:
 *
 *  - `RowActions`: buttons at a table row's end while the table has room,
 *    folded into one "More actions" menu when it is narrow. The width of the
 *    table decides, not the window's (the `bleed` table is the container), at
 *    the width a `fold="first"` column goes. Its head takes `fold="menu"`.
 *  - `MoreActions`: the "More actions" menu alone, at every width.
 *  - `ContextActions`: the same actions in a menu at the pointer, on a
 *    right-click (or a long press) anywhere on the thing.
 */

import { EllipsisIcon } from 'lucide-react'
import {
  createContext,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react'
import { hasActions, keepsTextMenu } from '../actions.ts'
import { Toolbar } from './layout.tsx'
import { Button } from './ui/button.tsx'
import {
  ContextMenu,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from './ui/menu.tsx'

/** Where an action is drawn: in the row as a button, or in a menu, for the row's `subject`. */
type Place = { in: 'row' | 'menu'; subject: string }

const PlaceContext = createContext<Place>({ in: 'row', subject: '' })

/** How big the "More actions" button is: `sm` in a table or a header, `xs` in a dense list. */
type MenuSize = 'sm' | 'xs'

/** The "More actions" button and the menu it opens, holding `RowAction`s. */
function Menu({
  subject,
  size = 'sm',
  children,
}: {
  subject: string
  size?: MenuSize
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost-muted"
          size={size === 'xs' ? 'icon-xs' : 'icon-sm'}
          aria-label={`More actions for ${subject}`}
          title="More actions"
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* A wider table puts the actions back in the row: the menu goes with its button. */}
      <MenuContent kind="dropdown" label={`Actions for ${subject}`} align="end" hideWhenDetached>
        <PlaceContext.Provider value={{ in: 'menu', subject }}>{children}</PlaceContext.Provider>
      </MenuContent>
    </DropdownMenu>
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
  if (!hasActions(children)) return null
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
  size,
  children,
}: {
  /** What the actions are done to, such as a case's name. */
  subject: string
  /** `xs` for a row of a dense list, such as a verdict; `sm` otherwise. */
  size?: MenuSize
  children: ReactNode
}) {
  if (!hasActions(children)) return null
  return (
    <Menu subject={subject} size={size}>
      {children}
    </Menu>
  )
}

/** A field, or a frame with a page of its own: its own right-click menu is the one wanted. */
const TYPING = 'input, textarea, select, iframe, [contenteditable]:not([contenteditable="false"])'

/**
 * Let the system's menu through where the reader came for the text: a field,
 * or text they selected inside the thing. Stopped here, in the capture phase,
 * the right-click never reaches this menu, nor one round it, and the default
 * is left alone.
 */
function letTextMenuThrough(event: MouseEvent<HTMLElement>) {
  const selection = window.getSelection()
  const clicked = {
    typing: event.target instanceof Element && event.target.closest(TYPING) !== null,
    selected:
      selection !== null &&
      !selection.isCollapsed &&
      event.currentTarget.contains(selection.anchorNode),
  }
  if (keepsTextMenu(clicked)) event.stopPropagation()
}

/**
 * The same `RowAction`s in a menu that opens at the pointer on a right-click
 * anywhere on `children`, or a long press under a finger. The thing stays
 * marked while the menu is open (`held`), so the reader sees what it acts on.
 * A field or selected text inside keeps the system's Cut, Copy and Paste.
 * Inside another `ContextActions`, the nearer one opens.
 *
 * It holds only what a click on the thing does not already do: opening the
 * thing is its click, so "Open" is never in it.
 */
export function ContextActions({
  subject,
  actions,
  children,
}: {
  /** What the actions are done to, such as a case's name. */
  subject: string
  /** `RowAction`s, often the very ones its row or header draws; none, and the right-click does nothing here. */
  actions: ReactNode
  /** The thing: one element that takes a ref and spreads its props, such as a `TableRow` or a `NavButton`. */
  children: ReactElement
}) {
  if (!hasActions(actions)) return children
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenuCapture={letTextMenuThrough}>
        {children}
      </ContextMenuTrigger>
      <MenuContent kind="context" label={`Actions for ${subject}`}>
        <PlaceContext.Provider value={{ in: 'menu', subject }}>{actions}</PlaceContext.Provider>
      </MenuContent>
    </ContextMenu>
  )
}

export function RowAction({
  icon,
  show = 'label',
  tone = 'default',
  disabled,
  busy,
  title,
  onSelect,
  children,
}: {
  icon: ReactNode
  /** How it shows in the row: its label, or its icon alone. A menu always shows both. */
  show?: 'label' | 'icon'
  /**
   * `destructive` deletes something the reader made. In a menu it is red and
   * stands under a rule, apart from the rest, so put it last; in a row it is
   * `destructive-muted`.
   */
  tone?: 'default' | 'destructive'
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
  if (place.in === 'menu') {
    // The menu closes as it is chosen, so whatever the action moves is seen moving.
    const item = (
      <MenuItem
        icon={icon}
        tone={tone}
        title={title}
        disabled={off}
        aria-busy={busy || undefined}
        onSelect={onSelect}
      >
        {children}
      </MenuItem>
    )
    return tone === 'destructive' ? (
      <>
        <MenuSeparator />
        {item}
      </>
    ) : (
      item
    )
  }
  const variant = tone === 'destructive' ? 'destructive-muted' : 'ghost-muted'
  return show === 'icon' ? (
    <Button
      type="button"
      variant={variant}
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
      variant={variant}
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
