/** Words that change with the reader's OS: ⌘ on a Mac and Ctrl elsewhere (the handlers accept both), and what each calls its file manager. */
import { api } from './api.ts'

const isMac = api.platform === 'darwin' || /Mac|iPhone|iPad/.test(navigator.userAgent)

/** `shortcut('K')` reads ⌘K on a Mac and Ctrl+K elsewhere. */
export const shortcut = (key: string): string => (isMac ? `⌘${key}` : `Ctrl+${key}`)

/** The control that shows a folder where it is kept, in the words the reader's OS uses for it. */
export const REVEAL_LABEL =
  api.platform === 'darwin'
    ? 'Reveal in Finder'
    : api.platform === 'win32'
      ? 'Show in File Explorer'
      : 'Open containing folder'
