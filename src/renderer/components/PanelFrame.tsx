/**
 * The frame both assistant panels share: a header with the panel's title, its
 * own controls and a close button, and a body that keeps the newest text in
 * view while the reader has not scrolled away from it.
 */
import { cva } from 'class-variance-authority'
import { ArrowLeftIcon, XIcon } from 'lucide-react'
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react'
import { shortcut } from '../keys.ts'
import { useArrived } from '../motion.ts'
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

const headerVariants = cva(
  'flex h-12 shrink-0 items-center gap-1 border-b pr-2 pointer-coarse:gap-3',
  {
    variants: {
      /** A view opened from the chat leads with the way back, so the title starts after it. */
      back: { true: 'pl-2', false: 'pl-4' },
    },
  },
)

export function PanelHeader({
  title,
  children,
  back,
  onClose,
}: {
  title: string
  /** The panel's own controls, before the close button. */
  children?: ReactNode
  /** A view opened from the chat: the arrow before the title goes back to it. */
  back?: { label: string; onBack: () => void }
  onClose: () => void
}) {
  return (
    <header data-drag className={headerVariants({ back: Boolean(back) })}>
      {back ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={back.label}
          title={back.label}
          onClick={back.onBack}
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
      ) : null}
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

/**
 * The chat, or a view opened from it. One that replaces another comes in from
 * the side it was pushed from, as a page does: a view opened from the chat from
 * the right, the chat again from the left. The panel opening plays its own
 * arrival, so the first view is at rest.
 */
const viewVariants = cva('flex min-h-0 flex-1 flex-col', {
  variants: {
    enter: {
      none: '',
      push: 'animate-in duration-200 ease-out-strong fade-in-0 slide-in-from-right-3',
      pop: 'animate-in duration-200 ease-out-strong fade-in-0 slide-in-from-left-3',
    },
  },
  defaultVariants: { enter: 'none' },
})

export function PanelView({ view, children }: { view: 'chat' | 'opened'; children: ReactNode }) {
  const arrived = useArrived(view)
  return (
    <div
      key={view}
      className={viewVariants({ enter: arrived ? (view === 'chat' ? 'pop' : 'push') : 'none' })}
    >
      {children}
    </div>
  )
}
