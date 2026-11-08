/**
 * Which hand moved the focus last, on the document as `data-input`: "pointer"
 * after a click or a tap, "keyboard" after a key. The focus ring in
 * `styles.css` shows only for the keyboard: a person who clicked knows where
 * they clicked, and one who tabs needs to see where they landed.
 *
 * The browser's own `:focus-visible` guesses this too, but guesses wrong after
 * a click in a menu or a dialog, whose script hands the focus back to its
 * trigger: the trigger then lights up under the pointer that just closed it.
 *
 * Before the first input there is no attribute, and the ring shows: a
 * keyboard user is never left without it.
 */

/** Keys that only change another key, or ask the app for a shortcut, are not a move. */
const NOT_A_MOVE = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

export function trackInput(root: HTMLElement = document.documentElement): void {
  const set = (input: 'pointer' | 'keyboard') => {
    if (root.dataset.input !== input) root.dataset.input = input
  }
  // Captured, so a component that stops the event cannot hide it from here.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.metaKey || e.ctrlKey || NOT_A_MOVE.has(e.key)) return
      set('keyboard')
    },
    true,
  )
  window.addEventListener('pointerdown', () => set('pointer'), true)
}
