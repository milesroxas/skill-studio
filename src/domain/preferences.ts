/**
 * How one person likes the app: its theme, its motion and how the editor opens
 * Markdown. Every host keeps them in one file; anything missing or unknown in
 * it falls back to the default, so an old or hand-edited file always reads.
 */

const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** `system` follows the OS setting; `reduced` turns movement off whatever the OS says. */
const MOTIONS = ['system', 'reduced'] as const
export type Motion = (typeof MOTIONS)[number]

/** `formatted` styles Markdown in place; `markdown` shows the source. */
const EDITOR_MODES = ['formatted', 'markdown'] as const
export type EditorMode = (typeof EDITOR_MODES)[number]

export interface Preferences {
  theme: Theme
  motion: Motion
  editorMode: EditorMode
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  motion: 'system',
  editorMode: 'formatted',
}

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback

/** Preferences from untrusted input: each known field kept, every other one the default. */
export function preferencesOf(raw: unknown): Preferences {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    theme: pick(value.theme, THEMES, DEFAULT_PREFERENCES.theme),
    motion: pick(value.motion, MOTIONS, DEFAULT_PREFERENCES.motion),
    editorMode: pick(value.editorMode, EDITOR_MODES, DEFAULT_PREFERENCES.editorMode),
  }
}
