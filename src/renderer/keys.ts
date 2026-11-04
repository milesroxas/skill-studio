/** Shortcut labels for the reader's OS: ⌘ on a Mac, Ctrl elsewhere. The handlers accept both. */
import { api } from './api.ts'

const isMac = api.platform === 'darwin' || /Mac|iPhone|iPad/.test(navigator.userAgent)

/** `shortcut('K')` reads ⌘K on a Mac and Ctrl+K elsewhere. */
export const shortcut = (key: string): string => (isMac ? `⌘${key}` : `Ctrl+${key}`)
