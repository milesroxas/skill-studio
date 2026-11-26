/**
 * The drawing host's start file (`out/main/draw.js`). On macOS it makes the
 * app a background one, with no Dock icon and no menu bar, before anything
 * else loads: loading the host's code takes long enough that the system
 * would show it as an app in front first. On Linux it draws in software.
 *
 * Then, before that code loads, it makes its profile folder (`profile.ts`)
 * and makes sure a host whose command is gone ends, at any moment of its
 * start, and removes that folder as it does: on SIGTERM, SIGINT and SIGHUP,
 * and when its input closes. It reads its input from here on, so no line sent while
 * the host loads is lost, and hands the lines to the host (`host.ts`), which
 * it loads awaited, so the host registers its scheme before `ready`.
 */
import { createInterface } from 'node:readline'
import { app } from 'electron'
import { exitNowOf } from './exit.ts'
import { makeProfile } from './profile.ts'

app.dock?.hide()
// On Linux the host draws under xvfb-run, with no GPU: a picture taken through one fails there
// (UnknownVizError). Drawn in software from the start, off-screen pages are pictured as on a
// machine with one, but for WebGL, which a page drawn there goes without: with no GPU, Chromium
// gives WebGL only through SwiftShader, and only with --enable-unsafe-swiftshader. That switch is
// not taken: Chromium's SwiftShader document says it "is not intended for running untrusted
// content", since SwiftShader runs JIT-ed code in the GPU process, and a page a model wrote is
// such content. macOS and Windows keep the GPU, so their pictures are the app's.
if (process.platform === 'linux') app.disableHardwareAcceleration()

// Made here, before the host's code loads, so the host knows the folder to remove however it ends.
const removeProfile = makeProfile()

/** Node's own exit, which Electron leaves as it is: the process ends at once, with no shutdown (`exitNowOf`). */
const exitNow = exitNowOf(process)

/**
 * End now: no reply is wanted by a command that is gone, and no window is
 * shown to close. The profile folder goes first, and the process ends with no
 * shutdown after it: Electron's `app.exit` and `process.exit` both shut the
 * browser down, which writes its settings back into a new folder of the same
 * name after the last line here has run.
 */
const end = (): never => {
  removeProfile()
  return exitNow(0)
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, end)
// Once the app is ready, Electron takes those signals itself and quits the app: it ends here first.
app.on('before-quit', end)

const input = createInterface({ input: process.stdin })
const early: string[] = []
let take = (line: string): void => void early.push(line)
input.on('line', (line) => take(line))
input.on('close', end)

const { answerLines } = await import('./host.ts')
answerLines((answer) => {
  take = answer
  for (const line of early.splice(0)) answer(line)
})
