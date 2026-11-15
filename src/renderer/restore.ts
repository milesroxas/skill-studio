/**
 * What Restore asks before it puts a version's files back. Restoring writes
 * every file of the skill, so it is asked about whatever the files hold that
 * no version keeps: edits saved since the last run, and edits not saved at
 * all. An unsaved edit is dropped with the restore, so it never stands over
 * the restored file as a draft that saving would write back over it.
 */

import type { ConfirmOptions } from './components/confirm.tsx'
import { plural } from './model.ts'

export function restoreAsk({
  version,
  current,
  changed,
  unsaved,
}: {
  /** The version to restore. */
  version: string
  /** The version the files hold now. */
  current: string
  /** The files were saved since the last run, so no version holds them. */
  changed: boolean
  /** The files with unsaved edits. */
  unsaved: string[]
}): ConfirmOptions {
  if (changed)
    return {
      title: `Restore ${version} and lose your latest edits?`,
      description: unsaved.length
        ? 'Your edits since the last run, saved or not, are kept nowhere else. Save and run them first to keep them as a version.'
        : 'Your edits since the last run are kept nowhere else. Run them first to keep them as a version.',
      action: 'Restore',
      destructive: true,
    }
  if (unsaved.length)
    return {
      title: `Restore ${version} and lose your unsaved edits?`,
      description: `Your unsaved edits to ${unsaved.length === 1 ? unsaved[0] : plural(unsaved.length, 'file')} are lost. ${current} stays in the list, so you can return to it.`,
      action: 'Restore',
      destructive: true,
    }
  return {
    title: `Restore ${version}?`,
    description: `The skill’s files go back to ${version}. ${current} stays in the list, so you can return to it.`,
    action: 'Restore',
  }
}
