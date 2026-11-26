/**
 * `pnpm test:draw`: the drawing host, started as `st run`, `st grade` and
 * `st serve` start it (`src/interfaces/cli/drawing.ts`). After `pnpm build`,
 * one host draws the stored page of a scratch copy of `fixtures/design-skill`
 * at each size a grading draws a page, and the test fails unless each picture
 * is the size asked and each layout holds an element. Then it draws a page of
 * its own that asks for notifications and where the machine is, and fails
 * unless the host refused both, as the app does: the page writes what it was
 * answered into its own text, which comes back in the layout the host
 * measured. Last it puts that picture on a contact sheet as `st sheet` does,
 * for two runs of three attempts and two, and fails unless the sheet is one
 * PNG inside 1568 pixels a side with a drawn panel for each attempt; and draws
 * a page of its own that asks for a picture beside it and one in the folder
 * above, and fails unless the host served the first and refused the second;
 * and one with no policy of its own that tries a script and requests to a
 * local server the test starts, and fails unless no script ran and the server
 * saw no request.
 * It needs the Electron
 * binary and, on Linux, a display: CI runs it under `xvfb-run`. `pnpm check`
 * never runs it, since it starts Electron.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { RENDER_SIZES } from '@domain/artifact-address.ts'
import { type Box, SHEET_BACKGROUND, SHEET_SIDE_MAX, sheetLayout } from '@domain/contact-sheet.ts'
import { readPng } from '@infrastructure/png.ts'
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

/** The share of a box's pixels that are not the sheet's background: a picture that did not load shows it. */
function drawnShare(png: Uint8Array, box: Box): number {
  const pixels = readPng(png)
  if (!pixels) return 0
  let drawn = 0
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++) {
      const at = (y * pixels.width + x) * 4
      if (SHEET_BACKGROUND.some((c, i) => Math.abs(pixels.data[at + i] - c) > 8)) drawn++
    }
  return drawn / (box.width * box.height)
}

/** Copy the run `from` as `to`, with only the attempts in `attempts`, each holding `picture` as drawn. */
function runOf(from: string, to: string, attempts: number, picture: Uint8Array): void {
  const runs = join(skill, 'evals/runs')
  if (from !== to) cpSync(join(runs, from), join(runs, to), { recursive: true })
  const meta = JSON.parse(readFileSync(join(runs, to, 'run.json'), 'utf8'))
  const [first] = meta.samples
  writeFileSync(join(runs, to, first.dir, 'renders/desktop-1280x960.png'), picture)
  meta.samples = Array.from({ length: attempts }, (_, i) => {
    const dir = `landing-s${i + 1}`
    if (i) cpSync(join(runs, to, first.dir), join(runs, to, dir), { recursive: true })
    return { ...first, dir, index: i + 1 }
  })
  writeFileSync(
    join(runs, to, 'run.json'),
    JSON.stringify({ ...meta, name: to, samplesPerCase: attempts }),
  )
}

