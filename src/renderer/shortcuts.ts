/**
 * The keyboard shortcuts in the page: one listener on the window, and the
 * commands the screens in view can do right now.
 *
 * A screen says what a command does while it is mounted (`useShortcut`); the
 * listener turns each key press into a shortcut, finds the command the
 * person's keys give it, and runs the newest handler for it. Nothing runs when
 * no screen in view handles the command, so the key then does what it would
 * have done.
 *
 * A key goes to what has the focus first. A shortcut with ⌘ (Ctrl) works
 * while a field or a menu has it; any other waits until the focus leaves, so
 * typing an "r" never opens Run. A dialog that stops the page stops every
 * shortcut, and so does the field in Settings that is listening for new keys.
 */
import {
  ariaCombo,
  comboOf,
  comboText,
  commandFor,
  firesIn,
  type KeyTarget,
  resolveKeys,
  type ShortcutId,
} from '@domain/shortcuts.ts'
import { useEffect, useRef } from 'react'
import { isMac } from './keys.ts'
import { readPreferences, usePreferences } from './preferences.ts'

interface Handler {
  run: () => void
}

/** The handlers of each command, newest last: the newest runs. */
const handlers = new Map<ShortcutId, Handler[]>()
/** How many fields are listening for new keys: none runs while one is. */
let paused = 0

/** A control that takes typing. A checkbox or a button does not. */
const FIELD = [
  'input:not([type="checkbox"],[type="radio"],[type="button"],[type="submit"],[type="reset"],[type="range"],[type="color"],[type="file"])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="searchbox"]',
].join(',')
/** A list that picks by letter, or a sheet over the page that does not stop it, such as Run. */
const MENU = '[role="menu"],[role="menubar"],[role="listbox"],[role="dialog"]'
/** A dialog that stops the page: while one is open, nothing behind it starts. */
const MODAL = '[data-slot="alert-dialog-content"],[data-slot="dialog-content"]'

function targetOf(target: EventTarget | null): KeyTarget {
  if (document.querySelector(MODAL)) return 'modal'
  if (!(target instanceof Element)) return 'page'
  if (target.closest(FIELD)) return 'field'
  if (target.closest(MENU)) return 'menu'
  return 'page'
}

function onKey(event: KeyboardEvent): void {
  // A key a component already acted on, or one that is part of composing a character, is not ours.
  if (paused || event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  const combo = comboOf(event, isMac)
  if (!combo) return
  const id = commandFor(combo, readPreferences().shortcuts)
  const handler = id ? handlers.get(id)?.at(-1) : undefined
  if (!handler || !firesIn(combo, targetOf(event.target))) return
  event.preventDefault()
  // Holding the key down does it once: a toggle held would flicker.
  if (event.repeat) return
  handler.run()
}

/** Listen to the window. Returns the way to stop, for a component that installs it. */
export function installShortcuts(): () => void {
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}

/** Hold every shortcut while a field listens for new keys. Returns the way to let them go. */
export function pauseShortcuts(): () => void {
  paused += 1
  let done = false
  return () => {
    if (done) return
    done = true
    paused -= 1
  }
}

/**
 * Do `run` when the keys of `id` are pressed, while this component is mounted
 * and `enabled`. The newest `run` is called, so it may close over fresh state.
 */
export function useShortcut(id: ShortcutId, run: () => void, enabled = true): void {
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => {
    if (!enabled) return
    const handler: Handler = { run: () => latest.current() }
    handlers.set(id, [...(handlers.get(id) ?? []), handler])
    return () => {
      const left = (handlers.get(id) ?? []).filter((h) => h !== handler)
      if (left.length) handlers.set(id, left)
      else handlers.delete(id)
    }
  }, [id, enabled])
}

/** The keys `id` is on now, after the person's changes; `''` when it has none. */
export function useShortcutKeys(id: ShortcutId): string {
  return resolveKeys(usePreferences().shortcuts)[id]
}

/** The hover text and the screen reader's keys of a control a shortcut also presses. */
export interface ShortcutHint {
  title: string
  'aria-keyshortcuts'?: string
}

/**
 * What a control says about the shortcut that does what it does: its hover
 * text with the keys after it, "Switch skill (⌘K)", and the keys for a screen
 * reader. Without a shortcut, the label alone.
 */
export const hintOf = (keys: string, label: string): ShortcutHint =>
  keys
    ? { title: `${label} (${comboText(keys, isMac)})`, 'aria-keyshortcuts': ariaCombo(keys, isMac) }
    : { title: label }

export const useShortcutHint = (id: ShortcutId, label: string): ShortcutHint =>
  hintOf(useShortcutKeys(id), label)

/** The places a shortcut goes to, by screen, for the sidebar's hover text. */
export const PLACE_SHORTCUTS: Readonly<Record<string, ShortcutId>> = {
  editor: 'go.editor',
  cases: 'go.cases',
  results: 'go.results',
  library: 'go.library',
  docs: 'go.docs',
  settings: 'go.settings',
}
