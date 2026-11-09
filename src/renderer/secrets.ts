/**
 * The keys' status as last read, kept between visits. The keychain takes a
 * moment to answer, and a screen that opened before it did would draw a key's
 * section folded and then spring it open. With this, a screen opens on what
 * is already known, and the read behind it only confirms.
 */
import type { Settings } from '@domain/secrets.ts'
import { api } from './api.ts'

let last: Settings | null = null

/** What the last read said; null before the first one lands. */
export const knownKeys = (): Settings | null => last

/** Read every key's status, and keep it for the next screen that shows it. */
export async function readKeys(): Promise<Settings> {
  last = await api.settings()
  return last
}

/** Read ahead of the first screen that shows a key. Call at launch. */
export const loadKeys = (): Promise<void> =>
  readKeys().then(
    () => {},
    // The screen reads again when it opens, and says why if that fails too.
    () => {},
  )
