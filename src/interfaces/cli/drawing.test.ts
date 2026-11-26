/**
 * The command's side of drawing, against a stand-in for the drawing host: a
 * plain Node script that speaks its lines. No test here starts Electron.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type ArtifactAddress, RendererGone } from '@domain/artifact-address.ts'
import type { ReportResult } from '@domain/schemas.ts'
import { pngOf } from '@infrastructure/__fixtures__/png.ts'
import { Jev } from '@judges/jev.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The stand-in. It notes each start, each request and each end in
 * `STAND_IN_LOG`. It holds the requests until `STAND_IN_BATCH` have come,
 * then answers them last first, each with the PNG in `STAND_IN_PNG` and a
 * layout of one element the size asked. `STAND_IN_FAIL` makes it say why on
 * stderr and exit as it starts; `STAND_IN_DIE_AFTER` makes it do the same once
 * it has answered that many pages. A file named `broken.html` is answered with
 * an error. A page of the command's own is noted by its address.
 * `STAND_IN_DEAF` makes it go on when its input closes, as a host still
 * starting may, so only a signal ends it. It writes its pid beside the log,
 * so a test can tell it is gone where it hears no signal: on Windows a kill
 * ends a process at once. `STAND_IN_PROFILE` makes it leave a profile folder
 * in the system's temp folder as a host killed outright does, named for its
 * pid, beside two of the same start that are not its own.
 */
const STAND_IN = `
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
const log = (line) => appendFileSync(process.env.STAND_IN_LOG, line + '\\n')
writeFileSync(process.env.STAND_IN_LOG + '.pid', String(process.pid))
if (process.env.STAND_IN_PROFILE)
  for (const name of [process.pid + '-left', process.pid + '9-other', process.ppid + '-other']) {
    mkdirSync(join(tmpdir(), 'skill-studio-draw-' + name, 'Cache'), { recursive: true })
    writeFileSync(join(tmpdir(), 'skill-studio-draw-' + name, 'Local State'), '{}')
  }
const die = () => {
  process.stderr.write('warming up\\n' + process.env.STAND_IN_FAIL + '\\n')
  log('end')
  process.exit(3)
}
log('start')
if (process.env.STAND_IN_FAIL && !process.env.STAND_IN_DIE_AFTER) die()
// Sent as the command exits: noted, then gone, as a host is.
process.on('SIGTERM', () => {
  if (process.env.STAND_IN_DEAF) log('killed')
  log('end')
  process.exit(0)
})
if (process.env.STAND_IN_DEAF) setInterval(() => {}, 1000)
const held = []
let answered = 0
const answer = (request) => {
  if (request.page?.file === 'broken.html') return { id: request.id, error: 'The page stopped (crashed).' }
  const element = { name: 'body', x: 0, y: 0, width: request.width, height: request.height }
  const layout = { window: [request.width, request.height], page: [request.width, request.height], elements: [element] }
  return { id: request.id, png: process.env.STAND_IN_PNG, layout }
}
const input = createInterface({ input: process.stdin })
input.on('line', (line) => {
  let request
  try { request = JSON.parse(line) } catch { return }
  log('asked ' + request.id + ' ' + request.width + 'x' + request.height + ' ' + (request.page?.skill ?? request.file))
  held.push(request)
  if (held.length < Number(process.env.STAND_IN_BATCH ?? 1)) return
  // Something that is not a reply first: the command passes it over.
  let out = 'not a reply\\n'
  for (const request of held.reverse()) out += JSON.stringify(answer(request)) + '\\n'
  answered += held.length
  held.length = 0
  process.stdout.write(out, () => {
    if (answered >= Number(process.env.STAND_IN_DIE_AFTER ?? Infinity)) die()
  })
})
input.on('close', () => {
  if (!process.env.STAND_IN_DEAF) log('end')
})
`

const ROOT = resolve(import.meta.dirname, '../../..')
const FIXTURE = join(ROOT, 'fixtures/design-skill')
const RUN = '2026-10-30-skill-v0-claude-haiku'

