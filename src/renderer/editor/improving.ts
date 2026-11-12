/**
 * The rule the side panel is improving, held as a range that follows every
 * edit: a draft put in place, an undo, the writer's own typing. The range
 * takes whatever replaces it whole, so after a draft lands it covers the
 * draft. While it stands, its words keep a tint and its lines a bar down
 * their left edge (`.cm-improving`, `.cm-improving-line` in `theme.ts`):
 * the bar says the rule is in a conversation, where a tint alone reads as a
 * selection.
 */
import { type EditorState, type Range as Ranged, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView } from '@codemirror/view'

export interface Range {
  from: number
  to: number
}

/** Start following `from` to `to`, or stop with null. */
export const follow = StateEffect.define<Range | null>()

const mark = Decoration.mark({ class: 'cm-improving' })
const line = Decoration.line({ class: 'cm-improving-line' })

/** The tint on the rule's words and the bar on each of its lines. */
function marks(state: EditorState, range: Range): Ranged<Decoration>[] {
  const out: Ranged<Decoration>[] = []
  const last = state.doc.lineAt(range.to).number
  for (let n = state.doc.lineAt(range.from).number; n <= last; n++)
    out.push(line.range(state.doc.line(n).from))
  out.push(mark.range(range.from, range.to))
  return out
}

export const improvingField = StateField.define<Range | null>({
  create: () => null,
  update(range, tr) {
    let next = range
    // The start stays before text typed at it and the end goes after: what replaces the rule whole is the rule.
    if (next && tr.docChanged)
      next = { from: tr.changes.mapPos(next.from, -1), to: tr.changes.mapPos(next.to, 1) }
    for (const effect of tr.effects) if (effect.is(follow)) next = effect.value
    return next
  },
  provide: (field) =>
    EditorView.decorations.compute([field], (state) => {
      const range = state.field(field)
      return range && range.to > range.from
        ? Decoration.set(marks(state, range), true)
        : Decoration.none
    }),
})

/** The followed range, or null. */
export const improvingRange = (state: EditorState): Range | null =>
  state.field(improvingField, false) ?? null
