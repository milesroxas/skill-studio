/**
 * The one app window: sandboxed renderer, context isolation, no Node, no new
 * windows, no navigation away from the app. Bounds are remembered between runs.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, nativeTheme, type Rectangle, screen, shell } from 'electron'
import { APP_ORIGIN, ARTIFACT_HOST, ARTIFACT_SCHEME } from '../channels.ts'

/** The page color in styles.css (--background), so the window never flashes on open. */
const BACKGROUND = { light: '#fcfcfa', dark: '#100f0d' }
const DEFAULT_BOUNDS = { width: 1280, height: 860 }
const MIN = { width: 720, height: 480 }
/** electron-vite writes the preload beside the main bundle, as CommonJS for the sandbox. */
const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')

const isHttp = (url: string): boolean => /^https?:$/.test(new URL(url).protocol)

const isArtifactUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === `${ARTIFACT_SCHEME}:` && parsed.host === ARTIFACT_HOST
  } catch {
    return false
  }
}

function readBounds(file: string): Partial<Rectangle> {
  if (!existsSync(file)) return DEFAULT_BOUNDS
  const saved = JSON.parse(readFileSync(file, 'utf8')) as Rectangle
  // A display that is gone leaves the window off screen; fall back to the default size.
  const onScreen = screen.getAllDisplays().some((d) => {
    const { x, y, width, height } = d.workArea
    return saved.x >= x && saved.y >= y && saved.x < x + width && saved.y < y + height
  })
  return onScreen ? saved : DEFAULT_BOUNDS
}

export interface WindowOptions {
  /** `ELECTRON_RENDERER_URL` from electron-vite in development; the app scheme otherwise. */
  url: string
  boundsFile: string
}

export function createWindow({ url, boundsFile }: WindowOptions): BrowserWindow {
  const appOrigin = new URL(url).origin
  const window = new BrowserWindow({
    ...readBounds(boundsFile),
    minWidth: MIN.width,
    minHeight: MIN.height,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: PRELOAD,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  })
  window.once('ready-to-show', () => window.show())
  window.on('close', () => writeFileSync(boundsFile, JSON.stringify(window.getNormalBounds())))

  const { webContents } = window
  // Links the guide and Markdown render open in the browser; nothing opens a second window here.
  webContents.setWindowOpenHandler(({ url: target }) => {
    if (isHttp(target)) void shell.openExternal(target)
    return { action: 'deny' }
  })
  webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== appOrigin) event.preventDefault()
  })
  webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  void window.loadURL(url)
  return window
}

/** A sample's HTML full size, in a window with no preload and no app origin to reach. */
export function openArtifactWindow(url: string, parent: BrowserWindow): void {
  if (!isArtifactUrl(url)) throw new Error('Not an artifact.')
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    parent,
    title: 'Artifact',
    backgroundColor: BACKGROUND.light,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  void window.loadURL(url)
}

export const trustedOrigins = (devUrl: string | undefined): Set<string> =>
  new Set([APP_ORIGIN, ...(devUrl ? [new URL(devUrl).origin] : [])])
