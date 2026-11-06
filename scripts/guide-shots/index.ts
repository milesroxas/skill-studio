/**
 * Retakes the guide's screenshots: `pnpm guide:shots`.
 *
 * It seeds a scratch home with sample skills, starts the built app against it
 * with its own profile, and saves one picture per screen to docs/images/.
 * Your own skills, settings and a running copy of the app are never touched:
 * SKILL_STUDIO_HOME stands in for the home folder and the profile is a temp
 * folder. Run it after a change to how a screen looks, then check the guide's
 * text against the new pictures.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = join(ROOT, 'docs/images')
/**
 * Every picture is this shape (width over height), so the guide can hold its
 * space before it loads. A shot leaves the sidebar out, which keeps the text
 * readable in the guide's column; the one shot of the whole app keeps it.
 */
const SHAPE = 5 / 4
/** The window width a screen is shot at unless it needs more room. */
const WIDTH = 1120
/** The key only has to exist: it hides the "No Jev key" warning. No shot makes a Jev call. */
const PLACEHOLDER_KEY = 'guide-shots-placeholder'

interface Shot {
  file: string
  /** The route, as the app writes it in the URL hash. */
  route: string
  /** A button to press once the screen is up, by the start of its text. */
  press?: string
  /** Show the whole window, sidebar included. */
  whole?: boolean
  /** A wider window, for a screen whose table needs it. */
  width?: number
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** One DevTools session with the app's page. */
async function connect(port: number) {
  let pageUrl = ''
  for (let tries = 0; tries < 50 && !pageUrl; tries += 1) {
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Array<{
      type: string
      url: string
      webSocketDebuggerUrl: string
    }>
    pageUrl =
      targets.find((t) => t.type === 'page' && t.url.startsWith('studio://'))
        ?.webSocketDebuggerUrl ?? ''
    if (!pageUrl) await sleep(200)
  }
  if (!pageUrl) throw new Error('The app opened no window.')
  const socket = new WebSocket(pageUrl)
  await new Promise((done, fail) => {
    socket.onopen = done
    socket.onerror = () => fail(new Error('Could not reach the app window.'))
  })
  let lastId = 0
  const waiting = new Map<
    number,
    { done: (value: Record<string, unknown>) => void; fail: (error: Error) => void }
  >()
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number
      result?: Record<string, unknown>
      error?: { message: string }
    }
    const waiter = message.id === undefined ? undefined : waiting.get(message.id)
    if (!waiter || message.id === undefined) return
    waiting.delete(message.id)
    if (message.error) waiter.fail(new Error(message.error.message))
    else waiter.done(message.result ?? {})
  }
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((done, fail) => {
      lastId += 1
      waiting.set(lastId, { done, fail })
      socket.send(JSON.stringify({ id: lastId, method, params }))
    })
  /** Run an expression in the page; a thrown error or a rejected promise fails the script. */
  const run = async (expression: string): Promise<unknown> => {
    const reply = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (reply.exceptionDetails) throw new Error(`The page threw on: ${expression}`)
    return (reply.result as { value?: unknown }).value
  }
  return { send, run, close: () => socket.close() }
}

type Page = Awaited<ReturnType<typeof connect>>

