/**
 * Draws a page a sample wrote, for grading to look at: an offscreen window at
 * the size asked, the page loaded from the `artifact:` scheme under the same
 * sandbox policy Results shows it with, and a PNG of what it drew. One page at
 * a time, each in a window of its own that is closed after.
 */
import { artifactPath, type PageRenderer } from '@domain/artifact-address.ts'
import { BrowserWindow } from 'electron'
import { ARTIFACT_HOST, ARTIFACT_SCHEME } from '../channels.ts'

/** How long a page has to load, its scripts included. */
const LOAD_MS = 20_000
/** Time after the load for a page's scripts, fonts and first transitions to settle. */
const SETTLE_MS = 800

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

async function draw(url: string, width: number, height: number): Promise<Uint8Array> {
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
  try {
    await within(window.loadURL(url), LOAD_MS, 'The page')
    await wait(SETTLE_MS)
    const image = await page.capturePage()
    // A display with more than one device pixel to a CSS pixel draws larger, and Jev reads no
    // side past 1568: the PNG is the size asked, scaled down whole when it is larger than that.
    const fit = Math.min(1, LARGEST / width, LARGEST / height)
    const wanted = { width: Math.round(width * fit), height: Math.round(height * fit) }
    const { width: drawnWidth, height: drawnHeight } = image.getSize()
    const sized =
      drawnWidth === wanted.width && drawnHeight === wanted.height
        ? image
        : image.resize({ ...wanted, quality: 'best' })
    return new Uint8Array(sized.toPNG())
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
    const width = Math.min(WINDOW_MAX, Math.max(1, Math.round(size.width)))
    const height = Math.min(WINDOW_MAX, Math.max(1, Math.round(size.height)))
    const url = `${ARTIFACT_SCHEME}://${ARTIFACT_HOST}${artifactPath(page)}`
    const next = queue.then(() => draw(url, width, height))
    queue = next.catch(() => {})
    return next
  }
}
