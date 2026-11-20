/**
 * A panel the reader can resize and fold: the sidebar, the list beside a
 * workbench, the assistant. Open, it holds its contents at the width it was
 * dragged to; folded, it is a strip at its side that opens it again on a
 * click. Its fold button stands in the same place either way, so the click
 * that folds it lands where the one that opens it will.
 *
 * The parts are laid out by `styles.css` (`[data-fold]`) and moved by
 * `panels.ts`, which draws every frame without a render. On a window too
 * narrow for the panel to stand beside the page, it steps aside and its
 * contents lay out as they would without it.
 */
import type { ShortcutId } from '@domain/shortcuts.ts'
import { createContext, type ReactNode, useContext, useId, useLayoutEffect, useRef } from 'react'
import { PANELS, type PanelId, type Side } from '../fold.ts'
import { attachPanel, togglePanel, useFoldActive, usePanel } from '../panels.ts'
import { useShortcut, useShortcutHint } from '../shortcuts.ts'
import { Button } from './ui/button.tsx'

const SHORTCUT: Record<PanelId, ShortcutId> = {
  sidebar: 'sidebar.toggle',
  list: 'list.toggle',
  files: 'list.toggle',
  assistant: 'assistant.toggle',
}

const FoldSide = createContext<Side | null>(null)

/**
 * The side of a folding panel this header stands in, while the fold button
 * stands over it: the header keeps that corner free. Null outside one, and on
 * a window too narrow for the panel to fold.
 */
export const useFoldSlot = (): Side | null => useContext(FoldSide)

export function FoldPanel({
  id,
  name,
  ink = false,
  rail,
  children,
}: {
  id: PanelId
  /** What the panel is, after "Hide" or "Show": "the sidebar". */
  name: string
  /** On the sidebar's ink, in both themes. */
  ink?: boolean
  /** What the folded strip shows under the fold button: a count, an icon, or the sidebar's places. */
  rail?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const contents = useId()
  const { open, width } = usePanel(id)
  const active = useFoldActive(id)
  const size = PANELS[id]
  useLayoutEffect(() => (ref.current ? attachPanel(id, ref.current) : undefined), [id])
  // The assistant's keys open it over the page on a narrow window too.
  useShortcut(SHORTCUT[id], () => togglePanel(id), active || id === 'assistant')
  const label = `${open ? 'Hide' : 'Show'} ${name}`
  const hint = useShortcutHint(SHORTCUT[id], label)
  const surface = ink ? 'ink' : undefined
  return (
    <div
      ref={ref}
      data-fold={id}
      data-side={size.side}
      data-open={open}
      data-active={active ? '' : undefined}
      className={id === 'sidebar' ? 'max-sm:hidden' : undefined}
    >
      <div data-fold-clip="" data-surface={surface}>
        <div data-fold-inner="" id={contents} inert={active && !open}>
          <FoldSide.Provider value={active ? size.side : null}>{children}</FoldSide.Provider>
        </div>
      </div>
      <div data-fold-rail="" data-surface={surface} inert={!active || open}>
        {rail}
      </div>
      {/* Keyboard: the arrows resize it, Enter folds or opens it, Home and End go to its narrowest and widest. */}
      {/* biome-ignore lint/a11y/useSemanticElements: a divider that takes focus and keys is a separator with a value, which <hr> cannot be. */}
      <div
        data-fold-handle=""
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${name}`}
        aria-controls={contents}
        aria-valuemin={size.rail}
        aria-valuemax={size.max}
        // `panels.ts` keeps it current as the panel moves.
        aria-valuenow={open ? width : size.rail}
        tabIndex={active ? 0 : -1}
      />
      <Button
        type="button"
        variant="ghost-muted"
        size="icon-sm"
        // On the sidebar it takes the ink while the sidebar is under it: `panels.ts` sets that as it moves.
        data-fold-button=""
        className="bg-transparent"
        aria-label={label}
        aria-expanded={open}
        aria-controls={contents}
        {...hint}
        onClick={() => togglePanel(id)}
      >
        <FoldIcon side={size.side} />
      </Button>
    </div>
  )
}

/**
 * A panel's outline with its divider on the panel's side, and a chevron the
 * way the panel will go. The chevron turns when the panel folds (`styles.css`).
 */
function FoldIcon({ side }: { side: Side }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      {side === 'start' ? (
        <>
          <path d="M9 3v18" />
          <path data-chevron="" d="m16 15-3-3 3-3" />
        </>
      ) : (
        <>
          <path d="M15 3v18" />
          <path data-chevron="" d="m8 9 3 3-3 3" />
        </>
      )}
    </svg>
  )
}
