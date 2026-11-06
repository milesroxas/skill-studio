/**
 * Which windows are open. A first launch shows the welcome alone, in its own
 * small window; the app opens when the reader skips it, finishes it or closes
 * it. From then on a launch opens the app, and the welcome comes back beside
 * it whenever it is asked for. The changelog is a third window, opened from
 * the menu or the app and closed when it has been read.
 */
import { readPreferences } from '@infrastructure/preferences.ts'
import { app, type BrowserWindow } from 'electron'
import { CHANNELS, PUSH_TOPICS } from '../channels.ts'
import type { Backend } from './backend.ts'
import { pageUrl, type Target } from './launch.ts'
import { createChangelogWindow, createWelcomeWindow, createWindow } from './window.ts'

export interface Windows {
  /**
   * What a launch shows: the welcome the first time, the app ever after. Does
   * nothing when one of the two is already open.
   */
  launch(): void
  /** Open the app, or bring it forward, on a skill or a screen when one is named. */
  openApp(target?: Target): BrowserWindow
  /** Show the welcome, or bring it forward. */
  openWelcome(): void
  /** Leave the welcome for the app: the welcome closes once the app is in view. */
  enterApp(target?: Target): void
  /** Show what changed in each release, or bring that window forward. */
  openChangelog(): void
  /** Bring the app forward, or the welcome standing in for it; open one when neither is. */
  focus(): void
  /** Send a message to every window that shows the app's own page. */
  tell(channel: string, value: unknown): void
  /**
   * The app is closing its windows to install an update, or no longer is. While
   * it is, a closing welcome opens nothing in its place.
   */
  expectQuit(expected: boolean): void
}

export interface WindowsOptions {
  /** `ELECTRON_RENDERER_URL` from electron-vite in development; the app scheme otherwise. */
  url: string
  boundsFile: string
  backend: Backend
}

const raise = (window: BrowserWindow): void => {
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export function createWindows({ url, boundsFile, backend }: WindowsOptions): Windows {
  let appWindow: BrowserWindow | null = null
  let welcomeWindow: BrowserWindow | null = null
  let changelogWindow: BrowserWindow | null = null
  let quitting = false
  // An update's restart closes every window before the app hears `before-quit`.
  let installing = false
  app.on('before-quit', () => {
    quitting = true
  })

  const openApp = (target: Target = {}): BrowserWindow => {
    if (appWindow) {
      // The page is up: it is told where to go, in the order it would be clicked.
      if (target.skill) appWindow.webContents.send(CHANNELS.open, target.skill)
      if (target.screen) appWindow.webContents.send(CHANNELS.go, target.screen)
      raise(appWindow)
      return appWindow
    }
    const window = createWindow({ url: pageUrl(url, target), boundsFile })
    appWindow = window
    // Whatever the backend pushes goes on to the page, on the channel of its topic.
    const stops = PUSH_TOPICS.map((topic) =>
      backend.on(topic, (value) => {
        if (!window.isDestroyed()) window.webContents.send(CHANNELS[topic], value)
      }),
    )
    window.on('closed', () => {
      for (const stop of stops) stop()
      appWindow = null
    })
    return window
  }

  const openWelcome = (): void => {
    if (welcomeWindow) {
      raise(welcomeWindow)
      return
    }
    const window = createWelcomeWindow({
      url: pageUrl(url, { screen: 'welcome' }),
      over: appWindow,
    })
    welcomeWindow = window
    // Closing the welcome is one more way to skip it: the app opens in its place.
    // It opens before the welcome is gone, so the app is never left with no window.
    window.on('close', () => {
      if (!quitting && !installing && !appWindow) openApp()
    })
    window.on('closed', () => {
      welcomeWindow = null
    })
  }

  const openChangelog = (): void => {
    if (changelogWindow) {
      raise(changelogWindow)
      return
    }
    const window = createChangelogWindow({
      url: pageUrl(url, { screen: 'changelog' }),
      over: appWindow,
    })
    changelogWindow = window
    window.on('closed', () => {
      changelogWindow = null
    })
  }

  // The changelog is no place to work from: with it alone left open, a launch still opens the app.
  const launch = (): void => {
    if (appWindow || welcomeWindow) return
    if (readPreferences().welcomed) openApp()
    else openWelcome()
  }

  return {
    launch,
    openApp,
    openWelcome,
    openChangelog,
    enterApp: (target) => {
      const window = openApp(target)
      const leave = () => welcomeWindow?.close()
      // A new app window takes a moment to paint; the welcome holds the screen until it has.
      if (window.isVisible()) leave()
      else window.once('show', leave)
    },
    focus: () => {
      const window = appWindow ?? welcomeWindow
      if (window) raise(window)
      else launch()
    },
    tell: (channel, value) => {
      for (const window of [appWindow, welcomeWindow, changelogWindow])
        if (window && !window.isDestroyed()) window.webContents.send(channel, value)
    },
    expectQuit: (expected) => {
      installing = expected
    },
  }
}
