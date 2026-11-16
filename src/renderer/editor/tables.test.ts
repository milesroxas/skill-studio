import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { skillMarkdown } from './language.ts'
import { readTable, tableDrawn } from './tables.ts'

function tableOf(doc: string, cursor = 0) {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: skillMarkdown(),
  })
  const tree = ensureSyntaxTree(state, doc.length, 1000)!
  const node = tree.topNode.getChild('Table')!
  return { state, node }
}
/** Each cell as its text, a styled run as `text{classes}`. */
function cells(doc: string) {
  const { state, node } = tableOf(doc)
  const { head, rows, align } = readTable(state, node)
  const text = (row: typeof head) =>
    row.map((cell) => cell.parts.map((p) => (p.cls ? `${p.text}{${p.cls}}` : p.text)).join(''))
  return { head: text(head), rows: rows.map(text), align }
}

describe('readTable', () => {
  it('reads cells without their Markdown marks', () => {
    const doc =
      'x\n\n| Need | Tool |\n| --- | --- |\n| Hover | **CSS transition** |\n| Mount | **CSS `@starting-style`** (new) |'
    expect(cells(doc)).toEqual({
      head: ['Need', 'Tool'],
      rows: [
        ['Hover', 'CSS transition{cm-md-strong}'],
        ['Mount', 'CSS {cm-md-strong}@starting-style{cm-md-strong cm-md-code} (new)'],
      ],
      align: ['left', 'left'],
    })
  })

  it('keeps an empty cell in its column and fills a short row', () => {
    const doc = 'x\n\n| a | b | c |\n|:--|:-:|--:|\n| 1 |  | 3 |\n| 4 |'
    expect(cells(doc)).toEqual({
      head: ['a', 'b', 'c'],
      rows: [
        ['1', '', '3'],
        ['4', '', ''],
      ],
      align: ['left', 'center', 'right'],
    })
  })

  it('shows a link by its words and an escaped bar as a bar', () => {
    const doc = 'x\n\na | b\n--- | ---\n[docs](https://example.com) | a \\| b'
    expect(cells(doc).rows).toEqual([['docs{cm-md-link}', 'a | b']])
  })

  it('says where each cell starts in the source', () => {
    const { state, node } = tableOf('x\n\n| a | b |\n| - | - |\n| c |  |')
    const at = (row: { at: number }[]) => row.map((cell) => cell.at)
    const { head, rows } = readTable(state, node)
    expect(at(head)).toEqual([2, 6])
    expect(rows.map(at)).toEqual([[22, 25]])
  })
})

describe('tableDrawn', () => {
  const doc = 'x\n\n| a |\n| - |\n| b |'
  it('draws a table the cursor is outside', () => {
    const { state, node } = tableOf(doc)
    expect(tableDrawn(state, node)).toBe(true)
  })
  it('shows the source while the cursor is in it', () => {
    const { state, node } = tableOf(doc, 5)
    expect(tableDrawn(state, node)).toBe(false)
  })
})
