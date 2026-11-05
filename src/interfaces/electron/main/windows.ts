/**
 * Which windows are open. A first launch shows the welcome alone, in its own
 * small window; the app opens when the reader skips it, finishes it or closes
 * it. From then on a launch opens the app, and the welcome comes back beside
 * it whenever it is asked for.
 */
import { readPreferences } from '@infrastructure/preferences.ts'
import { app, type BrowserWindow } from 'electron'
import { CHANNELS, PUSH_TOPICS } from '../channels.ts'
import type { Backend } from './backend.ts'
import { pageUrl, type Target } from './launch.ts'
import { createWelcomeWindow, createWindow } from './window.ts'

export interface Windows {
  /** What a launch shows: the welcome the first time, the app ever after. */
  launch(): void
  /** Open the app, or bring it forward, on a skill or a screen when one is named. */
  openApp(target?: Target): BrowserWindow
  /** Show the welcome, or bring it forward. */
  openWelcome(): void
  /** Leave the welcome for the app: the welcome closes once the app is in view. */
  enterApp(target?: Target): void
  /** Bring forward whichever window is open. */
  focus(): void
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
  let quitting = false
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
      if (!quitting && !appWindow) openApp()
    })
    window.on('closed', () => {
      welcomeWindow = null
    })
  }

  return {
    launch: () => (readPreferences().welcomed ? void openApp() : openWelcome()),
    openApp,
    openWelcome,
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
    },
  }
}
