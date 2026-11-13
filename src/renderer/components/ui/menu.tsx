/**
 * Menus: the list a "More actions" button drops, and the one a right-click
 * opens where the pointer is. Both are this one component on Radix's menu, so
 * they look, move and answer keys alike: arrows, Home, End, a name typed,
 * Escape. A screen does not use these parts: it writes `RowAction`s, and
 * `RowActions`, `MoreActions` and `ContextActions` draw them here.
 *
 * Three movements, each with a reason:
 *  - It scales in from where it opened: the button, or the pointer.
 *  - One highlight glides from row to row under the pointer, so the eye
 *    follows one thing instead of rows flashing on and off. From the keyboard
 *    it moves at once: a key pressed many times a day never waits on a slide.
 *  - On a choice, the other rows go first and the one chosen leaves last, so
 *    the reader sees which one acted. The action itself does not wait.
 */
import { cn } from '@renderer/lib/utils.ts'
import {
  ContextMenu as ContextMenuPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
} from 'radix-ui'
import {
  type ComponentProps,
  createContext,
  type FocusEvent,
  type ReactNode,
  useContext,
  useRef,
} from 'react'
import { floatingMotion, floatingRow, floatingRowTone, floatingSheet } from './floating.ts'

/** Which menu the parts are in: a button's, or a right-click's. Their Radix parts do not mix. */
type Kind = 'dropdown' | 'context'

const KindContext = createContext<Kind>('dropdown')

/** Not modal: a modal menu locks scrolling with a style tag, which the app's policy refuses. */
function DropdownMenu(props: Omit<ComponentProps<typeof DropdownMenuPrimitive.Root>, 'modal'>) {
  return <DropdownMenuPrimitive.Root modal={false} {...props} />
}

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

/** Not modal, for the same reason. A finger opens it by holding still on the trigger. */
function ContextMenu(props: Omit<ComponentProps<typeof ContextMenuPrimitive.Root>, 'modal'>) {
  return <ContextMenuPrimitive.Root modal={false} {...props} />
}

const ContextMenuTrigger = ContextMenuPrimitive.Trigger

const ORIGIN: Record<Kind, string> = {
  dropdown: 'origin-(--radix-dropdown-menu-content-transform-origin)',
  context: 'origin-(--radix-context-menu-content-transform-origin)',
}

const itemOf = (node: EventTarget | null): HTMLElement | null =>
  node instanceof HTMLElement && node.dataset.slot === 'menu-item' ? node : null

/**
 * Put the highlight on `item`, or take it away. It slides from the row it was
 * on, and jumps when it was hidden or a key moved it. Written on the element
 * itself, so a move never renders the menu again.
 */
function glideTo(glide: HTMLElement | null, item: HTMLElement | null, keyed: boolean) {
  if (!glide) return
  if (!item) {
    glide.style.transition = ''
    glide.style.opacity = '0'
    return
  }
  glide.style.transition = keyed || glide.style.opacity !== '1' ? 'none' : ''
  glide.style.transform = `translateY(${item.offsetTop}px)`
  glide.style.height = `${item.offsetHeight}px`
  glide.style.opacity = '1'
  glide.dataset.tone = item.dataset.tone ?? 'default'
}

/** Mark the row chosen and its menu, so the rest of the rows leave before it (`styles.css`). */
function choose(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return
  target.dataset.chosen = ''
  target.closest('[data-slot="menu-content"]')?.setAttribute('data-chosen', '')
}

function MenuContent({
  kind,
  label,
  align = 'start',
  hideWhenDetached,
  children,
}: {
  kind: Kind
  /** What the menu acts on, for a screen reader: "Actions for Brand voice". */
  label: string
  /** A button's menu: which of the button's edges it lines up with. */
  align?: 'start' | 'end'
  /** Gone when its trigger scrolls out of view or is no longer drawn. */
  hideWhenDetached?: boolean
  children: ReactNode
}) {
  const glide = useRef<HTMLSpanElement>(null)
  /** The last move came from a key: the highlight jumps instead of sliding. */
  const keyed = useRef(false)
  const shared = {
    'data-slot': 'menu-content',
    'aria-label': label,
    hideWhenDetached,
    className: cn(
      floatingSheet,
      floatingMotion,
      ORIGIN[kind],
      'relative flex w-max min-w-44 flex-col gap-px p-1',
      // Closing on a choice takes a little longer, so the row chosen is seen to stay.
      'data-chosen:data-[state=closed]:duration-200 data-chosen:data-[state=closed]:ease-in',
    ),
    onKeyDownCapture: () => {
      keyed.current = true
    },
    onPointerMove: () => {
      keyed.current = false
    },
    onFocus: (event: FocusEvent<HTMLDivElement>) =>
      glideTo(glide.current, itemOf(event.target), keyed.current),
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      if (itemOf(event.relatedTarget) || event.currentTarget.hasAttribute('data-chosen')) return
      glideTo(glide.current, null, keyed.current)
    },
  }
  const body = (
    <KindContext.Provider value={kind}>
      <span
        ref={glide}
        aria-hidden="true"
        data-slot="menu-glide"
        className="pointer-events-none absolute inset-x-1 top-0 rounded-xs bg-accent opacity-0 transition-[transform,opacity,background-color] duration-150 ease-out-strong data-[tone=destructive]:bg-destructive/10 dark:data-[tone=destructive]:bg-destructive/20"
      />
      {children}
    </KindContext.Provider>
  )
  return kind === 'dropdown' ? (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content align={align} sideOffset={4} {...shared}>
        {body}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  ) : (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content collisionPadding={8} {...shared}>
        {body}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  )
}

/** A row that does something: an icon and what it does, as a verb and its object. */
function MenuItem({
  icon,
  tone = 'default',
  onSelect,
  children,
  ...props
}: Omit<ComponentProps<typeof DropdownMenuPrimitive.Item>, 'onSelect' | 'className'> & {
  icon: ReactNode
  /** `destructive` deletes something the reader made: red, under a `MenuSeparator`, last. */
  tone?: keyof typeof floatingRowTone
  onSelect: () => void
  children: ReactNode
}) {
  const Item =
    useContext(KindContext) === 'dropdown' ? DropdownMenuPrimitive.Item : ContextMenuPrimitive.Item
  return (
    <Item
      {...props}
      data-slot="menu-item"
      data-tone={tone}
      className={cn(
        floatingRow,
        floatingRowTone[tone],
        // The glide behind it is the highlight; the row only lifts its icon to the text's color.
        'relative cursor-default outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50',
        tone === 'default' ? 'data-highlighted:[&_svg]:text-foreground' : '',
      )}
      onSelect={(event) => {
        choose(event.target)
        onSelect()
      }}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Item>
  )
}

/**
 * A hairline across the menu, edge to edge, that sets the rows after it apart.
 * Keys skip it. Between two destructive rows it is not drawn: one rule sets the
 * whole group apart.
 */
function MenuSeparator() {
  const Separator =
    useContext(KindContext) === 'dropdown'
      ? DropdownMenuPrimitive.Separator
      : ContextMenuPrimitive.Separator
  return (
    <Separator
      data-slot="menu-separator"
      className="-mx-1 my-1 h-px bg-border [[data-tone=destructive]+&]:hidden"
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
}
