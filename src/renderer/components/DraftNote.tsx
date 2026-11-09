/** Where unsaved work stands: kept as a draft, being stored, or failing to store. */
import type { Drafts } from '../drafts.ts'
import { Text } from './text.tsx'

const clock = (date: Date): string =>
  date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function DraftNote({
  drafts,
  dirty,
  saved,
}: {
  drafts: Drafts
  /** This file or case differs from what is saved. */
  dirty: boolean
  /** Its saved state, shown when nothing is unsaved: "saved", "new". */
  saved: string
}) {
  // A saved state is a word or two: the title beside it gives way, so it is never cut to "Sa…".
  if (!dirty)
    return (
      <Text size="xs" tone="muted" className="shrink-0">
        {saved}
      </Text>
    )
  if (drafts.status === 'failed')
    return (
      <Text size="xs" tone="destructive" role="status">
        Unsaved. The draft could not be stored.
      </Text>
    )
  return (
    <Text size="xs" tone="muted" tabular role="status">
      {drafts.status === 'pending' || !drafts.storedAt
        ? 'Unsaved · keeping a draft'
        : `Unsaved · draft kept ${clock(drafts.storedAt)}`}
    </Text>
  )
}
