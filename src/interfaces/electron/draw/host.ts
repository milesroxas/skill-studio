/**
 * The drawing host, loaded by `index.ts` once the app is in the background:
 * Electron with no window, which `st run`, `st grade` and
 * `st serve` start to draw a sample's page as the desktop app does
 * (`src/interfaces/cli/drawing.ts`). It reads one JSON line for each page on
 * its input and writes one back on its output (`@domain/drawing-host.ts`),
 * and stops when its input closes.
 *
 * It keeps nothing of its own: a temporary profile folder, removed as it
 * quits, no single-instance lock and no keychain, and no Dock icon, so it
 * never shows itself and never touches a running copy of the app.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { OperationName, Reply } from '@application/api/contract.ts'
import { createOperations, invoke, type Runners } from '@application/api/operations.ts'
import { type HostReply, type HostRequest, requestOf } from '@domain/drawing-host.ts'
import { realPath } from '@infrastructure/fs.ts'
import { app, protocol, session } from 'electron'
import { ARTIFACT_SCHEME } from '../channels.ts'
import { registerSchemes, serveArtifacts } from '../main/protocol.ts'
import { pageRenderer } from '../main/render.ts'
import { refusePermissions } from '../main/window.ts'

/** A host's profile folder in the system's temp folder: this, its process id, a dash. */
const PROFILE_PREFIX = 'skill-studio-draw-'

/** Whether a process is still running. One of another user's still is. */
function running(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Remove the profile folders hosts that have gone left behind. A host removes
 * its own as it quits, but the browser writes a few small files back as it
 * shuts down, after the host's last line has run; so each host that starts
 * removes those of hosts whose process is gone.
 */
function sweepProfiles(): void {
  try {
    for (const name of readdirSync(tmpdir())) {
      const pid = Number(new RegExp(`^${PROFILE_PREFIX}(\\d+)-`).exec(name)?.[1])
      if (pid && pid !== process.pid && !running(pid))
        rmSync(join(tmpdir(), name), { recursive: true, force: true })
    }
  } catch {
    // A folder that cannot be read or removed is left for the system to clear.
  }
}

// Before `ready`: each of these is read as the app starts.
app.commandLine.appendSwitch('use-mock-keychain')
const profile = mkdtempSync(join(tmpdir(), `${PROFILE_PREFIX}${process.pid}-`))
sweepProfiles()
app.setPath('userData', profile)
app.setPath('sessionData', profile)
app.setPath('crashDumps', join(profile, 'crashes'))
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

const render = pageRenderer()

async function answer(request: HostRequest): Promise<HostReply> {
  try {
    if (!('page' in request)) throw new Error('This host draws only a page a sample wrote.')
    open(request.page.skill)
    const { png, layout } = await render(request.page, request)
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
process.on('exit', () => {
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    // A file the browser still holds open stays behind in the system's temp folder.
  }
})

// Not awaited at the top: the app is ready only once this file has run.
void app.whenReady().then(() => {
  // A page is refused what the app refuses it: every permission it asks for.
  refusePermissions(session.defaultSession)
  protocol.handle(ARTIFACT_SCHEME, serveArtifacts({ call }))
  const input = createInterface({ input: process.stdin })
  input.on('line', (line) => {
    const request = requestOf(line)
    if (request) void answer(request).then(reply)
  })
  input.on('close', () => app.quit())
})
