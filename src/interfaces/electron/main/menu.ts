/** The application menu: the standard roles, Back and Forward, and the app's own help. Set before `ready`. */
import {
  type BaseWindow,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  type NavigationHistory,
  shell,
} from 'electron'
import { CHANNELS } from '../channels.ts'

const DOCS_URL = 'https://github.com/milesroxas/skill-studio/blob/main/docs/guide.md'

/**
 * Step through the history of the page in a window; the page writes an entry
 * for every screen it shows. By offset, the way the page's own buttons go:
 * `goBack` is the browser's button, which passes over entries it judges were
 * made without a click.
 */
const step = (window: BaseWindow | undefined, offset: -1 | 1): void => {
  if (!(window instanceof BrowserWindow)) return
  const history: NavigationHistory = window.webContents.navigationHistory
  if (history.canGoToOffset(offset)) history.goToOffset(offset)
}

/** Show one of the page's own screens in a window, or in the first window when none has the focus. */
const show = (window: BaseWindow | undefined, screen: string): void => {
  const target = window instanceof BrowserWindow ? window : BrowserWindow.getAllWindows()[0]
  if (!target || target.isDestroyed()) return
  target.show()
  target.webContents.send(CHANNELS.go, screen)
}

export function installMenu(): void {
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: (_item, window) => step(window, -1),
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: (_item, window) => step(window, 1),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'How Skill Studio Works', click: (_item, window) => show(window, 'welcome') },
        { label: 'Guide', click: (_item, window) => show(window, 'docs') },
        { type: 'separator' },
        { label: 'Guide on GitHub', click: () => void shell.openExternal(DOCS_URL) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
