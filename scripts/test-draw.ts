/**
 * `pnpm test:draw`: the drawing host, started as `st run`, `st grade` and
 * `st serve` start it (`src/interfaces/cli/drawing.ts`). After `pnpm build`,
 * one host draws the stored page of a scratch copy of `fixtures/design-skill`
 * at each size a grading draws a page, and the test fails unless each picture
 * is the size asked and each layout holds an element. Then it draws a page of
 * its own that asks for notifications and where the machine is, and fails
 * unless the host refused both, as the app does: the page writes what it was
 * answered into its own text, which comes back in the layout the host
 * measured. It needs the Electron
 * binary and, on Linux, a display: CI runs it under `xvfb-run`. `pnpm check`
 * never runs it, since it starts Electron.
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { RENDER_SIZES } from '@domain/artifact-address.ts'
import { drawingHost } from '../src/interfaces/cli/drawing.ts'

const FIXTURE = resolve(import.meta.dirname, '../fixtures/design-skill')

const scratch = mkdtempSync(join(tmpdir(), 'st-draw-'))
const skill = join(scratch, 'design-skill')
cpSync(FIXTURE, skill, { recursive: true, verbatimSymlinks: true })
// The host is handed the command's environment: nothing it opens touches the real studio folder.
process.env.SKILL_STUDIO_HOME = join(scratch, 'home')
mkdirSync(process.env.SKILL_STUDIO_HOME)

const [run] = readdirSync(join(skill, 'evals/runs'))
const page = { skill, run, sample: 'landing-s1', file: 'outputs/index.html' }

/** A page that asks for two permissions and writes down what it was answered. */
const ASKS = `<!doctype html><html><body>
<p id="notifications">notifications: not answered</p>
<p id="geolocation">geolocation: not answered</p>
<script>
const say = (id, text) => { document.getElementById(id).textContent = id + ': ' + text }
Notification.requestPermission().then((answer) => say('notifications', answer))
navigator.geolocation.getCurrentPosition(
  () => say('geolocation', 'granted'),
  (error) => say('geolocation', error.code === error.PERMISSION_DENIED ? 'denied' : 'error ' + error.code),
)
</script></body></html>`
const asking = { ...page, file: 'outputs/asks.html' }
writeFileSync(join(skill, 'evals/runs', run, asking.sample, asking.file), ASKS)

/** The width and height a PNG says it holds. */
const sizeOf = (png: Uint8Array): [number, number] => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return [view.getUint32(16), view.getUint32(20)]
}

const ending = new AbortController()
const problems: string[] = []
try {
  const render = drawingHost({ warn: (line) => problems.push(line), signal: ending.signal })
  for (const size of RENDER_SIZES) {
    const started = performance.now()
    const { png, layout } = await render(page, size)
    const seconds = ((performance.now() - started) / 1000).toFixed(2)
    const [width, height] = sizeOf(png)
    const elements = layout?.elements.length ?? 0
    console.log(
      `${size.id}: ${width}x${height} PNG, ${png.length} bytes, ${elements} elements, ${seconds}s`,
    )
    if (width !== size.width || height !== size.height)
      problems.push(`${size.id}: drawn ${width}x${height}, asked ${size.width}x${size.height}.`)
    if (!elements) problems.push(`${size.id}: the layout holds no element.`)
  }
  // Without the app's refusal, Electron grants notifications and asks the system where it is.
  const { layout } = await render(asking, { width: 800, height: 600 })
  const answered = (layout?.elements ?? []).map((e) => e.text).filter(Boolean)
  console.log(`permissions: ${answered.join(', ')}`)
  for (const wanted of ['notifications: denied', 'geolocation: denied'])
    if (!answered.includes(wanted)) problems.push(`The page was not refused: no "${wanted}".`)
} catch (error) {
  problems.push((error as Error).message)
} finally {
  ending.abort()
  rmSync(scratch, { recursive: true, force: true })
}
for (const problem of problems) console.error(problem)
process.exitCode = problems.length ? 1 : 0
