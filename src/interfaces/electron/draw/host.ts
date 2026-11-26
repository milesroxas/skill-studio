/**
 * The drawing host, loaded by `index.ts` once the app is in the background:
 * Electron with no window, which `st run`, `st grade` and
 * `st serve` start to draw a sample's page as the desktop app does
 * (`src/interfaces/cli/drawing.ts`). It reads one JSON line for each page on
 * its input and writes one back on its output (`@domain/drawing-host.ts`).
 * `index.ts` reads the input and ends the host when it closes.
 *
 * It draws a page of the command's own too, `st sheet`'s, from its `file:`
 * address, on a session of its own. There, whatever the page says of itself,
 * it runs no script and asks for nothing but an `.html` or `.png` file in a
 * folder a line has named: the host serves only those, each with a policy
 * that allows no script and no request but for pictures, and cancels every
 * request to an address that is not `file:`, a WebSocket's among them.
 *
 * It keeps nothing of its own: a temporary profile folder (`profile.ts`), no
 * single-instance lock and no keychain, and no Dock icon, so it never shows
 * itself and never touches a running copy of the app.
 */
import { readFileSync } from 'node:fs'
import { dirname, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { OperationName, Reply } from '@application/api/contract.ts'
import { createOperations, invoke, type Runners } from '@application/api/operations.ts'
import { type HostReply, type HostRequest, requestOf } from '@domain/drawing-host.ts'
import { isFile, realOf, realPath } from '@infrastructure/fs.ts'
import { app, protocol, session } from 'electron'
import { ARTIFACT_SCHEME } from '../channels.ts'
import { registerSchemes, serveArtifacts } from '../main/protocol.ts'
import { pageDrawer, pageRenderer } from '../main/render.ts'
import { refusePermissions } from '../main/window.ts'

// Before `ready`: each of these is read as the app starts. `index.ts` has set the profile folder.
app.commandLine.appendSwitch('use-mock-keychain')
registerSchemes()

/** The skills a line has named, which are the only ones whose files are served. */
const opened: string[] = []
let operations: Runners = createOperations({ skills: [] })

/**
 * Serve `skill` from now on. A page cannot name one: only a line from the
 * command does. A folder that is no skill throws, and opens nothing.
 */
function open(skill: string): void {
  const real = realPath(skill)
  if (opened.includes(real)) return
  operations = createOperations({ skills: [...opened, real] })
  opened.push(real)
}

async function call(name: OperationName, input: unknown): Promise<Reply<unknown>> {
  try {
    return { ok: true, value: await invoke(operations, name, input) }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

const drawer = pageDrawer()
const render = pageRenderer(drawer)

/**
 * The folders a `file` line has named. A page of the command's own is served
 * only a page or a picture that is in one of them, never in a folder inside.
 */
const folders: string[] = []
/** What a page of the command's own may load, by the file's extension. */
const OWN_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
}
/**
 * The policy every file served to a page of the command's own carries,
 * whatever the page says of itself: no script, and no request but for its
 * pictures. A request to anything but a `file:` address is cancelled on the
 * session too, and `serveOwn` serves no file outside the page's folder.
 */
const OWN_POLICY =
  "default-src 'none'; img-src file:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"
/** The session a page of the command's own is drawn on, apart from the one sample pages are. */
const OWN_PARTITION = 'own-pages'

/** The file a `file:` address names, links resolved; null for any other address, or nothing there. */
function ownFile(address: string): string | null {
  try {
    const url = new URL(address)
    return url.protocol === 'file:' ? realOf(fileURLToPath(url)) : null
  } catch {
    return null
  }
}

/** Serve the folder of a page a `file` line names from now on, and the page's address. */
function openFolder(address: string): string {
  const file = ownFile(address)
  if (!file || !isFile(file))
    throw new Error("A page of the command's own is a file, by its file: address.")
  const folder = dirname(file)
  if (!folders.includes(folder)) folders.push(folder)
  return pathToFileURL(file).href
}

/** A file a page of the command's own asks for: a page or a picture in a folder a line named. */
function serveOwn(request: Request): Response {
  const file = ownFile(request.url)
  const type = file ? OWN_TYPES[extname(file).toLowerCase()] : undefined
  if (!file || !type || !folders.includes(dirname(file)) || !isFile(file))
    return new Response(null, { status: 404 })
  return new Response(readFileSync(file), {
    headers: { 'content-type': type, 'content-security-policy': OWN_POLICY },
  })
}

/** Set once the app is ready, before any line is read. */
let own: Electron.Session | undefined

/** A sample's page, from a skill opened for it, or a page of the command's own on its session. */
function drawn(request: HostRequest) {
  if ('file' in request) return drawer(openFolder(request.file), request, own)
  open(request.page.skill)
  return render(request.page, request)
}

async function answer(request: HostRequest): Promise<HostReply> {
  try {
    const { png, layout } = await drawn(request)
    return { id: request.id, png: Buffer.from(png).toString('base64'), layout }
  } catch (error) {
    return { id: request.id, error: (error as Error).message }
  }
}

const reply = (line: HostReply): void => {
  process.stdout.write(`${JSON.stringify(line)}\n`)
}

// Each page is drawn in a window that is closed after: that is no reason to quit.
app.on('window-all-closed', () => {})

/**
 * Answer each line of the host's input once the app is ready. `index.ts`
 * reads the input from the start and ends the host when it closes; `lines`
 * hands each line on from then, those read while the host loaded first.
 */
export function answerLines(lines: (answer: (line: string) => void) => void): void {
  // Not awaited: the app is ready only once `index.ts` has run.
  void app.whenReady().then(() => {
    // A page is refused what the app refuses it: every permission it asks for.
    refusePermissions(session.defaultSession)
    protocol.handle(ARTIFACT_SCHEME, serveArtifacts({ call }))
    // A page of the command's own is refused the same. It runs no script (`OWN_POLICY`), and asks
    // for nothing but a file in its own folder: every other request, a WebSocket's too, is cancelled.
    own = session.fromPartition(OWN_PARTITION)
    refusePermissions(own)
    own.protocol.handle('file', serveOwn)
    own.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !details.url.startsWith('file:') }),
    )
    lines((line) => {
      const request = requestOf(line)
      if (request) void answer(request).then(reply)
    })
  })
}
