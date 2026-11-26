/**
 * The drawing host's start file (`out/main/draw.js`). On macOS it makes the
 * app a background one, with no Dock icon and no menu bar, before anything
 * else loads: loading the host's code takes long enough that the system
 * would show it as an app in front first. On Linux it draws in software.
 *
 * Then, before that code loads, it makes sure a host whose command is gone
 * ends, at any moment of its start: on SIGTERM, SIGINT and SIGHUP, and when
 * its input closes. It reads its input from here on, so no line sent while
 * the host loads is lost, and hands the lines to the host (`host.ts`), which
 * it loads awaited, so the host registers its scheme before `ready`.
 */
import { createInterface } from 'node:readline'
import { app } from 'electron'

app.dock?.hide()
// On Linux the host draws under xvfb-run, with no GPU: a picture taken through one fails there
// (UnknownVizError). Drawn in software from the start, off-screen pages are pictured as on a
// machine with one, but for WebGL, which a page drawn there goes without. macOS and Windows keep
// the GPU, so their pictures are the app's.
if (process.platform === 'linux') app.disableHardwareAcceleration()

/** End now: no reply is wanted by a command that is gone, and no window is shown to close. */
const end = (): void => app.exit(0)
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, end)

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
