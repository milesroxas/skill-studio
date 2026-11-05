/**
 * How one person likes the app: its theme, its motion, how the editor opens
 * Markdown, and the model the assistant writes with. Every host keeps them in
 * one file; anything missing or unknown in it falls back to the default, so an
 * old or hand-edited file always reads.
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

export interface Preferences {
  theme: Theme
  motion: Motion
  editorMode: EditorMode
  /** The assistant's provider; empty until one is chosen, which means the first connected. */
  aiProvider: AiProviderId | ''
  aiModel: string
  /** Empty for the model's own default. */
  aiEffort: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  motion: 'system',
  editorMode: 'formatted',
  aiProvider: '',
  aiModel: '',
  aiEffort: '',
}

const MODEL_ID_MAX = 200

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
    aiProvider: pick(value.aiProvider, AI_PROVIDER_IDS, DEFAULT_PREFERENCES.aiProvider),
    aiModel: typeof value.aiModel === 'string' ? value.aiModel.slice(0, MODEL_ID_MAX) : '',
    aiEffort: pick(value.aiEffort, EFFORTS, DEFAULT_PREFERENCES.aiEffort),
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
