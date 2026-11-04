/** The application menu: the standard roles, plus the guide. Set before `ready`. */
import { app, Menu, type MenuItemConstructorOptions, shell } from 'electron'

const DOCS_URL = 'https://github.com/milesroxas/skill-studio/blob/main/docs/guide.md'

export function installMenu(): void {
  const mac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(mac ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
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
