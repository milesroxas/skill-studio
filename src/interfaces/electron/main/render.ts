/**
 * Draws a page a sample wrote, for grading to look at: an offscreen window at
 * the size asked, the page loaded from the `artifact:` scheme under the same
 * sandbox policy Results shows it with, a PNG of what it drew and the box of
 * each element it drew. One page at a time, each in a window of its own that
 * is closed after.
 */
import { artifactPath, type DrawnPage, type PageRenderer } from '@domain/artifact-address.ts'
import { type PageLayout, readLayout } from '@domain/layout.ts'
import { BrowserWindow } from 'electron'
import { ARTIFACT_HOST, ARTIFACT_SCHEME } from '../channels.ts'
import { MEASURE_PAGE } from './measure.ts'

/** How long a page has to load, its scripts included. */
const LOAD_MS = 20_000
/** How long one drawing may take in all: a page that hangs after it loads must not hold the queue. */
const DRAW_MS = 30_000
/** Time after the load for a page's scripts, fonts and first transitions to settle. */
const SETTLE_MS = 800

/** How long the page has to be measured: a page that holds its thread must not hold the queue. */
const MEASURE_MS = 5000
/** The world the measuring script runs in: one the page's own scripts cannot reach. */
const MEASURE_WORLD = 4711

/** The longest side Jev reads. */
const LARGEST = 1568
/** The largest window a page is drawn in, a side: the picture is scaled to `LARGEST` anyway. */
const WINDOW_MAX = 4096

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms / 1000}s.`)), ms)
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}

/**
 * The elements the page drew, measured in its own window. A page that cannot
 * be measured is still drawn: the picture is judged without its layout.
 */
async function measure(page: Electron.WebContents): Promise<PageLayout | null> {
  try {
    return readLayout(
      await within(
        page.executeJavaScriptInIsolatedWorld(MEASURE_WORLD, [{ code: MEASURE_PAGE }]),
        MEASURE_MS,
        'Measuring the page',
      ),
    )
  } catch {
    return null
  }
}

async function draw(url: string, width: number, height: number): Promise<DrawnPage> {
  const window = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    frame: false,
    skipTaskbar: true,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })
  const page = window.webContents
  page.setAudioMuted(true)
  page.setWindowOpenHandler(() => ({ action: 'deny' }))
  page.on('will-navigate', (event) => event.preventDefault())
  // A page that crashes or runs out of memory never answers a capture.
  const gone = new Promise<never>((_, reject) => {
    page.once('render-process-gone', (_event, details) =>
      reject(new Error(`The page stopped (${details.reason}).`)),
    )
  })
  gone.catch(() => {})
  const capture = async () => {
    await Promise.race([within(window.loadURL(url), LOAD_MS, 'The page'), gone])
    await wait(SETTLE_MS)
    const layout = await Promise.race([measure(page), gone])
    return { image: await Promise.race([page.capturePage(), gone]), layout }
  }
  try {
    const { image, layout } = await within(capture(), DRAW_MS, 'Drawing the page')
    // A display with more than one device pixel to a CSS pixel draws larger, and Jev reads no
    // side past 1568: the PNG is the size asked, scaled down whole when it is larger than that.
    const fit = Math.min(1, LARGEST / width, LARGEST / height)
    const wanted = { width: Math.round(width * fit), height: Math.round(height * fit) }
    const { width: drawnWidth, height: drawnHeight } = image.getSize()
    const sized =
      drawnWidth === wanted.width && drawnHeight === wanted.height
        ? image
        : image.resize({ ...wanted, quality: 'best' })
    return { png: new Uint8Array(sized.toPNG()), layout }
  } finally {
    // Starting over destroys every window, this one included, possibly mid-draw.
    if (!window.isDestroyed()) window.destroy()
  }
}

/** Draw pages one after another, so grading a run never opens a window per sample at once. */
export function pageRenderer(): PageRenderer {
  let queue: Promise<unknown> = Promise.resolve()
  return (page, size) => {
    // Asked by the backend: a size is held to a window this process can draw.
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height))
      return Promise.reject(new Error('A page is drawn at a size in pixels.'))
    const width = Math.min(WINDOW_MAX, Math.max(1, Math.round(size.width)))
    const height = Math.min(WINDOW_MAX, Math.max(1, Math.round(size.height)))
    const url = `${ARTIFACT_SCHEME}://${ARTIFACT_HOST}${artifactPath(page)}`
    const next = queue.then(() => draw(url, width, height))
    queue = next.catch(() => {})
    return next
  }
}
