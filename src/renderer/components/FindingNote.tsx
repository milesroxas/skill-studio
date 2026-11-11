/**
 * What an underlined word in SKILL.md set off, beside the word while the
 * pointer rests on it. The editor decides when it opens and closes
 * (`editor/graded.ts`); this draws it. It takes no focus, so the text keeps
 * the caret, and it says nothing a click on the rule's number does not: the
 * popout lists the same findings.
 */
import type { Finding } from '@domain/lint.ts'
import type { RefObject } from 'react'
import { FindingList } from './Refine.tsx'
import type { VirtualAnchor } from './SelectionTools.tsx'
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.tsx'

export function FindingNote({
  anchor,
  findings,
  open,
  onPointerEnter,
  onPointerLeave,
  onDismiss,
}: {
  /** The underlined words. */
  anchor: RefObject<VirtualAnchor | null>
  findings: Finding[]
  open: boolean
  onPointerEnter: () => void
  onPointerLeave: () => void
  /** Escape, or a press anywhere else. */
  onDismiss: () => void
}) {
  return (
    <Popover open={open} onOpenChange={(next) => next || onDismiss()}>
      <PopoverAnchor virtualRef={anchor as RefObject<VirtualAnchor>} />
      <PopoverContent
        size="note"
        side="bottom"
        align="start"
        aria-label="Writing check"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <FindingList findings={findings} />
      </PopoverContent>
    </Popover>
  )
}
