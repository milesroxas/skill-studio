/**
 * `pnpm test:draw`: the drawing host, started as `st run`, `st grade` and
 * `st serve` start it (`src/interfaces/cli/drawing.ts`). After `pnpm build`,
 * one host draws the stored page of a scratch copy of `fixtures/design-skill`
 * at each size a grading draws a page, and the test fails unless each picture
 * is the size asked and each layout holds an element. Then it draws a page of
 * its own that asks for notifications and where the machine is, and fails
 * unless the host refused both, as the app does: the page writes what it was
 * answered into its own text, which comes back in the layout the host
 * measured. It draws a page that clears a WebGL canvas to green and says
 * whether it got a context and how much of the canvas is green, failing on no
 * platform: on Linux a page goes without WebGL, and elsewhere it is the
 * machine's GPU's. Last it puts that picture on a contact sheet as `st sheet` does,
 * for two runs of three attempts and two, and fails unless the sheet is one
 * PNG inside 1568 pixels a side with a drawn panel for each attempt; and draws
 * a page of its own that asks for a picture beside it and one in the folder
 * above, and fails unless the host served the first and refused the second;
 * and one with no policy of its own that tries a script and requests to a
 * local server the test starts, a picture written into it as a `data:`
 * address, a `blob:` one, an `<object>` and an `<embed>`, a stylesheet beside
 * it and a refresh to the server, and fails unless no script ran, the server
 * saw no request, none of those was shown and the page stayed; then draws a
 * page in one folder and, after it, one in another folder that reaches for the
 * first's page and picture by a refresh, a frame and a picture, and fails
 * unless none of them shows and the picture taken is of the second page. Last it starts the host and, at once or a moment into its
 * start, closes its input or sends it a signal, and fails unless the host has
 * gone within 5 seconds; and starts it to draw a page, then closes its input
 * or sends it SIGTERM, and fails unless its profile folder is gone within 3
 * seconds of it and stays gone a second more.
 * It needs the Electron
 * binary and, on Linux, a display: CI runs it under `xvfb-run`. `pnpm check`
 * never runs it, since it starts Electron.
 */
import { spawn } from 'node:child_process'
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
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { RENDER_SIZES } from '@domain/artifact-address.ts'
import { type Box, SHEET_BACKGROUND, SHEET_SIDE_MAX, sheetLayout } from '@domain/contact-sheet.ts'
import { profilePid } from '@domain/drawing-host.ts'
import { pngOf } from '@infrastructure/__fixtures__/png.ts'
import { readPng } from '@infrastructure/png.ts'
import { drawingHost, hostStart } from '../src/interfaces/cli/drawing.ts'

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

/** Where the WebGL page's canvas is: it is cleared to green there when the page has a context. */
const GL_BOX: Box = { x: 0, y: 0, width: 100, height: 100 }

/** A page that asks for a WebGL context, clears its canvas to green with it, and says what it got. */
const WEBGL = `<!doctype html><html><body style="margin:0;background:#fff">
<canvas id="c" width="${GL_BOX.width}" height="${GL_BOX.height}" style="position:absolute;left:0;top:0"></canvas>
<p id="said" style="position:absolute;top:120px">webgl: not run</p>
<script>
const gl = document.getElementById('c').getContext('webgl')
if (gl) { gl.clearColor(0, 1, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT) }
document.getElementById('said').textContent = 'webgl: ' + (gl ? 'yes, ' + gl.getParameter(gl.VERSION) : 'no')
</script></body></html>`
const webgl = { ...page, file: 'outputs/webgl.html' }
writeFileSync(join(skill, 'evals/runs', run, webgl.sample, webgl.file), WEBGL)

