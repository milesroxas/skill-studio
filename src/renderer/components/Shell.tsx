/**
 * The app frame. A window-sized grid: the sidebar on the left, the top bar and
 * the pane on the right. Nothing outside the pane scrolls, so the chrome never
 * moves and every screen lands in the same place. On macOS the title bar is
 * hidden: the top of the sidebar and the top bar are the drag regions, and the
 * window buttons sit over the sidebar.
 */
import type { ComponentProps, ReactNode } from 'react'
import { api } from '../api.ts'
import { cn } from '../lib/utils.ts'
import { Text } from './text.tsx'

export function AppFrame({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-platform={api.platform}
      className={cn(
        'grid h-dvh grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden sm:grid-cols-[208px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)]',
        className,
      )}
      {...props}
    >
      {/* Keyboard users skip the sidebar's dozen links on the way to the screen. */}
      <a
        href="#main"
        className="sr-only z-toast rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to the screen
      </a>
      {children}
    </div>
  )
}

/** The left column: a drag strip for the window buttons, then the skill, its loop and the app links. */
export function Sidebar({ className, children, ...props }: ComponentProps<'nav'>) {
  return (
    <nav
      aria-label="App"
      className={cn(
        'hidden min-h-0 flex-col border-r bg-sidebar text-sidebar-foreground sm:flex',
        className,
      )}
      {...props}
    >
      <div data-drag className="h-3 shrink-0 in-data-[platform=darwin]:h-12" />
      {children}
    </nav>
  )
}

/** The middle of the sidebar: the loop's sections, scrolling on their own when the window is short. */
export function SidebarBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3', className)}
      {...props}
    />
  )
}

export function SidebarFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-0.5 border-t px-2 py-2', className)} {...props} />
}

/** A labelled group of nav items. */
export function SidebarSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-px">
      {label ? (
        <Text size="xs" tone="faint" weight="medium" className="px-2 pb-1">
          {label}
        </Text>
      ) : null}
      {children}
    </div>
  )
}

const NAV_ITEM =
  'group/nav flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-sidebar-foreground/75 outline-none transition-[color,background-color] duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-foreground pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-foreground/55 aria-[current=page]:[&_svg]:text-sidebar-foreground'

/**
 * One place in the sidebar. `meta` is its status, right-aligned and tabular;
 * `dot` marks something waiting (an unsaved draft, an unsaved bench).
 */
export function NavItem({
  icon,
  label,
  meta,
  dot,
  current,
  className,
  ...props
}: ComponentProps<'button'> & {
  icon?: ReactNode
  label: string
  meta?: string | null
  dot?: boolean
  current?: boolean
}) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      className={cn(NAV_ITEM, className)}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {dot ? (
        <>
          <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
          <span className="sr-only">, unsaved changes</span>
        </>
      ) : null}
      {meta ? (
        <span className="text-xs font-normal text-sidebar-foreground/55 tabular-nums">{meta}</span>
      ) : null}
    </button>
  )
}

/** The right column: the top bar over the pane. */
export function Workspace({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-h-0 min-w-0 flex-col', className)} {...props} />
}

/** Where the reader is and the one step that matters here. The whole bar drags the window. */
export function TopBar({ className, children, ...props }: ComponentProps<'header'>) {
  return (
    <header
      data-drag
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b px-4 sm:px-6 in-data-[platform=darwin]:max-sm:pl-21',
        className,
      )}
      {...props}
    >
      {children}
    </header>
  )
}

/** The screen's own region: the one place that scrolls. */
export function Pane({ className, ...props }: ComponentProps<'main'>) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        'relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 outline-none [scrollbar-gutter:stable] sm:px-6',
        className,
      )}
      {...props}
    />
  )
}
