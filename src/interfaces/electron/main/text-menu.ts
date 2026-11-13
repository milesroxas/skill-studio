/**
 * The system's own menu for text, on a right-click the page leaves alone: in
 * a field, Undo, Redo, Cut, Copy, Paste and Select All; over text selected
 * elsewhere, Copy. A page in Electron has no such menu of its own, so without
 * this a right-click in a field does nothing. The page draws its own menu
 * for the things in it (`ContextActions`) and lets a right-click on text through.
 */
import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

/** What the menu is built from: where the click landed, and what the field can do now. */
export type TextMenuParams = Pick<ContextMenuParams, 'isEditable' | 'selectionText' | 'editFlags'>

/** The items for a right-click, or none, and then no menu opens. */
export function textMenu({
  isEditable,
  selectionText,
  editFlags,
}: TextMenuParams): MenuItemConstructorOptions[] {
  if (isEditable)
    return [
      { role: 'undo', enabled: editFlags.canUndo },
      { role: 'redo', enabled: editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: editFlags.canCut },
      { role: 'copy', enabled: editFlags.canCopy },
      { role: 'paste', enabled: editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: editFlags.canSelectAll },
    ]
  if (selectionText.trim()) return [{ role: 'copy' }]
  return []
}
