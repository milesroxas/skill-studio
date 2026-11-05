/**
 * The windows the app opens, each with a sandboxed renderer, context
 * isolation, no Node, no new windows and no navigation away from the app. The
 * app window remembers its bounds between runs. The welcome is small and fixed,
 * and stands in the middle of the display, as a first-run window does.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Theme } from '@domain/preferences.ts'
import { BrowserWindow, nativeTheme, type Rectangle, screen, shell } from 'electron'
import { APP_ORIGIN, ARTIFACT_HOST, ARTIFACT_SCHEME, IMAGE_HOST } from '../channels.ts'
import { placed } from './launch.ts'

/** The page color in styles.css (--background), so the window never flashes on open. */
const BACKGROUND = { light: '#fcfcfa', dark: '#100f0d' }
const DEFAULT_BOUNDS = { width: 1280, height: 860 }
const MIN = { width: 720, height: 480 }
/** Room for one step of the tour and nothing else. The page is laid out for exactly this. */
const WELCOME_SIZE = { width: 760, height: 600 }
/** On an empty display the welcome stands a little above the middle, where the eye rests. */
const WELCOME_RISE = 0.42
/** electron-vite writes the preload beside the main bundle, as CommonJS for the sandbox. */
const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')

const background = (): string =>
  nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light

/**
 * Put the app in a theme: native menus and dialogs follow it, and so does the
 * page's `prefers-color-scheme`, so even the first paint is in the right colors.
 */
export function applyTheme(theme: Theme): void {
  nativeTheme.themeSource = theme
  for (const window of BrowserWindow.getAllWindows()) window.setBackgroundColor(background())
}

const isHttp = (url: string): boolean => /^https?:$/.test(new URL(url).protocol)

const isArtifactUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === `${ARTIFACT_SCHEME}:` &&
      (parsed.host === ARTIFACT_HOST || parsed.host === IMAGE_HOST)
    )
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

/** What every window of the app's own page shares: the preload's bridge and nothing else. */
const PAGE_PREFERENCES = {
  preload: PRELOAD,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webviewTag: false,
  spellcheck: false,
}

/** Keep a window on the app's own page: outside links go to the browser, and nothing else opens. */
function confine(window: BrowserWindow, url: string): void {
  const appOrigin = new URL(url).origin
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
}

export function createWindow({ url, boundsFile }: WindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    ...readBounds(boundsFile),
    minWidth: MIN.width,
    minHeight: MIN.height,
    show: false,
    backgroundColor: background(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: PAGE_PREFERENCES,
  })
  window.once('ready-to-show', () => window.show())
  window.on('close', () => writeFileSync(boundsFile, JSON.stringify(window.getNormalBounds())))
  confine(window, url)
  void window.loadURL(url)
  return window
}

export interface WelcomeOptions {
  /** The page, on its welcome screen. */
  url: string
  /** The app window, when it is open: the welcome stands over it. */
  over: BrowserWindow | null
}

/**
 * The welcome's own window. It cannot be resized, zoomed or put full screen:
 * it holds one thing at a time and is closed or left, never arranged. Its
 * place is worked out fresh every time and never remembered.
 *
 * The page is laid out for exactly the window's size, and the reader's zoom
 * belongs to the app's origin, so it applies here too. A window that kept its
 * size under a larger zoom would cut the page off at its foot. So the window
 * grows and shrinks with the zoom, and the page always has the room it was
 * drawn for.
 */
export function createWelcomeWindow({ url, over }: WelcomeOptions): BrowserWindow {
  const anchor = over?.getBounds()
  const display = anchor
    ? screen.getDisplayMatching(anchor)
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const at = (zoom: number) =>
    placed(
      {
        width: Math.ceil(WELCOME_SIZE.width * zoom),
        height: Math.ceil(WELCOME_SIZE.height * zoom),
      },
      anchor ?? display.workArea,
      display.workArea,
      anchor ? 0.5 : WELCOME_RISE,
    )
  const window = new BrowserWindow({
    ...at(1),
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Welcome to Skill Studio',
    backgroundColor: background(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: PAGE_PREFERENCES,
  })
  // Windows and Linux hang the menu bar on every window; this one has no use for it.
  if (process.platform !== 'darwin') window.removeMenu()
  // The zoom is known once the page is; the window takes its size before anything is painted.
  window.webContents.once('dom-ready', () => {
    const zoom = window.webContents.getZoomFactor()
    if (zoom !== 1) window.setContentBounds(at(zoom))
  })
  window.once('ready-to-show', () => window.show())
  confine(window, url)
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
