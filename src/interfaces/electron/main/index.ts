/**
 * Skill Studio, the desktop app. The main process owns the window, the
 * keychain and the URL schemes; the operations run in a backend utility
 * process so the window never waits on disk or on an agent.
 */
import { join } from 'node:path'
import { loadDotEnv } from '@infrastructure/dotenv.ts'
import { readPreferences } from '@infrastructure/preferences.ts'
import { app, BrowserWindow } from 'electron'
import { APP_ORIGIN, CHANNELS } from '../channels.ts'
import { Backend } from './backend.ts'
import { registerIpc } from './ipc.ts'
import { installMenu } from './menu.ts'
import { handleSchemes, registerSchemes } from './protocol.ts'
import { JEV_KEY, KeychainSecrets } from './secrets.ts'
import { applyTheme, createWindow, trustedOrigins } from './window.ts'

const devUrl = process.env.ELECTRON_RENDERER_URL

if (!app.requestSingleInstanceLock()) app.quit()
else {
  // A checkout's .env is a development convenience; a packaged app has none.
  if (!app.isPackaged) loadDotEnv(app.getAppPath())
  registerSchemes()
  installMenu()

  const backend = new Backend({ ...process.env })
  const userData = app.getPath('userData')
  const secrets = new KeychainSecrets(join(userData, 'secrets.json'), (value) =>
    backend.setEnv({ [JEV_KEY]: value }),
  )
  const url = devUrl ?? `${APP_ORIGIN}/`
  const boundsFile = join(userData, 'window.json')

  const openWindow = () => {
    const window = createWindow({ url, boundsFile })
    const stop = backend.onJobs((jobs) => {
      if (!window.isDestroyed()) window.webContents.send(CHANNELS.jobs, jobs)
    })
    window.on('closed', stop)
  }

  app.whenReady().then(async () => {
    applyTheme(readPreferences().theme)
    const key = await secrets.effective()
    if (key) backend.setEnv({ [JEV_KEY]: key })
    backend.start()
    handleSchemes(backend, join(app.getAppPath(), 'out/renderer'))
    registerIpc({ backend, secrets, trusted: trustedOrigins(devUrl) })
    openWindow()
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) openWindow()
    })
  })
  app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => backend.stop())
}
