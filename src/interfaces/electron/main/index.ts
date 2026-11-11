/**
 * Skill Studio, the desktop app. The main process owns the windows, the
 * keychain, the URL schemes and the app's own updates; the operations run in
 * a backend utility process so the window never waits on disk or on an agent.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import { loadDotEnv } from '@infrastructure/dotenv.ts'
import { installDirs, loginShellPath, mergePath } from '@infrastructure/path.ts'
import { readPreferences } from '@infrastructure/preferences.ts'
import { clearStudioData } from '@infrastructure/reset.ts'
import { app, dialog, session } from 'electron'
import electronUpdater from 'electron-updater'
import { APP_ORIGIN, CHANNELS } from '../channels.ts'
import { Backend } from './backend.ts'
import { registerIpc } from './ipc.ts'
import { appNameOf, devUrlOf, refusedSwitch } from './launch.ts'
import { installMenu } from './menu.ts'
import { handleSchemes, registerSchemes } from './protocol.ts'
import { pageRenderer } from './render.ts'
import { createReset } from './reset.ts'
import { KeychainSecrets } from './secrets.ts'
import { createUpdater } from './updater.ts'
import { applyTheme, RESETTABLE, trustedOrigins } from './window.ts'
import { createWindows } from './windows.ts'

/** The dev server's page, in a development copy only: a packaged app never loads one. */
const devUrl = devUrlOf(app.isPackaged, process.env)

/** How long a quit waits for the backend to end its agents before going ahead. */
const STOP_WAIT_MS = 3000

// Before anything reads the keychain: safeStorage names its item after the app.
app.setName(appNameOf(app.isPackaged, app.name))

/**
 * A development copy keeps its data apart from the installed app, as Signal and
 * VS Code do, and here one folder per checkout, so two worktrees' `pnpm dev`
 * open side by side instead of the second finding the instance lock taken and
 * quitting without a window. Skills and `~/.skill-studio` stay shared. A
 * `--user-data-dir` on the command line (the guide's screenshots) wins, as in
 * any Chromium app. The folder is made first: the lock lives in it.
 */
if (!app.isPackaged && !app.commandLine.hasSwitch('user-data-dir')) {
  const profile = join(app.getPath('appData'), app.name, basename(app.getAppPath()))
  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
  app.setPath('sessionData', profile)
}

// A packaged app started with a remote debugging switch would hand its page, and the
// bridge on it, to whatever connects; with the mock keychain it would keep keys in the
// open. It goes before it opens a window or starts the backend.
const refused = refusedSwitch(app.isPackaged, (name) => app.commandLine.hasSwitch(name))
if (refused) {
  console.error(`Skill Studio does not start with --${refused}.`)
  app.exit(1)
} else if (!app.requestSingleInstanceLock()) app.quit()
else {
  // A checkout's .env is a development convenience; a packaged app has none.
  if (!app.isPackaged) loadDotEnv(app.getAppPath())
  registerSchemes()

  // Opened from the Finder, the app has the system's bare PATH: add the folders
  // CLIs are installed in now, and the login shell's PATH once it answers.
  // HOME, as a CLI's own installer reads it: `~/.local/bin` is where it lands.
  const home = homedir()
  const backend = new Backend({
    ...process.env,
    PATH: mergePath(process.env.PATH, installDirs(home)),
  })
  /**
   * The login shell's PATH, handed to the backend when it answers. A shell
   * that is slow to start (a heavy profile, a cold disk) can miss the first
   * wait, so one more read follows a while after launch, with longer to answer.
   */
  const readLoginShellPath = (retry: boolean): void => {
    void loginShellPath(process.env.SHELL, retry ? 15_000 : 5000).then((path) => {
      if (path)
        backend.setEnv({
          PATH: mergePath(path, (process.env.PATH ?? '').split(delimiter), installDirs(home)),
        })
      else if (!retry) setTimeout(() => readLoginShellPath(true), 10_000).unref()
    })
  }
  readLoginShellPath(false)
  const userData = app.getPath('userData')
  const secrets = new KeychainSecrets(join(userData, 'secrets.json'), (env) => backend.setEnv(env))
  const boundsFile = join(userData, 'window.json')
  const windows = createWindows({ url: devUrl ?? `${APP_ORIGIN}/`, boundsFile, backend })
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

  /** Start the backend, take up the stored preferences and show what a launch shows. */
  const open = (): void => {
    const preferences = readPreferences()
    applyTheme(preferences.theme)
    backend.start()
    windows.launch()
    updater.follow(preferences.updates)
  }

  /**
   * Starting over. The stored keys stay: they are the one thing here a person
   * cannot get back by using the app again.
   */
  const reset = createReset({
    closeWindows: () => windows.closeAll(),
    stopBackend: () => backend.stop(),
    clear: async () => {
      clearStudioData()
      rmSync(boundsFile, { force: true })
      // What the page keeps for itself: the open skill, the side panel, the last version seen.
      await session.defaultSession.clearStorageData()
      await session.defaultSession.clearCache()
    },
    open,
    report: (error) =>
      dialog.showErrorBox(
        'Skill Studio could not start over',
        `Some of what the app keeps may still be there. ${(error as Error).message}`,
      ),
  })

  app.whenReady().then(async () => {
    // The window opens whatever the state of the stored keys: without them the
    // app still runs, and Settings says what is missing.
    let keysProblem: Error | null = null
    try {
      backend.setEnv(await secrets.effective())
    } catch (error) {
      keysProblem = error as Error
      console.error('Could not read the stored keys:', keysProblem)
    }
    handleSchemes(backend, join(app.getAppPath(), 'out/renderer'))
    // Grading looks at an agent's page as drawn, and only this process has a browser to draw it.
    backend.drawWith(pageRenderer())
    registerIpc({
      backend,
      secrets,
      windows,
      updater,
      reset: RESETTABLE ? () => void reset.run() : undefined,
      trusted: trustedOrigins(devUrl),
    })
    open()
    if (keysProblem)
      dialog.showErrorBox(
        'Skill Studio could not read its stored keys',
        `The app opened without them. Set them again in Settings. ${keysProblem.message}`,
      )
    // A click on the Dock icon with no app window: open one, whatever else is still up.
    // Not in the middle of starting over: the app opens by itself when that is done.
    app.on('activate', () => {
      if (!reset.running()) windows.launch()
    })
  })
  app.on('second-instance', () => {
    if (!reset.running()) windows.focus()
  })
  app.on('window-all-closed', () => {
    // Starting over closes every window and opens one again: that is no reason to quit.
    if (process.platform !== 'darwin' && !reset.running()) app.quit()
  })
  /**
   * Quitting waits for the backend to end its agents. Electron tears the
   * utility process down the moment `will-quit` returns, before the backend
   * could stop anything, so the first pass holds the quit and asks; the quit
   * goes through on the second pass, or after the wait is up. An update's
   * restart (`quitAndInstall`) quits the same way, so it waits too.
   */
  let backendStopped = false
  app.on('will-quit', (event) => {
    if (backendStopped) return
    event.preventDefault()
    const wait = new Promise<void>((done) => setTimeout(done, STOP_WAIT_MS))
    void Promise.race([backend.stop(), wait]).finally(() => {
      backendStopped = true
      app.quit()
    })
  })
}
