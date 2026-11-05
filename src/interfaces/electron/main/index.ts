/**
 * Skill Studio, the desktop app. The main process owns the windows, the
 * keychain and the URL schemes; the operations run in a backend utility
 * process so the window never waits on disk or on an agent.
 */
import { join } from 'node:path'
import { loadDotEnv } from '@infrastructure/dotenv.ts'
import { readPreferences } from '@infrastructure/preferences.ts'
import { app, BrowserWindow } from 'electron'
import { APP_ORIGIN } from '../channels.ts'
import { Backend } from './backend.ts'
import { registerIpc } from './ipc.ts'
import { installMenu } from './menu.ts'
import { handleSchemes, registerSchemes } from './protocol.ts'
import { KeychainSecrets } from './secrets.ts'
import { applyTheme, trustedOrigins } from './window.ts'
import { createWindows } from './windows.ts'

const devUrl = process.env.ELECTRON_RENDERER_URL

if (!app.requestSingleInstanceLock()) app.quit()
else {
  // A checkout's .env is a development convenience; a packaged app has none.
  if (!app.isPackaged) loadDotEnv(app.getAppPath())
  registerSchemes()

  const backend = new Backend({ ...process.env })
  const userData = app.getPath('userData')
  const secrets = new KeychainSecrets(join(userData, 'secrets.json'), (env) => backend.setEnv(env))
  const windows = createWindows({
    url: devUrl ?? `${APP_ORIGIN}/`,
    boundsFile: join(userData, 'window.json'),
    backend,
  })
  installMenu(windows)

  app.whenReady().then(async () => {
    applyTheme(readPreferences().theme)
    backend.setEnv(await secrets.effective())
    backend.start()
    handleSchemes(backend, join(app.getAppPath(), 'out/renderer'))
    registerIpc({ backend, secrets, windows, trusted: trustedOrigins(devUrl) })
    windows.launch()
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) windows.launch()
    })
  })
  app.on('second-instance', () => windows.focus())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => backend.stop())
}