/** Press the first button whose text starts with `label`; fails when there is none. */
async function press(page: Page, label: string): Promise<void> {
  const pressed = await page.run(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.trim().startsWith(${JSON.stringify(label)}),
    )
    button?.click()
    return Boolean(button)
  })()`)
  if (!pressed) throw new Error(`No button starts with "${label}".`)
}

/** Fonts in, two frames painted, and time for the screen's own fetches to land. */
const settle = (page: Page) =>
  page.run(`document.fonts.ready
    .then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
    .then(() => new Promise((done) => setTimeout(done, 700)))`)

/** Wait for the sidebar: the app has rendered. A page still loading throws, so ask again. */
async function appReady(page: Page): Promise<void> {
  for (let tries = 0; tries < 100; tries += 1) {
    const ready = await page
      .run(`Boolean(document.querySelector('nav[aria-label="App"]'))`)
      .catch(() => false)
    if (ready) return
    await sleep(100)
  }
  throw new Error('The app did not render.')
}

const resize = (page: Page, width: number, height: number) =>
  page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  })

async function take(page: Page, shot: Shot): Promise<void> {
  const width = shot.width ?? WIDTH
  await resize(page, width, Math.round(width / SHAPE))
  const sidebar = Number(
    await page.run(`document.querySelector('nav[aria-label="App"]').getBoundingClientRect().width`),
  )
  const screen = { x: sidebar, y: 0, width: width - sidebar }
  const height = Math.round((shot.whole ? width : screen.width) / SHAPE)
  await resize(page, width, height)
  await page.run(`window.location.hash = ${JSON.stringify(shot.route)}`)
  await settle(page)
  if (shot.press) {
    await press(page, shot.press)
    await settle(page)
  }
  // No row may show a hover or a focus it only has from the script: park the pointer on the
  // drag strip and let go of the focus.
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 })
  await page.run('document.activeElement instanceof HTMLElement && document.activeElement.blur()')
  await settle(page)
  const { data } = await page.send('Page.captureScreenshot', {
    format: 'webp',
    quality: 90,
    ...(shot.whole ? {} : { clip: { ...screen, height, scale: 1 } }),
  })
  writeFileSync(join(OUT, shot.file), Buffer.from(String(data), 'base64'))
  console.log(`docs/images/${shot.file}`)
}

/** Start the built app on the scratch home; resolves with its DevTools port. */
function launch(home: string, profile: string): Promise<{ app: ChildProcess; port: number }> {
  const electron: string = createRequire(import.meta.url)('electron')
  const app = spawn(electron, [ROOT, `--user-data-dir=${profile}`, '--remote-debugging-port=0'], {
    env: { ...process.env, SKILL_STUDIO_HOME: home, TYPESAFE_API_KEY: PLACEHOLDER_KEY },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  return new Promise((done, fail) => {
    let log = ''
    app.stderr?.on('data', (chunk: Buffer) => {
      log += chunk.toString()
      const port = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//.exec(log)?.[1]
      if (port) done({ app, port: Number(port) })
    })
    app.on('exit', (code) => fail(new Error(`The app quit (${code}). Run pnpm build first.`)))
  })
}

const scratch = mkdtempSync(join(tmpdir(), 'skill-studio-guide-'))
const home = join(scratch, 'home')
const profile = join(scratch, 'profile')
mkdirSync(home)
mkdirSync(profile)
mkdirSync(OUT, { recursive: true })
writeFileSync(
  join(profile, 'window.json'),
  JSON.stringify({ x: 80, y: 80, width: WIDTH, height: Math.round(WIDTH / SHAPE) }),
)

// The library module reads the home folder when it loads, so the seed loads after it is set.
process.env.SKILL_STUDIO_HOME = home
const { sample } = await import('./seed.ts')
const pair = new URLSearchParams(sample.compare).toString()

const SHOTS: Shot[] = [
  { file: 'app.webp', route: '#/overview', whole: true },
  { file: 'write.webp', route: '#/edit' },
  { file: 'cases.webp', route: '#/cases?id=breaking-api' },
  { file: 'new-run.webp', route: '#/generate' },
  { file: 'results.webp', route: '#/overview', press: sample.run },
  { file: 'rate-blind.webp', route: '#/blind' },
  { file: 'compare.webp', route: `#/compare?${pair}` },
  { file: 'agreement.webp', route: '#/insights' },
  { file: 'scoring.webp', route: '#/knobs', width: 1280 },
]

const { app, port } = await launch(home, profile)
try {
  const page = await connect(port)
  await appReady(page)
  await page.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  })
  await take(page, { file: 'library.webp', route: '#/library' })
  await press(page, sample.skill)
  for (const shot of SHOTS) await take(page, shot)
  page.close()
} finally {
  app.removeAllListeners('exit')
  if (app.exitCode === null) {
    app.kill()
    await new Promise((done) => app.once('exit', done))
  }
  rmSync(scratch, { recursive: true, force: true })
}