// Real: macOS's temp folder is a link, and the host is sent a skill by its real path.
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'st-drawing-')))
const script = join(scratch, 'stand-in.mjs')
writeFileSync(script, STAND_IN)
const standIn = { command: process.execPath, args: [script] }

// The library reads SKILL_STUDIO_HOME once, at import: the lifecycle and `st open`'s server write there.
const home = join(scratch, 'home')
mkdirSync(home)
process.env.SKILL_STUDIO_HOME = home
const { gradeRun } = await import('@application/grade.ts')
const { agentLifecycle } = await import('../lifecycle.ts')
const { contextOf, drawingOf } = await import('./commands/shared.ts')
const { stopServing } = await import('./commands/serve.ts')
const { drawingHost, hostStart } = await import('./drawing.ts')
const { openedServe } = await import('./open-server.ts')
const { startServer } = await import('../http/server.ts')

let log: string
let ending: AbortController

/** Wait until `met` holds, asking every few milliseconds, five seconds at most. Says whether it did. */
async function until(met: () => boolean, withinMs = 5000): Promise<boolean> {
  const deadline = Date.now() + withinMs
  while (!met()) {
    if (Date.now() > deadline) return false
    await new Promise((wait) => setTimeout(wait, 10))
  }
  return true
}

const logged = (): string[] =>
  existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []
const count = (line: string): number => logged().filter((l) => l === line).length

const WINDOWS = process.platform === 'win32'

/** The stand-in that wrote this test's log has exited. */
function standInGone(): boolean {
  if (!existsSync(`${log}.pid`)) return false
  try {
    process.kill(Number(readFileSync(`${log}.pid`, 'utf8')), 0)
    return false
  } catch {
    return true
  }
}

/** A module's address for an `import` in a script a test writes: Node takes a Windows path only as a file: URL. */
const importable = (path: string): string => JSON.stringify(pathToFileURL(path).href)

const page = (file = 'outputs/index.html'): ArtifactAddress => ({
  skill: scratch,
  run: 'r1',
  sample: 's1',
  file,
})

const DIED = 'The drawing host stopped (3): Missing X server or $DISPLAY'

beforeEach(() => {
  log = join(scratch, `log-${Math.random().toString(36).slice(2)}.txt`)
  ending = new AbortController()
  vi.stubEnv('STAND_IN_LOG', log)
  vi.stubEnv('STAND_IN_PNG', Buffer.from(pngOf(4, 3, () => [255, 0, 0, 255])).toString('base64'))
})

