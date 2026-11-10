/**
 * The last scan of the library, shared by the Library screen and the skill
 * switcher. A scan walks every workspace folder, so the switcher reuses a
 * recent one; the Library scans after each change it makes, which keeps the
 * shared copy current.
 */
import { api } from './api.ts'

type Library = Awaited<ReturnType<typeof api.library>>

const RESCAN_AFTER_MS = 30_000
let last: { at: number; library: Library } | null = null

/** Scan the library and keep the answer for the next reader. */
export async function scanLibrary(): Promise<Library> {
  const library = await api.library()
  last = { at: Date.now(), library }
  return library
}

/** The last scan's skills, however old; null before the first scan. */
export const scannedSkills = (): Library['skills'] | null => last?.library.skills ?? null

/** Whether the last scan is recent enough to show without scanning again. */
export const scanIsFresh = (): boolean => last !== null && Date.now() - last.at < RESCAN_AFTER_MS

/** Drop the kept scan, so the next reader scans. */
export const forgetScan = (): void => {
  last = null
}
