/**
 * The application menu: the standard roles, Back and Forward, the app's own
 * help, and the way to its updates where each platform keeps it. Set before `ready`.
 */
import {
  app,
  type BaseWindow,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  type NavigationHistory,
  shell,
} from 'electron'
import type { Updater } from './updater.ts'
import type { Windows } from './windows.ts'

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

export function installMenu(windows: Windows, updater: Updater): void {
  const mac = process.platform === 'darwin'
  /** The changelog window shows the check as it runs and what it finds. */
  const checkForUpdates: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => {
      windows.openChangelog()
      updater.check(true)
    },
  }
  /** The standard app menu, with the check under About, where a Mac app keeps it. */
  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      checkForUpdates,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  }
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [appMenu] : []),
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
        { label: 'How Skill Studio Works', click: () => windows.openWelcome() },
        { label: 'Guide', click: () => void windows.openApp({ screen: 'docs' }) },
        { label: 'What’s New', click: () => windows.openChangelog() },
        ...(mac ? [] : [checkForUpdates]),
        { type: 'separator' },
        { label: 'Guide on GitHub', click: () => void shell.openExternal(DOCS_URL) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
