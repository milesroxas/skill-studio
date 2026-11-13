import { describe, expect, it } from 'vitest'
import { type TextMenuParams, textMenu } from './text-menu.ts'

const flags = (on: boolean): TextMenuParams['editFlags'] => ({
  canUndo: on,
  canRedo: on,
  canCut: on,
  canCopy: on,
  canPaste: on,
  canDelete: on,
  canSelectAll: on,
  canEditRichly: false,
})

const roles = (params: TextMenuParams) => textMenu(params).map((item) => item.role ?? item.type)

describe('textMenu', () => {
  it('offers the edit commands in a field, each enabled as the field allows', () => {
    const items = textMenu({ isEditable: true, selectionText: '', editFlags: flags(false) })
    expect(items.map((item) => item.role ?? item.type)).toEqual([
      'undo',
      'redo',
      'separator',
      'cut',
      'copy',
      'paste',
      'separator',
      'selectAll',
    ])
    expect(items.filter((item) => item.role).every((item) => item.enabled === false)).toBe(true)
  })

  it('offers Copy alone over text selected outside a field', () => {
    expect(roles({ isEditable: false, selectionText: 'A rule', editFlags: flags(true) })).toEqual([
      'copy',
    ])
  })

  it('opens nothing with no field and no selected text', () => {
    expect(roles({ isEditable: false, selectionText: '  \n', editFlags: flags(true) })).toEqual([])
  })
})
