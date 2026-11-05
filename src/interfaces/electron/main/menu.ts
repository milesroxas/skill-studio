/** The application menu: the standard roles, Back and Forward, and the guide. Set before `ready`. */
import {
  app,
  type BaseWindow,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  type NavigationHistory,
  shell,
} from 'electron'

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
      submenu: [{ label: `${app.name} guide`, click: () => void shell.openExternal(DOCS_URL) }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
