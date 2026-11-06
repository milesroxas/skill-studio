/**
 * Skill Studio, the desktop app. The main process owns the windows, the
 * keychain, the URL schemes and the app's own updates; the operations run in
 * a backend utility process so the window never waits on disk or on an agent.
 */
import { join } from 'node:path'
import { loadDotEnv } from '@infrastructure/dotenv.ts'
import { readPreferences } from '@infrastructure/preferences.ts'
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { APP_ORIGIN, CHANNELS } from '../channels.ts'
import { Backend } from './backend.ts'
import { registerIpc } from './ipc.ts'
import { installMenu } from './menu.ts'
import { handleSchemes, registerSchemes } from './protocol.ts'
import { KeychainSecrets } from './secrets.ts'
import { createUpdater } from './updater.ts'
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
  // electron-updater is CommonJS: its `autoUpdater` is reached through the default export.
  const { autoUpdater } = electronUpdater
  // It would send an ID of this install with every check, for staged rollouts.
  // This project stages none, so every copy sends the same word instead.
  autoUpdater.requestHeaders = { 'x-user-staging-id': 'none' }
  const updater = createUpdater({
    source: autoUpdater,
    onState: (state) => {
      windows.expectQuit(state.status === 'installing')
      windows.tell(CHANNELS.updateState, state)
    },
  })
  installMenu(windows, updater)

  app.whenReady().then(async () => {
    const preferences = readPreferences()
    applyTheme(preferences.theme)
    backend.setEnv(await secrets.effective())
    backend.start()
    handleSchemes(backend, join(app.getAppPath(), 'out/renderer'))
    registerIpc({ backend, secrets, windows, updater, trusted: trustedOrigins(devUrl) })
    windows.launch()
    updater.follow(preferences.updates)
    // A click on the Dock icon with no app window: open one, whatever else is still up.
    app.on('activate', () => windows.launch())
  })
  app.on('second-instance', () => windows.focus())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => backend.stop())
}
