/**
 * How one person likes the app: its theme, its motion, how the editor opens
 * Markdown, the model the assistant writes with, how much of the app's
 * first-visit help they have seen, and whether the desktop app looks for its
 * own updates. Every host keeps them in one file; anything
 * missing or unknown in it falls back to the default, so an old or hand-edited
 * file always reads.
 */
import { AI_PROVIDER_IDS, type AiChoice, type AiProviderId, EFFORTS } from './ai.ts'

const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** `system` follows the OS setting; `reduced` turns movement off whatever the OS says. */
const MOTIONS = ['system', 'reduced'] as const
export type Motion = (typeof MOTIONS)[number]

/** `formatted` styles Markdown in place; `markdown` shows the source. */
const EDITOR_MODES = ['formatted', 'markdown'] as const
export type EditorMode = (typeof EDITOR_MODES)[number]

/** `show` explains each screen in one line the first time it opens; `hide` never does. */
const HINTS = ['show', 'hide'] as const
export type Hints = (typeof HINTS)[number]

/** `auto` looks for a new version on its own and downloads it; `manual` waits to be asked. */
const UPDATE_MODES = ['auto', 'manual'] as const
export type UpdateMode = (typeof UPDATE_MODES)[number]

export interface Preferences {
  theme: Theme
  motion: Motion
  editorMode: EditorMode
  /** The welcome screen has been seen, so the app opens on the library from now on. */
  welcomed: boolean
  hints: Hints
  /** The screens whose hint was read and put away. */
  hintsSeen: string[]
  /** The assistant's provider; empty until one is chosen, which means the first connected. */
  aiProvider: AiProviderId | ''
  aiModel: string
  /** Empty for the model's own default. */
  aiEffort: string
  updates: UpdateMode
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  motion: 'system',
  editorMode: 'formatted',
  welcomed: false,
  hints: 'show',
  hintsSeen: [],
  aiProvider: '',
  aiModel: '',
  aiEffort: '',
  updates: 'auto',
}

const MODEL_ID_MAX = 200
/** More screens than the app has, and longer than any of their names. */
const SEEN_MAX = 40

/** Screens whose id changed, old to new. A hint put away under the old id is read under the new one. */
const RENAMED_SCREENS: Readonly<Record<string, string>> = { edit: 'editor' }

/**
 * Screens whose work now happens on another screen. An address kept from
 * before opens that screen. A hint put away for one of them says nothing about
 * the screen its work moved to, so that screen still explains itself once.
 */
const MOVED_SCREENS: Readonly<Record<string, string>> = {
  versions: 'editor',
  overview: 'results',
  generate: 'results',
  blind: 'results',
  compare: 'results',
  transcript: 'results',
  insights: 'results',
  knobs: 'results',
}

/** The screen an address names today, whatever id it was written with. */
export const currentScreen = (screen: string): string => renamed(screen) ?? moved(screen) ?? screen

/** A lookup in a table of ids: only the table's own keys, never one every object has, such as `constructor`. */
const own = (table: Readonly<Record<string, string>>, key: string): string | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined
const renamed = (screen: string): string | undefined => own(RENAMED_SCREENS, screen)
const moved = (screen: string): string | undefined => own(MOVED_SCREENS, screen)

/** Screen names from untrusted input: short strings, each once. */
const seenOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((v): v is string => typeof v === 'string' && v.length <= SEEN_MAX)
            .map((screen) => renamed(screen) ?? screen),
        ),
      ].slice(0, SEEN_MAX)
    : []

const pick = <T extends string, F extends string>(
  value: unknown,
  options: readonly T[],
  fallback: F,
): T | F => (options.includes(value as T) ? (value as T) : fallback)

/** Preferences from untrusted input: each known field kept, every other one the default. */
export function preferencesOf(raw: unknown): Preferences {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    theme: pick(value.theme, THEMES, DEFAULT_PREFERENCES.theme),
    motion: pick(value.motion, MOTIONS, DEFAULT_PREFERENCES.motion),
    editorMode: pick(value.editorMode, EDITOR_MODES, DEFAULT_PREFERENCES.editorMode),
    welcomed: value.welcomed === true,
    hints: pick(value.hints, HINTS, DEFAULT_PREFERENCES.hints),
    hintsSeen: seenOf(value.hintsSeen),
    aiProvider: pick(value.aiProvider, AI_PROVIDER_IDS, DEFAULT_PREFERENCES.aiProvider),
    aiModel: typeof value.aiModel === 'string' ? value.aiModel.slice(0, MODEL_ID_MAX) : '',
    aiEffort: pick(value.aiEffort, EFFORTS, DEFAULT_PREFERENCES.aiEffort),
    updates: pick(value.updates, UPDATE_MODES, DEFAULT_PREFERENCES.updates),
  }
}

/** The model the preferences name, or null while none has been chosen. */
export const aiChoiceOf = (preferences: Preferences): AiChoice | null =>
  preferences.aiProvider
    ? {
        provider: preferences.aiProvider,
        model: preferences.aiModel,
        effort: preferences.aiEffort,
      }
    : null

/** The preferences that hold `choice`. */
export const aiChoicePatch = (choice: AiChoice): Partial<Preferences> => ({
  aiProvider: choice.provider,
  aiModel: choice.model,
  aiEffort: choice.effort,
})
