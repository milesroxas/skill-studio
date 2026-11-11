/**
 * Where the app says what just happened: one line in a place the frame keeps
 * for it, so it never lies over the work. While it speaks, the strip is ink,
 * laid down left to right like a stroke; the words rise in after it, and the
 * dot lands. Then it goes quiet and the strip is paper again. A failure
 * carries the red dot, a notice the reader must act on the amber one, anything
 * else the plain one. When the step it reports can be taken back, it offers
 * Undo, and the Undo shortcut takes the offer while it stands. A notice that
 * announces something can offer the one step that follows instead.
 *
 * A fact leaves on its own once it can be read, and waits while the pointer or
 * the keyboard is on the line. A failure, a warning or a fact marked `stays`
 * stays until the reader dismisses it or the next notice takes its place.
 *
 * `place`: `foot` is the 48px strip under the pane, the top bar's mirror, in
 * the app's and the changelog's window. `head` fills a cell of the welcome's
 * title strip, since its frame has no foot to give; it keeps the strip's own
 * surface and has no stroke.
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Notice, noticeMs } from '../hooks.ts'
import { shortcut } from '../keys.ts'
import { Dot } from './Status.tsx'
import { Text } from './text.tsx'
import { Button } from './ui/button.tsx'

/** A field with typing of its own to undo keeps the shortcut. */
const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'))

const line = cva('relative flex min-w-0 items-center text-ui', {
  variants: {
    place: {
      /**
       * The ink is the strip's own layer under its content: it draws in over
       * 300ms on the stroke curve and withdraws in 150ms. Transform and
       * opacity only.
       */
      foot: 'isolate h-12 shrink-0 border-t bg-background px-4 before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-sidebar before:opacity-0 before:transition-[transform,opacity] before:duration-150 before:ease-in data-shown:before:scale-x-100 data-shown:before:opacity-100 data-shown:before:duration-300 data-shown:before:ease-stroke sm:px-6',
      head: 'h-full in-data-[platform=darwin]:pl-12',
    },
  },
  defaultVariants: { place: 'foot' },
})

/**
 * The words and the offer. They rise in 60ms after the stroke starts and leave
 * faster than they came. On the foot they sit on ink, so they carry the ink
 * scope and the sidebar's text color.
 */
const row = cva(
  'flex min-w-0 flex-1 translate-y-1 items-center gap-3 opacity-0 transition-[opacity,translate] duration-150 ease-in in-data-shown:translate-y-0 in-data-shown:opacity-100 in-data-shown:delay-75 in-data-shown:duration-200 in-data-shown:ease-out-strong',
  {
    variants: {
      place: {
        foot: 'text-sidebar-foreground',
        head: '',
      },
    },
    defaultVariants: { place: 'foot' },
  },
)

export function StatusLine({
  notice,
  onDismiss,
  place,
}: VariantProps<typeof line> & { notice: Notice | null; onDismiss: () => void }) {
  // The last notice stays in the line while it fades, so it leaves whole.
  const [shown, setShown] = useState(notice)
  if (notice && notice !== shown) setShown(notice)
  const undo = notice?.undo
  const offer = shown?.undo
    ? { label: 'Undo', title: `Undo (${shortcut('Z')})`, run: shown.undo }
    : shown?.action
      ? { ...shown.action, title: undefined }
      : null
  const stays = shown ? noticeMs(shown) === null : false

  // The reader is on the line: a fact waits for them, and gets its full time again after.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!notice || held) return
    const ms = noticeMs(notice)
    if (ms === null) return
    const timer = setTimeout(onDismiss, ms)
    return () => clearTimeout(timer)
  }, [notice, held, onDismiss])

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
      data-place={place ?? 'foot'}
      data-shown={notice ? '' : undefined}
      className={line({ place })}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false)
      }}
    >
      <div
        inert={!notice}
        data-surface={place === 'head' ? undefined : 'ink'}
        className={row({ place })}
      >
        {/* A new notice lands its dot again. */}
        <span key={shown?.message} className="flex animate-pop">
          <Dot tone={shown?.tone} />
        </span>
        <Text size="ui" truncate title={shown?.message} className="min-w-0 flex-1">
          {shown?.message}
        </Text>
        {offer ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            title={offer.title}
            onClick={() => {
              offer.run()
              onDismiss()
            }}
          >
            {offer.label}
          </Button>
        ) : null}
        {stays ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={onDismiss}
          >
            <XIcon aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
