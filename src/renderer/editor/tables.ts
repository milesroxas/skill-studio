/**
 * A Markdown table drawn as a table in the formatted view. The source stays
 * the text: the drawn table stands over it until the cursor enters, then the
 * rows show as written and are edited as plain Markdown. A click on a cell
 * puts the cursor at that cell in the source.
 *
 * It lives in a state field, not in the live preview's view plugin: a
 * decoration that replaces whole lines changes the text's height, which
 * CodeMirror takes only from state. For the same reason it follows the
 * selection alone and not focus, so the text never jumps when a button
 * outside the editor is pressed.
 */
import { syntaxTree } from '@codemirror/language'
import { type EditorState, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode']

/** The class each inline style reads in, in running text and in a drawn table alike. */
export const INLINE: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
}
/** Marks that belong to an inline style and hide with it. */
export const INLINE_MARKS = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark'])

/** A run of a cell's text and the classes it reads in. */
interface Part {
  text: string
  cls: string
}
interface Cell {
  /** Where the cell's text starts, counted from the table's start. */
  at: number
  parts: Part[]
}
type Align = 'left' | 'center' | 'right'
export interface TableModel {
  head: Cell[]
  rows: Cell[][]
  align: Align[]
}

/** The text of `[from, to]` in `node` as styled runs, its Markdown marks left out. */
function read(
  state: EditorState,
  node: SyntaxNode,
  from: number,
  to: number,
  cls: string,
  out: Part[],
) {
  let pos = from
  const plain = (start: number, end: number) => {
    if (end > start) out.push({ text: state.sliceDoc(start, end), cls })
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.to <= from || child.from >= to) continue
    plain(pos, child.from)
    pos = child.to
    if (INLINE_MARKS.has(child.name)) continue
    if (child.name === 'Escape') {
      // `\|` is how a cell holds a bar: the reader sees the bar alone.
      plain(child.from + 1, child.to)
      continue
    }
    if (child.name === 'Link') {
      const [open, close] = child.getChildren('LinkMark')
      if (open && close && close.from > open.to && child.getChild('URL')) {
        read(state, child, open.to, close.from, `${cls} cm-md-link`.trim(), out)
        continue
      }
    }
    const style = INLINE[child.name]
    read(state, child, child.from, child.to, style ? `${cls} ${style}`.trim() : cls, out)
  }
  plain(pos, to)
}

/** A row's cells in order. A cell with nothing in it has no node of its own, only its bars. */
function cellsOf(state: EditorState, row: SyntaxNode, base: number): Cell[] {
  const cells: Cell[] = []
  let pending: SyntaxNode | null = null
  let edge = row.from
  let opened = false
  const push = () => {
    const parts: Part[] = []
    if (pending) read(state, pending, pending.from, pending.to, '', parts)
    cells.push({ at: (pending?.from ?? edge) - base, parts })
    pending = null
  }
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableCell') pending = child
    if (child.name !== 'TableDelimiter') continue
    // The bar that opens a row closes no cell.
    if (opened || pending) push()
    opened = true
    edge = child.to
  }
  if (pending) push()
  return cells
}

/** Each column's side, from the colons in the line under the head: `:--`, `:-:`, `--:`. */
function alignOf(line: string): Align[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => {
      const mark = cell.trim()
      if (mark.endsWith(':')) return mark.startsWith(':') ? 'center' : 'right'
      return 'left'
    })
}

/** What a `Table` node holds. Every row has as many cells as the head, as Markdown reads it. */
export function readTable(state: EditorState, table: SyntaxNode): TableModel {
  const header = table.getChild('TableHeader')
  const head = header ? cellsOf(state, header, table.from) : []
  const under = table.getChild('TableDelimiter')
  const align = under ? alignOf(state.sliceDoc(under.from, under.to)) : []
  const rows = table.getChildren('TableRow').map((row) => {
    const cells = cellsOf(state, row, table.from).slice(0, head.length)
    while (cells.length < head.length) cells.push({ at: row.to - table.from, parts: [] })
    return cells
  })
  return { head, rows, align }
}

class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly table: TableModel,
  ) {
    super()
  }
  override eq(other: TableWidget) {
    return other.source === this.source
  }
  override toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-tablewrap'
    const table = wrap.appendChild(document.createElement('table'))
    table.className = 'cm-md-tableview'
    const row = (into: HTMLElement, cells: Cell[], tag: 'th' | 'td') => {
      const tr = into.appendChild(document.createElement('tr'))
      cells.forEach((cell, column) => {
        const el = tr.appendChild(document.createElement(tag))
        el.dataset.at = String(cell.at)
        const side = this.table.align[column]
        if (side && side !== 'left') el.className = `cm-md-${side}`
        for (const part of cell.parts) {
          if (!part.cls) {
            el.append(part.text)
            continue
          }
          const span = el.appendChild(document.createElement('span'))
          span.className = part.cls
          span.textContent = part.text
        }
      })
    }
    row(table.appendChild(document.createElement('thead')), this.table.head, 'th')
    const body = table.appendChild(document.createElement('tbody'))
    for (const cells of this.table.rows) row(body, cells, 'td')
    // A press on a cell goes to that cell's text in the source; anywhere else, to the first row.
    wrap.addEventListener('mousedown', (event) => {
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-at]')
      event.preventDefault()
      view.dispatch({
        selection: { anchor: view.posAtDOM(wrap) + Number(cell?.dataset.at ?? 0) },
        userEvent: 'select.pointer',
      })
      view.focus()
    })
    return wrap
  }
}

/**
 * Whether `table` stands drawn. Not while the cursor is in it, and not inside
 * a list or a quote, whose lines hold more than the table's own text.
 */
export function tableDrawn(state: EditorState, table: SyntaxNode): boolean {
  if (table.parent?.name !== 'Document') return false
  return !state.selection.ranges.some((r) => r.from <= table.to && r.to >= table.from)
}

function draw(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = []
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'Table' || !tableDrawn(state, node)) continue
    const widget = new TableWidget(state.sliceDoc(node.from, node.to), readTable(state, node))
    out.push(Decoration.replace({ widget, block: true }).range(node.from, node.to))
  }
  return Decoration.set(out)
}

export const drawnTables = StateField.define<DecorationSet>({
  create: draw,
  update(set, tr) {
    const changed =
      tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)
    return changed ? draw(tr.state) : set
  },
  provide: (field) => EditorView.decorations.from(field),
})
