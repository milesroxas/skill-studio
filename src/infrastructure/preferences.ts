/**
 * The person's preferences, in `~/.skill-studio/preferences.json`. The desktop
 * app's main process reads the same file at launch, so the window opens in the
 * chosen theme before the page loads.
 */
import { join } from 'node:path'
import { type Preferences, preferencesOf } from '@domain/preferences.ts'
import { readJson, writeJson } from './fs.ts'
import { STUDIO_DIR } from './library.ts'

const PREFERENCES = join(STUDIO_DIR, 'preferences.json')

/** The stored preferences; a missing or unreadable file reads as the defaults. */
export function readPreferences(): Preferences {
  try {
    return preferencesOf(readJson<unknown>(PREFERENCES, {}))
  } catch {
    return preferencesOf({})
  }
}

export function writePreferences(preferences: Preferences): Preferences {
  const clean = preferencesOf(preferences)
  writeJson(PREFERENCES, clean)
  return clean
}
