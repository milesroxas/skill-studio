/**
 * The app frame. A window-sized grid: the sidebar on the left, the top bar and
 * the pane on the right. Nothing outside the pane scrolls, so the chrome never
 * moves and every screen lands in the same place. On macOS the title bar is
 * hidden: the top of the sidebar and the top bar are the drag regions, and the
 * window buttons sit over the sidebar.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { api } from '../api.ts'
import { shortcut } from '../keys.ts'
import { cn } from '../lib/utils.ts'
import { Mark } from './Mark.tsx'
import { Dot } from './Status.tsx'
import { Button } from './ui/button.tsx'

export function AppFrame({
  assistant = false,
  className,
  children,
  ...props
}: ComponentProps<'div'> & {
  /** The assistant's panel is open: on a wide window it takes a third column. */
  assistant?: boolean
}) {
  return (
    <div
      data-platform={api.platform}
      data-assistant={assistant ? 'open' : undefined}
      className={cn(
        'grid h-dvh grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden sm:grid-cols-[208px_minmax(0,1fr)] lg:grid-cols-[232px_minmax(0,1fr)] lg:data-[assistant=open]:grid-cols-[232px_minmax(0,1fr)_360px]',
        className,
      )}
      {...props}
    >
      {/* Keyboard users skip the sidebar's links on the way to the screen. */}
      <a
        href="#main"
        className="sr-only z-skip rounded-sm bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to the screen
      </a>
      {children}
    </div>
  )
}

/**
 * The left column, on ink in both themes: a drag strip for the window buttons
 * and, on macOS, the mark, then the skill, its loop and the app links.
 */
export function Sidebar({ className, children, ...props }: ComponentProps<'nav'>) {
  return (
    <nav
      aria-label="App"
      data-surface="ink"
      className={cn(
        'hidden min-h-0 flex-col bg-sidebar text-sidebar-foreground sm:flex',
        className,
      )}
      {...props}
    >
      <div
        data-drag
        className="flex h-3 shrink-0 items-center justify-end px-5 text-sidebar-foreground in-data-[platform=darwin]:h-12"
      >
        <Mark size="strip" />
      </div>
      {children}
    </nav>
  )
}

/** The middle of the sidebar: the skill's places, scrolling on their own when the window is short. */
export function SidebarBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3', className)}
      {...props}
    />
  )
}

/**
 * The foot of the sidebar: the app's own places under one rule. `lead` stands
 * above them inside the same rule, for something of the app's that comes and
 * goes, such as its update. It brings its own top and side padding.
 */
export function SidebarFooter({
  lead,
  className,
  children,
  ...props
}: ComponentProps<'div'> & { lead?: ReactNode }) {
  return (
    <div className={cn('shrink-0 border-t', className)} {...props}>
      {lead}
      <div className="flex flex-col gap-0.5 px-2 py-2">{children}</div>
    </div>
  )
}

/** The open skill's places, one under the next. */
export function SidebarSection({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-px">{children}</div>
}

const NAV_ITEM =
  'group/nav flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-ui text-sidebar-foreground/75 focus-ring-inset transition-[color,background-color] duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-foreground pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-foreground/55 aria-[current=page]:[&_svg]:text-sidebar-foreground'

/**
 * One place in the sidebar. `meta` is its status, right-aligned and tabular;
 * `dot` marks something waiting (an unsaved draft, unsaved scoring).
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
          <Dot size="sm" tone="warning" />
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

/** The way back, where the reader is, and the one step that matters here. The whole bar drags the window. */
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

/**
 * Back and Forward through the places the reader has been, at the bar's
 * leading edge, where a Mac window keeps them. The pair is pulled left by the
 * 14px between a button's edge and its arrow, so the Back arrow itself stands
 * on the left edge every screen starts from.
 */
export function HistoryNav({
  canBack,
  canForward,
  onBack,
  onForward,
}: {
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
}) {
  return (
    <div className="-ml-3.5 flex shrink-0 items-center pointer-coarse:gap-3">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Back"
        title={`Back (${shortcut('[')})`}
        disabled={!canBack}
        onClick={onBack}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Forward"
        title={`Forward (${shortcut(']')})`}
        disabled={!canForward}
        onClick={onForward}
      >
        <ChevronRightIcon aria-hidden="true" />
      </Button>
    </div>
  )
}

/**
 * The assistant's panel, beside the workspace and never over it on a wide
 * window, so the work stays in view while it answers. On a narrow window it
 * lies over the right edge instead. It comes in from the edge it lives on.
 */
export function AssistantPane({ className, ...props }: ComponentProps<'aside'>) {
  return (
    <aside
      aria-label="Assistant"
      className={cn(
        'flex min-h-0 min-w-0 animate-in flex-col border-l bg-background duration-200 ease-out-strong fade-in-0 slide-in-from-right-3 max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-popover max-lg:w-[min(380px,100vw)] max-lg:shadow-popover',
        className,
      )}
      {...props}
    />
  )
}

const paneVariants = cva(
  'relative min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none',
  {
    variants: {
      /**
       * `page`: the pane scrolls and pads its screen. `flush`: a workbench fills it
       * edge to edge and its columns scroll on their own; on narrow windows the
       * columns stack and the pane scrolls again.
       */
      layout: {
        page: 'px-4 py-6 [scrollbar-gutter:stable] sm:px-6',
        flush: 'flex flex-col lg:overflow-hidden',
      },
    },
    defaultVariants: { layout: 'page' },
  },
)

/** The screen's own region: the one place that scrolls, or that holds the columns that do. */
export function Pane({
  layout,
  className,
  ...props
}: ComponentProps<'main'> & VariantProps<typeof paneVariants>) {
  return (
    <main id="main" tabIndex={-1} className={cn(paneVariants({ layout }), className)} {...props} />
  )
}
