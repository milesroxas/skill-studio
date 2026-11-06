/**
 * Starting over, on disk: everything the app keeps of its own goes, and
 * nothing of the person's does. The app's files are all in its own folder
 * (preferences, the library's settings, drafts, the practice skill, the
 * assistant's conversation, uploads and the trash), so the folder goes whole.
 * Skills are never in it: they stay where the person keeps them, with their
 * cases, runs and versions.
 */
import { rmdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { OLD_SETTINGS, STUDIO_DIR } from './library.ts'

export function clearStudioData(): void {
  rmSync(STUDIO_DIR, { recursive: true, force: true })
  // The library reads the old settings when it has none of its own, so they would come back.
  rmSync(OLD_SETTINGS, { force: true })
  try {
    rmdirSync(dirname(OLD_SETTINGS))
  } catch {
    // Missing, or it holds something the app did not put there: that stays.
  }
}