/** The share of a box's pixels that are green, as the WebGL page clears its canvas. */
function greenShare(png: Uint8Array, box: Box): number {
  const pixels = readPng(png)
  if (!pixels) return 0
  let green = 0
  for (let y = box.y; y < box.y + box.height; y++)
    for (let x = box.x; x < box.x + box.width; x++) {
      const at = (y * pixels.width + x) * 4
      const [r, g, b] = [pixels.data[at], pixels.data[at + 1], pixels.data[at + 2]]
      if (r < 40 && g > 215 && b < 40) green++
    }
  return green / (box.width * box.height)
}

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
/** The check under way, named with what stops it: an error that ends the test says which it was. */
let check = ''
try {
  const render = drawingHost({ warn: (line) => problems.push(line), signal: ending.signal })
  for (const size of RENDER_SIZES) {
    check = `Drawing the stored page at ${size.id}, ${size.width}x${size.height}`
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
  // What a page that draws with WebGL gets, said and never failed on: on Linux the host draws with
  // no GPU and no SwiftShader, so a page goes without, and elsewhere it is the machine's GPU's.
  check = 'Drawing a page that clears a WebGL canvas to green'
  const gl = await render(webgl, { width: 400, height: 300 })
  const glSaid = (gl.layout?.elements ?? []).map((e) => e.text).find((t) => t?.startsWith('webgl:'))
  const green = greenShare(gl.png, GL_BOX)
  console.log(`webgl: ${glSaid ?? 'nothing said'}, canvas ${Math.round(green * 100)}% green`)

  // Without the app's refusal, Electron grants notifications and asks the system where it is.
  check = 'Drawing the page that asks for notifications and where the machine is'
  const { layout } = await render(asking, { width: 800, height: 600 })
  const answered = (layout?.elements ?? []).map((e) => e.text).filter(Boolean)
  console.log(`permissions: ${answered.join(', ')}`)
  for (const wanted of ['notifications: denied', 'geolocation: denied'])
    if (!answered.includes(wanted)) problems.push(`The page was not refused: no "${wanted}".`)

  check = 'Putting the desktop picture on a contact sheet'
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
  check = 'Drawing a page of its own with a picture beside it and one in the folder above'
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

  // Whatever a page of the command's own says of itself, it runs no script and reaches nothing. It
  // shows the `.html` and `.png` files of its own folder and nothing else: not a picture written into
  // the page as a `data:` address (`OWN_POLICY` allows pictures from `file:` alone), not a `blob:`
  // one, not an `<object>` or `<embed>`, not a stylesheet beside it (no `.css` is served, and the
  // policy allows only styles in the page), and a refresh to another address goes nowhere.
  check = 'Drawing a page of its own that tries a script and requests to a local server'
  let reached = 0
  const server = createServer((_request, response) => response.end())
  server.on('connection', () => reached++)
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening))
  const local = `127.0.0.1:${(server.address() as AddressInfo).port}`
  const written = { x: 20, y: 60, width: 100, height: 80 }
  const objected = { x: 140, y: 60, width: 100, height: 80 }
  const embedded = { x: 260, y: 60, width: 100, height: 80 }
  const bare = { x: 300, y: 200, width: 80, height: 80 }
  writeFileSync(join(folder, 'tries.css'), 'body { background: rgb(255 0 0) !important }')
  writeFileSync(
    join(folder, 'tries.html'),
    `<!doctype html><html><body style="margin:0;background:rgb(${SHEET_BACKGROUND.join(' ')})">
<p id="said" style="position:absolute;left:20px;top:0;margin:0">script: did not run</p>
<img alt="" src="http://${local}/picture.png" width="10" height="10" style="position:absolute;left:20px;top:200px">
<link rel="stylesheet" href="http://${local}/style.css">
<link rel="stylesheet" href="tries.css">
<iframe src="http://${local}/frame" style="position:absolute;left:40px;top:200px;width:40px;height:40px"></iframe>
<object data="http://${local}/object" style="position:absolute;left:100px;top:200px;width:20px;height:20px"></object>
<embed src="http://${local}/embed" style="position:absolute;left:140px;top:200px;width:20px;height:20px">
<img alt="" src="data:image/png;base64,${Buffer.from(desktop).toString('base64')}" style="${at(written)}">
<object data="beside.png" type="image/png" style="${at(objected)}"></object>
<embed src="beside.png" type="image/png" style="${at(embedded)}">
<img alt="" src="blob:file:///0b8a2d64-1f5a-4c1e-9d3e-7a4f2b6c8e10" width="10" height="10" style="position:absolute;left:180px;top:200px">
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
  // A page that sends itself on to the local server as soon as it is shown.
  writeFileSync(
    join(folder, 'refresh.html'),
    `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=http://${local}/refresh"></head>
<body><p>refresh: stayed</p></body></html>`,
  )
  const refreshed = await render.file(
    pathToFileURL(realpathSync(join(folder, 'refresh.html'))).href,
    { width: 400, height: 300 },
  )
  // Time for anything the pages set going to arrive.
  await new Promise((wait) => setTimeout(wait, 500))
  server.close()
  const ran = (tried.layout?.elements ?? []).some((e) => e.text === 'script: ran')
  const shown = Object.entries({ data: written, object: objected, embed: embedded, css: bare })
    .filter(([, box]) => drawnShare(tried.png, box) > 0.1)
    .map(([what]) => what)
  const stayed = (refreshed.layout?.elements ?? []).some((e) => e.text === 'refresh: stayed')
  console.log(
    `page with no policy: script ${ran ? 'ran' : 'did not run'}, ${reached} requests, ${shown.length ? `showed ${shown.join(', ')}` : 'showed nothing it was refused'}, refresh ${stayed ? 'stayed' : 'went'}`,
  )
  if (ran) problems.push("A page of the command's own ran a script.")
  if (reached) problems.push(`A page of the command's own reached a local server ${reached} times.`)
  for (const what of shown)
    problems.push(
      `A page of the command's own showed ${
        {
          data: 'a picture written into it as a data: address',
          object: 'a picture beside it through an <object>',
          embed: 'a picture beside it through an <embed>',
          css: 'a stylesheet beside it',
        }[what]
      }.`,
    )
  if (!stayed) problems.push("A page of the command's own was sent on by a refresh.")

  // What a page of the command's own may load is held to its own drawing: a page drawn later, in
  // another folder, reaches nothing of the folder an earlier line named, by a refresh, a frame or a
  // picture, and the picture taken is of the page its line named.
  check = 'Drawing a page of its own in one folder, then one in another that reaches for the first'
  const first = join(scratch, 'own/first')
  const second = join(scratch, 'own/second')
  mkdirSync(first, { recursive: true })
  mkdirSync(second, { recursive: true })
  const GREEN: [number, number, number, number] = [0, 255, 0, 255]
  writeFileSync(
    join(first, 'green.png'),
    pngOf(160, 120, () => GREEN),
  )
  const firstPicture = { x: 20, y: 40, width: 160, height: 120 }
  writeFileSync(
    join(first, 'green.html'),
    `<!doctype html><html><body style="margin:0;background:rgb(${SHEET_BACKGROUND.join(' ')})">
<p style="position:absolute;left:20px;top:0;margin:0">page A</p>
<img alt="" src="green.png" style="${at(firstPicture)}"></body></html>`,
  )
  const pageA = await render.file(pathToFileURL(realpathSync(join(first, 'green.html'))).href, {
    width: 400,
    height: 300,
  })
  const aShown = greenShare(pageA.png, firstPicture)
  const href = (file: string) => pathToFileURL(realpathSync(file)).href
  const framed = { x: 20, y: 40, width: 160, height: 120 }
  const pictured = { x: 220, y: 40, width: 160, height: 120 }
  writeFileSync(
    join(second, 'reaches.html'),
    `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=${href(join(first, 'green.html'))}"></head>
<body style="margin:0;background:rgb(${SHEET_BACKGROUND.join(' ')})">
<p style="position:absolute;left:20px;top:0;margin:0">page B</p>
<iframe src="${href(join(first, 'green.html'))}" style="${at(framed)};border:0"></iframe>
<img alt="" src="${href(join(first, 'green.png'))}" style="${at(pictured)}"></body></html>`,
  )
  const pageB = await render.file(href(join(second, 'reaches.html')), { width: 400, height: 300 })
  const said = (pageB.layout?.elements ?? []).map((e) => e.text)
  const [frameGreen, pictureGreen] = [framed, pictured].map((box) => greenShare(pageB.png, box))
  console.log(
    `two folders: page A's picture ${Math.round(aShown * 100)}% shown; page B ${said.includes('page B') ? 'drawn' : 'not drawn'}, its frame ${Math.round(frameGreen * 100)}% page A, its picture of folder A ${Math.round(pictureGreen * 100)}% shown`,
  )
  if (aShown < 0.9) problems.push("Page A's own picture was not shown, so nothing below is proven.")
  if (!said.includes('page B') || said.includes('page A'))
    problems.push('The picture taken of page B is not of page B: a refresh sent it on.')
  if (frameGreen > 0.1) problems.push('A frame of page B showed page A, from another folder.')
  if (pictureGreen > 0.1) problems.push("Page B showed a picture from page A's folder.")

  // A host whose command is gone ends, at any moment of its start: its input closed, or a signal.
  check = 'Starting hosts to end them'
  const start = hostStart()
  if ('reason' in start) throw new Error(start.reason)
  for (const [how, after] of [
    ['input closed', 0],
    ['SIGTERM', 0],
    ['SIGINT', 150],
    ['SIGTERM', 300],
  ] as const) {
    const host = spawn(start.command, [...start.args], { stdio: 'pipe' })
    const gone = new Promise<number>((ended) => {
      const began = performance.now()
      host.on('exit', () => ended(performance.now() - began))
    })
    setTimeout(() => (how === 'input closed' ? host.stdin.end() : host.kill(how)), after)
    const ms = await Promise.race([gone, new Promise<null>((late) => setTimeout(late, 5000, null))])
    console.log(
      `host ended, ${how} after ${after} ms: ${ms === null ? 'not in 5 s' : `in ${Math.round(ms)} ms`}`,
    )
    if (ms === null) {
      problems.push(`A host was still running 5 s after ${how} at ${after} ms.`)
      host.kill('SIGKILL')
    }
  }

  // A host that has drawn a page and then ends leaves no profile folder, by its input closing or a signal.
  check = 'Ending hosts that have drawn a page'
  const profiles = (pid: number) => readdirSync(tmpdir()).filter((name) => profilePid(name) === pid)
  const drawnPage = pathToFileURL(realpathSync(join(folder, 'page.html'))).href
  for (const how of ['input closed', 'SIGTERM'] as const) {
    const host = spawn(start.command, [...start.args], { stdio: 'pipe' })
    const pid = host.pid as number
    const gone = new Promise<void>((ended) => host.on('exit', () => ended()))
    const replied = new Promise<void>((answered) =>
      createInterface({ input: host.stdout }).once('line', () => answered()),
    )
    host.stdin.write(`${JSON.stringify({ id: '1', file: drawnPage, width: 200, height: 100 })}\n`)
    await Promise.race([replied, new Promise((late) => setTimeout(late, 20_000))])
    const held = profiles(pid).length
    how === 'input closed' ? host.stdin.end() : host.kill(how)
    await Promise.race([gone, new Promise((late) => setTimeout(late, 5000))])
    // The browser's own processes end a moment after the host, and its folder goes once they have:
    // 3 seconds at most, then a second more for anything that would make it again.
    const ended = performance.now()
    while (profiles(pid).length && performance.now() - ended < 3000)
      await new Promise((wait) => setTimeout(wait, 50))
    const ms = Math.round(performance.now() - ended)
    await new Promise((wait) => setTimeout(wait, 1000))
    const left = profiles(pid)
    console.log(
      `profile, ${how} after a page: ${held} while drawing, ${left.length} left after, gone in ${ms} ms`,
    )
    if (!held) problems.push(`No profile folder of host ${pid} was found while it drew.`)
    if (left.length)
      problems.push(`A host ended by ${how} left its profile folder: ${left.join(', ')}.`)
  }
} catch (error) {
  // Electron rejects a picture it could not take with only the name of what failed, so the check says where.
  const said = error instanceof Error ? error.message || error.name : String(error)
  problems.push(`${check}: ${said}`)
} finally {
  ending.abort()
  rmSync(scratch, { recursive: true, force: true })
}
for (const problem of problems) console.error(problem)
process.exitCode = problems.length ? 1 : 0
