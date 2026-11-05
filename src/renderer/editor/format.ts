/**
 * Formatting commands for the Markdown editor. Each one edits the Markdown
 * source, so what is saved is exactly what the Markdown view shows. Inline
 * styles read the syntax tree, so a second press takes the style off again.
 */
import { syntaxTree } from '@codemirror/language'
import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type StateCommand,
} from '@codemirror/state'
import type { KeyBinding } from '@codemirror/view'

export type InlineStyle = 'strong' | 'emphasis' | 'code' | 'strike'

const INLINE: Record<InlineStyle, { mark: string; node: string }> = {
  strong: { mark: '**', node: 'StrongEmphasis' },
  emphasis: { mark: '*', node: 'Emphasis' },
  code: { mark: '`', node: 'InlineCode' },
  strike: { mark: '~~', node: 'Strikethrough' },
}

/** The innermost `name` node that holds all of `[from, to]`. */
function enclosing(state: EditorState, name: string, from: number, to: number) {
  const inner = syntaxTree(state).resolveInner(from, 1)
  for (let node: typeof inner | null = inner; node; node = node.parent)
    if (node.name === name && node.from <= from && node.to >= to) return node
  return null
}

/** Wrap the selection in a style's marks, or take them off when it already has that style. */
export const toggleInline =
  (style: InlineStyle): StateCommand =>
  ({ state, dispatch }) => {
    const { mark, node } = INLINE[style]
    const tr = state.changeByRange((range) => {
      const found = enclosing(state, node, range.from, range.to)
      const open = found?.firstChild
      const close = found?.lastChild
      if (found && open && close && open !== close) {
        const changes = state.changes([
          { from: open.from, to: open.to },
          { from: close.from, to: close.to },
        ])
        return { changes, range: range.map(changes) }
      }
      if (range.empty) {
        return {
          changes: { from: range.from, insert: mark + mark },
          range: EditorSelection.cursor(range.from + mark.length),
        }
      }
      // Marks hug the text: `** word **` is not bold, so leave edge spaces outside.
      const text = state.sliceDoc(range.from, range.to)
      const from = range.from + (text.length - text.trimStart().length)
      const to = range.to - (text.length - text.trimEnd().length)
      if (from >= to) return { range }
      return {
        changes: [
          { from, insert: mark },
          { from: to, insert: mark },
        ],
        range: EditorSelection.range(from + mark.length, to + mark.length),
      }
    })
    dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
    return true
  }

/** Every line a selection touches, once each, in document order. */
function selectedLines(state: EditorState): Line[] {
  const lines = new Map<number, Line>()
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++)
      lines.set(n, state.doc.line(n))
  }
  return [...lines.keys()].sort((a, b) => a - b).map((n) => lines.get(n)!)
}

/**
 * Apply per-line edits. A cursor at a line start ends after what is inserted
 * there; a selection grows to hold it.
 */
function editLines(
  state: EditorState,
  dispatch: (tr: ReturnType<EditorState['update']>) => void,
  edit: (line: Line, index: number) => ChangeSpec | null,
): boolean {
  const changes = state.changes(
    selectedLines(state)
      .map((line, i) => edit(line, i))
      .filter((c): c is ChangeSpec => c !== null),
  )
  if (changes.empty) return false
  dispatch(
    state.update({
      changes,
      selection: EditorSelection.create(
        state.selection.ranges.map((r) =>
          r.empty
            ? EditorSelection.cursor(changes.mapPos(r.head, 1))
            : EditorSelection.range(
                changes.mapPos(r.anchor, r.anchor < r.head ? -1 : 1),
                changes.mapPos(r.head, r.head < r.anchor ? -1 : 1),
              ),
        ),
        state.selection.mainIndex,
      ),
      scrollIntoView: true,
      userEvent: 'input.format',
    }),
  )
  return true
}

const HEADING = /^(#{1,6})[ \t]+/

/** Make the selected lines a heading of `level`, or plain text when they already are one. */
export const toggleHeading =
  (level: number): StateCommand =>
  ({ state, dispatch }) => {
    const lines = selectedLines(state)
    const all = lines.every((line) => HEADING.exec(line.text)?.[1].length === level)
    return editLines(state, dispatch, (line) => {
      const current = HEADING.exec(line.text)?.[0] ?? ''
      const insert = all ? '' : `${'#'.repeat(level)} `
      return current === insert ? null : { from: line.from, to: line.from + current.length, insert }
    })
  }

export type BlockStyle = 'bullet' | 'ordered' | 'task'

/** A list item's marker after its indent: `- `, `1. ` or `- [ ] `. */
const LIST = /^(\s*)((?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)/

function listStyle(text: string): BlockStyle | null {
  const marker = LIST.exec(text)?.[2]
  if (!marker) return null
  if (/\[[ xX]\]/.test(marker)) return 'task'
  return /^\d/.test(marker) ? 'ordered' : 'bullet'
}

/** Make the selected lines a list of `style`, or plain lines when they already are one. */
export const toggleList =
  (style: BlockStyle): StateCommand =>
  ({ state, dispatch }) => {
    const lines = selectedLines(state)
    const filled = lines.filter((line) => line.text.trim() !== '')
    const target = filled.length ? filled : lines
    const all = target.every((line) => listStyle(line.text) === style)
    let number = 0
    return editLines(state, dispatch, (line) => {
      if (filled.length && line.text.trim() === '') return null
      const match = LIST.exec(line.text)
      const indent = match?.[1] ?? /^\s*/.exec(line.text)![0]
      const current = match?.[2] ?? ''
      number++
      const marker = style === 'bullet' ? '- ' : style === 'task' ? '- [ ] ' : `${number}. `
      const from = line.from + indent.length
      return { from, to: from + current.length, insert: all ? '' : marker }
    })
  }

/** Quote the selected lines, or unquote them when every one is already quoted. */
export const toggleQuote: StateCommand = ({ state, dispatch }) => {
  const lines = selectedLines(state)
  const all = lines.every((line) => line.text.startsWith('>'))
  return editLines(state, dispatch, (line) => {
    if (all) {
      const mark = /^>[ \t]?/.exec(line.text)![0]
      return { from: line.from, to: line.from + mark.length }
    }
    return line.text.startsWith('>') ? null : { from: line.from, insert: '> ' }
  })
}

/**
 * Turn the selection into a link. Selected text becomes the label with the
 * address selected to type over; a selected address becomes the target.
 */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    if (/^https?:\/\/\S+$/.test(text)) {
      return {
        changes: { from: range.from, to: range.to, insert: `[](${text})` },
        range: EditorSelection.cursor(range.from + 1),
      }
    }
    const start = range.from + text.length + 3
    return {
      changes: { from: range.from, to: range.to, insert: `[${text}](url)` },
      range: text
        ? EditorSelection.range(start, start + 3)
        : EditorSelection.cursor(range.from + 1),
    }
  })
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
  return true
}

/** The usual shortcuts. ⌘K stays with the skill switcher. */
export const formatKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: toggleInline('strong') },
  { key: 'Mod-i', run: toggleInline('emphasis') },
  { key: 'Mod-e', run: toggleInline('code') },
  { key: 'Mod-Shift-x', run: toggleInline('strike') },
]
