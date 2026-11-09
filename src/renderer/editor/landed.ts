/**
 * Text the app put in the file, such as a rewrite picked from the selection
 * popout, keeps the selection's tint for a moment and fades out, so the eye
 * finds what changed. The range follows edits around it and clears itself
 * once the fade has played (`.cm-landed` in `theme.ts`).
 */
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

/** How long the tint stays: as long as its fade in `theme.ts`. */
const LANDED_MS = 1400

const land = StateEffect.define<{ from: number; to: number } | null>()

const mark = Decoration.mark({ class: 'cm-landed' })

export const landedField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    let next = set.map(tr.changes)
    for (const effect of tr.effects)
      if (effect.is(land))
        next =
          effect.value && effect.value.to > effect.value.from
            ? Decoration.set([mark.range(effect.value.from, effect.value.to)])
            : Decoration.none
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const timers = new WeakMap<EditorView, ReturnType<typeof setTimeout>>()

/** The effect that marks `from` to `to` as just landed, and clears the mark when the fade ends. */
export function landed(view: EditorView, from: number, to: number) {
  // A second landing before the first has faded keeps its full time.
  clearTimeout(timers.get(view))
  timers.set(
    view,
    setTimeout(() => {
      // The view may be gone by then: another file, another screen.
      if (view.dom.isConnected) view.dispatch({ effects: land.of(null) })
    }, LANDED_MS),
  )
  return land.of({ from, to })
}