afterEach(async () => {
  ending.abort()
  // Every stand-in started has ended before the next test: none is left running.
  await until(() => count('start') <= count('end'))
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('drawingHost', () => {
  it('starts one host for many pages, and matches each reply to its page by id', async () => {
    vi.stubEnv('STAND_IN_BATCH', '3')
    const render = drawingHost({ warn: () => {}, start: standIn, signal: ending.signal })
    // Nothing starts before the first page.
    expect(logged()).toEqual([])
    const sizes = [
      { width: 1280, height: 960 },
      { width: 390, height: 1200 },
      { width: 800, height: 600 },
    ]
    // Answered last first: each page still gets its own reply.
    const drawn = await Promise.all(sizes.map((size) => render(page(), size)))
    expect(drawn.map((d) => d.layout?.window)).toEqual(sizes.map((s) => [s.width, s.height]))
    expect(drawn[0].png.slice(1, 4)).toEqual(new TextEncoder().encode('PNG'))
    expect(drawn[0].layout?.elements).toHaveLength(1)
    // Three more pages, to the same host.
    await Promise.all(sizes.map((size) => render(page(), size)))
    expect(count('start')).toBe(1)
    expect(logged().filter((l) => l.startsWith('asked'))).toHaveLength(6)
  })

  it('sends the skill by its real path, as the host serves it', async () => {
    mkdirSync(join(scratch, 'real-skill'))
    symlinkSync(join(scratch, 'real-skill'), join(scratch, 'linked-skill'), 'junction')
    const render = drawingHost({ warn: () => {}, start: standIn, signal: ending.signal })
    await render({ ...page(), skill: join(scratch, 'linked-skill') }, { width: 400, height: 300 })
    expect(logged()).toContain(`asked 1 400x300 ${join(scratch, 'real-skill')}`)
  })

  it("sends a page of the command's own by its file: address, to the same host", async () => {
    const host = drawingHost({ warn: () => {}, start: standIn, signal: ending.signal })
    await host(page(), { width: 400, height: 300 })
    const own = await host.file('file:///sheets/1.html', { width: 900, height: 700 })
    expect(own.layout?.window).toEqual([900, 700])
    expect(logged()).toEqual([
      'start',
      `asked 1 400x300 ${scratch}`,
      'asked 2 900x700 file:///sheets/1.html',
    ])
  })

  it('fails a page the host could not draw with its reason, and draws the next', async () => {
    const render = drawingHost({ warn: () => {}, start: standIn, signal: ending.signal })
    await expect(render(page('broken.html'), { width: 400, height: 300 })).rejects.toThrow(
      'The page stopped (crashed).',
    )
    await expect(render(page(), { width: 400, height: 300 })).resolves.toMatchObject({
      layout: { window: [400, 300] },
    })
  })

  it('says once why a host stopped, and never asks it again', async () => {
    vi.stubEnv('STAND_IN_FAIL', 'Missing X server or $DISPLAY')
    const warn = vi.fn()
    const render = drawingHost({ warn, start: standIn, signal: ending.signal })
    await expect(render(page(), { width: 400, height: 300 })).rejects.toThrow(DIED)
    await expect(render(page(), { width: 400, height: 300 })).rejects.toThrow(DIED)
    expect(logged()).toEqual(['start', 'end'])
    expect(warn.mock.calls).toEqual([
      [`${DIED} The pages after it are graded without being drawn.`],
    ])
  })

  it("removes the profile folder a host that stopped left, once it is gone, and no other host's", async () => {
    vi.stubEnv('STAND_IN_FAIL', 'Missing X server or $DISPLAY')
    vi.stubEnv('STAND_IN_PROFILE', '1')
    const render = drawingHost({ warn: () => {}, start: standIn, signal: ending.signal })
    await expect(render(page(), { width: 400, height: 300 })).rejects.toThrow(DIED)
    const pid = readFileSync(`${log}.pid`, 'utf8')
    const folder = (name: string) => join(tmpdir(), `skill-studio-draw-${name}`)
    const others = [folder(`${pid}9-other`), folder(`${process.pid}-other`)]
    try {
      expect(existsSync(folder(`${pid}-left`))).toBe(false)
      expect(others.filter(existsSync)).toEqual(others)
    } finally {
      for (const other of others) rmSync(other, { recursive: true, force: true })
    }
  })

  it('says what becomes of the pages after a host that stopped in the words the command gives', async () => {
    vi.stubEnv('STAND_IN_FAIL', 'Missing X server or $DISPLAY')
    const warn = vi.fn()
    const host = drawingHost({
      warn,
      start: standIn,
      signal: ending.signal,
      after: 'No more sheets are made.',
    })
    await expect(host.file('file:///sheets/1.html', { width: 400, height: 300 })).rejects.toThrow(
      DIED,
    )
    expect(warn.mock.calls).toEqual([[`${DIED} No more sheets are made.`]])
  })

  it('says nothing of a host that cannot start until a page is asked for, then once', async () => {
    const warn = vi.fn()
    // A server, or a grading, that draws no page: nothing is said.
    const render = drawingHost({ warn, start: { reason: 'Run pnpm build to draw pages.' } })
    expect(warn).not.toHaveBeenCalled()
    for (let n = 0; n < 2; n++)
      await expect(render(page(), { width: 400, height: 300 })).rejects.toBeInstanceOf(RendererGone)
    expect(warn.mock.calls).toEqual([['Run pnpm build to draw pages.']])
  })
})

describe('st serve and the drawing host', () => {
  it('starts no host and says nothing of drawing for a server that grades nothing', async () => {
    const warn = vi.fn()
    const server = await startServer({
      skills: [],
      port: 0,
      render: drawingHost({ warn, start: standIn }),
    })
    await server.close()
    const unbuilt = await startServer({
      skills: [],
      port: 0,
      render: drawingHost({ warn, start: { reason: 'Run pnpm build to draw pages.' } }),
    })
    await unbuilt.close()
    expect(logged()).toEqual([])
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('the end of the drawing host', () => {
  it("ends with the command's lifecycle, by its input closing, and says nothing of it", async () => {
    const lifecycle = agentLifecycle({ log: () => {} })
    const warn = vi.fn()
    const render = drawingHost({ warn, start: standIn, signal: lifecycle.signal })
    await render(page(), { width: 400, height: 300 })
    await lifecycle.stop()
    expect(await until(() => logged().includes('end'))).toBe(true)
    await expect(render(page(), { width: 400, height: 300 })).rejects.toThrow('Stopped.')
    expect(warn).not.toHaveBeenCalled()
  })

  it('ends when a command that drew a page is done: an idle host holds nothing open', async () => {
    const command = join(scratch, 'command.mts')
    writeFileSync(
      command,
      [
        `import { drawingHost } from ${importable(join(ROOT, 'src/interfaces/cli/drawing.ts'))}`,
        `const start = ${JSON.stringify(standIn)}`,
        'const render = drawingHost({ warn: console.error, start })',
        `await render({ skill: ${JSON.stringify(scratch)}, run: 'r1', sample: 's1', file: 'a.html' }, { width: 400, height: 300 })`,
        "console.log('drawn')",
      ].join('\n'),
    )
    const done = spawnSync(process.execPath, ['--import', 'tsx', command], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, SKILL_STUDIO_HOME: home },
      timeout: 30_000,
    })
    // It exited by itself, long before the time it was given, once its page was drawn.
    expect(done.status).toBe(0)
    expect(done.stdout).toBe('drawn\n')
    expect(logged().slice(0, 2)).toEqual(['start', `asked 1 400x300 ${scratch}`])
    // On Windows the kill as the command exits ends the host before it can note its input closing.
    expect(await until(() => (WINDOWS ? standInGone() : logged().includes('end')))).toBe(true)
  })

  it('ends with a command that exits while a page waits, though the host does not hear its input close', async () => {
    vi.stubEnv('STAND_IN_DEAF', '1')
    // Held: no page is answered, so the command exits with its host still drawing.
    vi.stubEnv('STAND_IN_BATCH', '2')
    const command = join(scratch, 'exits.mts')
    writeFileSync(
      command,
      [
        `import { drawingHost } from ${importable(join(ROOT, 'src/interfaces/cli/drawing.ts'))}`,
        `const start = ${JSON.stringify(standIn)}`,
        'const render = drawingHost({ warn: console.error, start })',
        `void render({ skill: ${JSON.stringify(scratch)}, run: 'r1', sample: 's1', file: 'a.html' }, { width: 400, height: 300 })`,
        // As Ctrl-C ends a command: at once, with nothing awaited.
        'setTimeout(() => process.exit(130), 300)',
      ].join('\n'),
    )
    const done = spawnSync(process.execPath, ['--import', 'tsx', command], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, SKILL_STUDIO_HOME: home },
      timeout: 30_000,
    })
    expect(done.status).toBe(130)
    // Windows has no SIGTERM to hear: its kill ends the host at once.
    expect(await until(() => (WINDOWS ? standInGone() : logged().includes('killed')))).toBe(true)
    expect(await until(standInGone)).toBe(true)
  })

  it('ends when the server `st open` started stops for want of use', async () => {
    vi.stubEnv('ST_OPEN_SERVER', '1')
    let clock = 0
    const opened = openedServe({ idleMs: 1000, everyMs: 5, now: () => clock })
    if (!opened) throw new Error('not started by st open')
    const lifecycle = agentLifecycle({ log: () => {} })
    const render = drawingHost({ warn: () => {}, start: standIn, signal: lifecycle.signal })
    await render(page(), { width: 400, height: 300 })
    const exited: number[] = []
    // The server's own stop, as `st serve` hands it on, with the exit caught.
    expect(
      opened.host(
        { port: 1, token: 't' },
        stopServing(lifecycle, (code) => exited.push(code)),
      ),
    ).toBe(true)
    clock = 2000
    expect(await until(() => logged().includes('end') && exited.length > 0)).toBe(true)
    expect(exited).toEqual([0])
  })
})

describe('hostStart', () => {
  it('says to build first when the host is not built', () => {
    expect(hostStart({}, 'darwin', join(scratch, 'no-draw.js'))).toEqual({
      reason: 'Run pnpm build to draw pages.',
    })
  })

  it('says there is no display on Linux without one', () => {
    expect(hostStart({}, 'linux', script)).toEqual({
      reason: 'There is no display to draw pages on: run the command under xvfb-run.',
    })
  })

  it('says Electron is not installed when its binary is not there', () => {
    expect(
      hostStart(
        { DISPLAY: ':99', ELECTRON_OVERRIDE_DIST_PATH: join(scratch, 'none') },
        'linux',
        script,
      ),
    ).toEqual({ reason: 'Electron is not installed: run pnpm install to draw pages.' })
  })
})

describe('drawingOf', () => {
  it('starts nothing and says nothing with --no-draw, or when Jev does not grade', () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    expect(drawingOf(contextOf([], { 'no-draw': true }, null))).toBeUndefined()
    expect(drawingOf(contextOf([], { 'no-jev': true }, null))).toBeUndefined()
    vi.spyOn(Jev, 'available').mockReturnValue(false)
    expect(drawingOf(contextOf([], {}, null))).toBeUndefined()
    expect(said).not.toHaveBeenCalled()
  })
})

describe('a grading with the drawing host', () => {
  /**
   * A scratch copy of `design-skill` whose run has `samples` outputs of the
   * one page; with `phone`, its case asks for the page at phone width too.
   */
  function skillWith(samples: number, phone = false): string {
    const skill = join(mkdtempSync(join(scratch, 'grade-')), 'design-skill')
    cpSync(FIXTURE, skill, { recursive: true, verbatimSymlinks: true })
    if (phone) {
      const yaml = join(skill, 'evals/cases/landing/case.yaml')
      writeFileSync(yaml, `${readFileSync(yaml, 'utf8').trimEnd()}\n  phone: true\n`)
    }
    const runDir = join(skill, 'evals/runs', RUN)
    const meta = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8'))
    for (let n = 2; n <= samples; n++) {
      cpSync(join(runDir, 'landing-s1'), join(runDir, `landing-s${n}`), { recursive: true })
      meta.samples.push({ ...meta.samples[0], dir: `landing-s${n}`, index: n })
    }
    meta.samplesPerCase = samples
    writeFileSync(join(runDir, 'run.json'), JSON.stringify(meta))
    return skill
  }

  const renders = (skill: string, sample: string) =>
    join(skill, 'evals/runs', RUN, sample, 'renders')
  /** What a result says of how it was graded and what it was given, without the times. */
  const graded = (result: ReportResult) => ({ graded: result.graded, packs: result.packs })

  beforeEach(() => {
    vi.spyOn(Jev, 'available').mockReturnValue(true)
    vi.spyOn(Jev.prototype, 'ask').mockImplementation(async (_state, questions) =>
      Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: 0.9 } as never])),
    )
  })

  it('draws the page and keeps the picture and its layout, as the desktop app does', async () => {
    const skill = skillWith(1)
    const render = drawingHost({ warn: () => {}, start: standIn, signal: ending.signal })
    const report = await gradeRun(skill, RUN, { useJev: true, render, log: () => {} })
    expect(report.results[0].graded?.drawn).toBe(true)
    expect(readdirSync(renders(skill, 'landing-s1')).sort()).toEqual([
      'desktop-1280x960.json',
      'desktop-1280x960.png',
    ])
    expect(
      JSON.parse(readFileSync(join(renders(skill, 'landing-s1'), 'desktop-1280x960.json'), 'utf8')),
    ).toMatchObject({ window: [1280, 960] })
  })

  it('grades the outputs after a host that died as with no renderer, and says why once', async () => {
    vi.stubEnv('STAND_IN_FAIL', 'Missing X server or $DISPLAY')
    vi.stubEnv('STAND_IN_DIE_AFTER', '1')
    const skill = skillWith(3)
    const warned: string[] = []
    const render = drawingHost({
      warn: (line) => warned.push(line),
      start: standIn,
      signal: ending.signal,
    })
    const graderSaid: string[] = []
    const report = await gradeRun(skill, RUN, {
      useJev: true,
      render,
      log: () => {},
      warn: (line) => graderSaid.push(line),
    })
    const bySample = (name: string) => report.results.find((r) => r.sample === name)
    // The first output was drawn, and keeps its picture.
    expect(bySample('landing-s1')?.graded?.drawn).toBe(true)
    expect(existsSync(join(renders(skill, 'landing-s1'), 'desktop-1280x960.png'))).toBe(true)
    // The host died then. It was asked nothing more, and said why once.
    expect(count('start')).toBe(1)
    expect(logged().filter((l) => l.startsWith('asked ')).length).toBeLessThanOrEqual(2)
    expect(warned).toEqual([`${DIED} The pages after it are graded without being drawn.`])
    expect(graderSaid.filter((line) => line.includes('drawn'))).toEqual([])
    // The two after it are graded exactly as a grading with no renderer grades them.
    const undrawn = await gradeRun(skillWith(3), RUN, { useJev: true, log: () => {} })
    for (const name of ['landing-s2', 'landing-s3']) {
      const result = bySample(name)
      if (!result) throw new Error(`${name} was not graded`)
      expect(result.graded?.drawn).toBe(false)
      expect(existsSync(renders(skill, name))).toBe(false)
      const alone = undrawn.results.find((r) => r.sample === name)
      if (!alone) throw new Error(`${name} was not graded without a renderer`)
      expect(graded(result)).toEqual(graded(alone))
    }
  })

  it('grades undrawn, with the reason said once, where the host dies at the first page', async () => {
    vi.stubEnv('STAND_IN_FAIL', 'Missing X server or $DISPLAY')
    const skill = skillWith(1)
    const warned: string[] = []
    const render = drawingHost({
      warn: (line) => warned.push(line),
      start: standIn,
      signal: ending.signal,
    })
    const report = await gradeRun(skill, RUN, { useJev: true, render, log: () => {} })
    expect(report.results[0].graded?.drawn).toBe(false)
    expect(existsSync(renders(skill, 'landing-s1'))).toBe(false)
    expect(warned).toEqual([`${DIED} The pages after it are graded without being drawn.`])
  })

  it('keeps none of the pictures of an output whose host died between its two sizes', async () => {
    vi.stubEnv('STAND_IN_FAIL', 'Missing X server or $DISPLAY')
    vi.stubEnv('STAND_IN_DIE_AFTER', '1')
    const skill = skillWith(1, true)
    const warned: string[] = []
    const render = drawingHost({
      warn: (line) => warned.push(line),
      start: standIn,
      signal: ending.signal,
    })
    const report = await gradeRun(skill, RUN, { useJev: true, render, log: () => {} })
    // The desktop size was drawn, then the host died before the phone's.
    expect(logged()).toContain(`asked 1 1280x960 ${skill}`)
    expect(report.results[0].graded?.drawn).toBe(false)
    expect(existsSync(renders(skill, 'landing-s1'))).toBe(false)
    expect(warned).toEqual([`${DIED} The pages after it are graded without being drawn.`])
    // Graded as a grading with no renderer grades it.
    const undrawn = await gradeRun(skillWith(1, true), RUN, { useJev: true, log: () => {} })
    expect(graded(report.results[0])).toEqual(graded(undrawn.results[0]))
  })

  it('grades undrawn, and says why once, where the host cannot start', async () => {
    const skill = skillWith(2)
    const warned: string[] = []
    const render = drawingHost({
      warn: (line) => warned.push(line),
      start: { reason: 'Run pnpm build to draw pages.' },
    })
    const report = await gradeRun(skill, RUN, { useJev: true, render, log: () => {} })
    expect(report.results.map((r) => r.graded?.drawn)).toEqual([false, false])
    expect(warned).toEqual(['Run pnpm build to draw pages.'])
  })
})
