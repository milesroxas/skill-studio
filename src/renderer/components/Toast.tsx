/**
 * One line of feedback at the foot of the window, gone after a moment. When
 * the step it reports can be taken back, it offers Undo, and the Undo shortcut
 * takes the offer while it stands. A toast that announces something can offer
 * the one step that follows instead.
 */
import { useEffect, useState } from 'react'
import type { ToastState } from '../hooks.ts'
import { shortcut } from '../keys.ts'
import { cn } from '../lib/utils.ts'

/** A field with typing of its own to undo keeps the shortcut. */
const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'))

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  // The last toast stays in the pill while it fades, so it leaves whole.
  const [shown, setShown] = useState(toast)
  if (toast && toast !== shown) setShown(toast)
  const undo = toast?.undo
  const offer = shown?.undo
    ? { label: 'Undo', title: `Undo (${shortcut('Z')})`, run: shown.undo }
    : shown?.action
      ? { ...shown.action, title: undefined }
      : null

  useEffect(() => {
    if (!undo) return
    const handle = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      if (isEditable(e.target)) return
      e.preventDefault()
      undo()
      onDismiss()
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [undo, onDismiss])

  return (
    <div
      role="status"
      inert={!toast}
      className={cn(
        'fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-toast flex max-w-[min(56ch,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-chin bg-primary px-4 py-2 text-center text-ui text-pretty text-primary-foreground shadow-popover transition-[opacity,translate] duration-200 ease-out',
        toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        // Without a button the pill is only read, so clicks pass through it. With
        // one, the button sits 4px inside the pill's end, its curve inside the pill's.
        offer ? 'py-1 pr-1' : 'pointer-events-none',
      )}
    >
      <span className="min-w-0">{shown?.message}</span>
      {offer ? (
        <button
          type="button"
          title={offer.title}
          className="h-7 shrink-0 rounded-sm bg-primary-foreground/15 px-3 font-medium outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-primary-foreground/25 focus-visible:ring-2 focus-visible:ring-primary-foreground/70 active:scale-[0.96]"
          onClick={() => {
            offer.run()
            onDismiss()
          }}
        >
          {offer.label}
        </button>
      ) : null}
    </div>
  )
}
