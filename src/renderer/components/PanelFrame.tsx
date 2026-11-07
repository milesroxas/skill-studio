/**
 * The frame both assistant panels share: a header with the panel's title, its
 * own controls and a close button, and a body that keeps the newest text in
 * view while the reader has not scrolled away from it.
 */
import { XIcon } from 'lucide-react'
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react'
import { shortcut } from '../keys.ts'
import { Spacer } from './layout.tsx'
import { Heading } from './text.tsx'
import { Button } from './ui/button.tsx'

/** Within this many pixels of the end, new text keeps the view at the end. */
const PINNED_WITHIN = 48

export interface Pin {
  scroller: RefObject<HTMLDivElement | null>
  /** Whether new text keeps the view at the end. Set it after sending, so the reply shows. */
  pinned: RefObject<boolean>
}

/** After every render, keep the newest text in view unless the reader scrolled away from it. */
export function usePin(): Pin {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  })
  return { scroller, pinned }
}

export function PanelHeader({
  title,
  children,
  onClose,
}: {
  title: string
  /** The panel's own controls, before the close button. */
  children?: ReactNode
  onClose: () => void
}) {
  return (
    <header
      data-drag
      className="flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-4 pointer-coarse:gap-3"
    >
      <Heading level="page" as="h2">
        {title}
      </Heading>
      <Spacer />
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close the assistant"
        title={`Close (${shortcut('J')})`}
        onClick={onClose}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </header>
  )
}

export function PanelBody({ pin, children }: { pin: Pin; children: ReactNode }) {
  return (
    <div
      ref={pin.scroller}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      onScroll={(event) => {
        const el = event.currentTarget
        pin.pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_WITHIN
      }}
    >
      {children}
    </div>
  )
}