const ending = new AbortController()
const problems: string[] = []
let desktop: Uint8Array | null = null
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
    if (size.id === 'desktop') desktop = png
  }
  // Without the app's refusal, Electron grants notifications and asks the system where it is.
  const { layout } = await render(asking, { width: 800, height: 600 })
  const answered = (layout?.elements ?? []).map((e) => e.text).filter(Boolean)
  console.log(`permissions: ${answered.join(', ')}`)
  for (const wanted of ['notifications: denied', 'geolocation: denied'])
    if (!answered.includes(wanted)) problems.push(`The page was not refused: no "${wanted}".`)

  if (!desktop) throw new Error('No desktop picture was drawn to put on a sheet.')
  // Loaded once the studio folder is set: the library reads it as it loads.
  const { sheet } = await import('../src/interfaces/cli/commands/sheet.ts')
  const { contextOf } = await import('../src/interfaces/cli/commands/shared.ts')
  mkdirSync(join(skill, 'evals/runs', run, page.sample, 'renders'), { recursive: true })
  const other = `${run}-again`
  runOf(run, other, 2, desktop)
  runOf(run, run, 3, desktop)
  const out = join(scratch, 'sheets')
  const started = performance.now()
  const code = await sheet.run(contextOf([skill], { run: [run, other], out }, null))
  const seconds = ((performance.now() - started) / 1000).toFixed(2)
  const sheets = readdirSync(out)
  if (code !== 0 || sheets.join() !== 'landing.png')
    problems.push(
      `st sheet exited ${code} with ${sheets.join(', ') || 'no sheet'}, not landing.png.`,
    )
  else {
    const png = new Uint8Array(readFileSync(join(out, 'landing.png')))
    const [width, height] = sizeOf(png)
    const picture = { width: 1280, height: 960 }
    const layout = sheetLayout([
      { run, pictures: [1, 2, 3].map((attempt) => ({ attempt, ...picture })) },
      { run: other, pictures: [1, 2].map((attempt) => ({ attempt, ...picture })) },
    ])
    const panels = layout?.rows.flatMap((r) => r.panels.map((p) => p.picture)) ?? []
    const shown = panels.filter((box) => drawnShare(png, box) > 0.5).length
    console.log(
      `sheet: ${width}x${height} PNG, ${png.length} bytes, ${shown} of 5 panels drawn, ${seconds}s`,
    )
    if (width > SHEET_SIDE_MAX || height > SHEET_SIDE_MAX)
      problems.push(`The sheet is ${width}x${height}, past ${SHEET_SIDE_MAX} a side.`)
    if (width !== layout?.width || height !== layout?.height)
      problems.push(`The sheet is ${width}x${height}, laid out ${layout?.width}x${layout?.height}.`)
    if (panels.length !== 5 || shown !== 5)
      problems.push(
        `The sheet shows ${shown} of ${panels.length} panels, not one for each of 5 attempts.`,
      )
  }

  // A page of the command's own is served the pictures beside it, and nothing from the folder above.
  const folder = join(scratch, 'own/inside')
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'beside.png'), desktop)
  writeFileSync(join(scratch, 'own/above.png'), desktop)
  const beside = { x: 20, y: 20, width: 320, height: 240 }
  const above = { x: 360, y: 20, width: 320, height: 240 }
  const at = (box: Box) =>
    `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px`
  writeFileSync(
    join(folder, 'page.html'),
    `<!doctype html><html><body style="margin:0;background:rgb(${SHEET_BACKGROUND.join(' ')})">
<img alt="" src="beside.png" style="${at(beside)}"><img alt="" src="../above.png" style="${at(above)}">
</body></html>`,
  )
  const own = await render.file(pathToFileURL(realpathSync(join(folder, 'page.html'))).href, {
    width: 700,
    height: 280,
  })
  const [besideShare, aboveShare] = [beside, above].map((box) => drawnShare(own.png, box))
  console.log(
    `own page: beside ${Math.round(besideShare * 100)}% drawn, above ${Math.round(aboveShare * 100)}% drawn`,
  )
  if (besideShare < 0.5) problems.push('The picture beside its own page was not served.')
  if (aboveShare > 0.1) problems.push("A picture outside its own page's folder was served.")

  // Whatever a page of the command's own says of itself, it runs no script and reaches nothing.
  let reached = 0
  const server = createServer((_request, response) => response.end())
  server.on('connection', () => reached++)
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
  const local = `127.0.0.1:${(server.address() as AddressInfo).port}`
  writeFileSync(
    join(folder, 'tries.html'),
    `<!doctype html><html><body>
<p id="said">script: did not run</p>
<img alt="" src="http://${local}/picture.png" width="10" height="10">
<link rel="stylesheet" href="http://${local}/style.css">
<iframe src="http://${local}/frame"></iframe>
<script>
document.getElementById('said').textContent = 'script: ran'
new WebSocket('ws://${local}/')
fetch('http://${local}/fetch').catch(() => {})
</script></body></html>`,
  )
  const tried = await render.file(pathToFileURL(realpathSync(join(folder, 'tries.html'))).href, {
    width: 400,
    height: 300,
  })
  // Time for anything the page set going to arrive.
  await new Promise((wait) => setTimeout(wait, 500))
  server.close()
  const ran = (tried.layout?.elements ?? []).some((e) => e.text === 'script: ran')
  console.log(`page with no policy: script ${ran ? 'ran' : 'did not run'}, ${reached} requests`)
  if (ran) problems.push("A page of the command's own ran a script.")
  if (reached) problems.push(`A page of the command's own reached a local server ${reached} times.`)
} catch (error) {
  problems.push((error as Error).message)
} finally {
  ending.abort()
  rmSync(scratch, { recursive: true, force: true })
}
for (const problem of problems) console.error(problem)
process.exitCode = problems.length ? 1 : 0
