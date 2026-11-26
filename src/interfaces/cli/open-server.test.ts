/**
 * `st open` as it runs: each call a real `st`, from a scratch copy of the
 * checkout with a stand-in for the built app, so two copies are two checkouts.
 * Their studio folder is a scratch one, and every server they start is ended
 * at the end, whether the tests passed or not. When the server stops itself
 * is read in this process, on a clock the test moves.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../..')
const RUNS = ['2026-10-30-skill-v0-claude-haiku', '2026-10-30-skill-v0-claude-haiku-2']

const made: string[] = []
const scratch = (prefix: string): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)))
  made.push(dir)
  return dir
}

// The library reads SKILL_STUDIO_HOME once, at import: a server hosted in this process writes its file there.
const ownHome = scratch('st-open-own-home-')
process.env.SKILL_STUDIO_HOME = ownHome
const { logCap, openedServe } = await import('./open-server.ts')
const { runJob } = await import('@application/jobs.ts')

/** A checkout of its own: the sources, the packages through a link, and a built app that is one page. */
function checkoutCopy(): string {
  const dir = scratch('st-open-checkout-')
  cpSync(join(ROOT, 'src'), join(dir, 'src'), {
    recursive: true,
    filter: (path) => !path.endsWith('.test.ts'),
  })
  for (const file of ['package.json', 'tsconfig.json', 'tsconfig.base.json'])
    cpSync(join(ROOT, file), join(dir, file))
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction')
  mkdirSync(join(dir, 'out/renderer'), { recursive: true })
  writeFileSync(join(dir, 'out/renderer/index.html'), '<html><head></head><body>app</body></html>')
  return dir
}

let home: string
let skill: string
let first: string
let second: string

/** `st open ...args`, run from `checkout`'s copy of the command line. */
function stOpen(checkout: string, ...args: string[]) {
  return stOpenWith({}, checkout, ...args)
}

/** `st open ...args` as `stOpen` runs it, with `env` laid over its environment, and the server's. */
function stOpenWith(env: Record<string, string>, checkout: string, ...args: string[]) {
  const { ST_OPEN_SERVER: _, ...own } = process.env
  const st = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(checkout, 'src/interfaces/cli/st.ts'), 'open', ...args],
    {
      cwd: checkout,
      encoding: 'utf8',
      env: { ...own, SKILL_STUDIO_HOME: home, ...env },
      timeout: 60_000,
    },
  )
  return {
    status: st.status,
    stdout: st.stdout,
    stderr: st.stderr,
    lines: `${st.stdout}${st.stderr}`,
  }
}

/** The server file of `checkout`, named as the shape names it. */
const fileOf = (checkout: string, under = home): string =>
  join(
    under,
    '.skill-studio',
    `open-${createHash('sha256').update(checkout).digest('hex').slice(0, 8)}.json`,
  )

/** The log of `checkout`'s server, beside its file. */
const logOf = (checkout: string): string => fileOf(checkout).replace(/\.json$/, '.log')

const serverOf = (
  checkout: string,
): { pid: number; port: number; token: string; checkout: string } =>
  JSON.parse(readFileSync(fileOf(checkout), 'utf8'))

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const seen = new Set<number>()

beforeAll(() => {
  home = scratch('st-open-home-')
  // A copy: the stored runs under fixtures/ are what tests are pinned to.
  skill = join(scratch('st-open-skill-'), 'demo skill')
  cpSync(join(ROOT, 'fixtures/demo-skill'), skill, { recursive: true })
  first = checkoutCopy()
  second = checkoutCopy()
})

afterAll(async () => {
  const folder = join(home, '.skill-studio')
  for (const name of existsSync(folder) ? readdirSync(folder) : [])
    if (name.startsWith('open-')) {
      try {
        seen.add(JSON.parse(readFileSync(join(folder, name), 'utf8')).pid)
      } catch {}
    }
  for (const pid of seen) if (alive(pid)) process.kill(pid, 'SIGKILL')
  const until = Date.now() + 5000
  while ([...seen].some(alive) && Date.now() < until) await new Promise((r) => setTimeout(r, 100))
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

let address: URL

describe('st open', () => {
  it('starts one server for two calls, and the second prints the same origin with another ticket', async () => {
    const once = stOpen(first, skill, '--a', RUNS[0], '--b', RUNS[1])
    expect(once.stderr).toContain('Started the app for this checkout.')
    expect(once.status).toBe(0)
    const server = serverOf(first)
    seen.add(server.pid)
    expect(server.checkout).toBe(first)
    address = new URL(once.stdout.trim())
    // By the number, never `localhost`: no dev server opened as `localhost` is sent its cookie.
    expect(address.origin).toBe(`http://127.0.0.1:${server.port}`)
    expect(address.searchParams.get('skill')).toBe(skill)
    expect(address.hash).toMatch(/^#\/results\?case=.+&a=.+&b=.+$/)

    const twice = stOpen(first, skill, '--a', RUNS[0])
    expect(twice.status).toBe(0)
    expect(twice.stderr).not.toContain('Started')
    const again = new URL(twice.stdout.trim())
    expect(again.origin).toBe(address.origin)
    expect(again.searchParams.get('ticket')).toMatch(/^[\w-]{43}$/)
    expect(again.searchParams.get('ticket')).not.toBe(address.searchParams.get('ticket'))
    expect(serverOf(first).pid).toBe(server.pid)

    // No line it printed holds the token, and neither does the server's command line.
    for (const printed of [once.lines, twice.lines]) expect(printed).not.toContain(server.token)
    // Its stderr goes to a log beside its file; its stdout, with the address that carries the token, nowhere.
    expect(existsSync(logOf(first))).toBe(true)
    expect(readFileSync(logOf(first), 'utf8')).not.toContain('Skill Studio:')
    if (process.platform !== 'win32') {
      const args = spawnSync('ps', ['-o', 'args=', '-p', String(server.pid)], { encoding: 'utf8' })
      expect(args.stdout).toContain('serve')
      expect(args.stdout).not.toContain(server.token)
    }
  }, 120_000)

  it('prints an address whose first load trades its ticket for the cookie, and no second', async () => {
    const load = await fetch(address, { redirect: 'manual' })
    expect(load.status).toBe(302)
    // For this port by name, for its host alone (no Domain), never sent by another site's page, never read by a script.
    const cookie = load.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(
      new RegExp(`^st_token_${address.port}=[\\w-]{43}; HttpOnly; SameSite=Strict; Path=/$`),
    )
    // The way on is a path on this server, so the browser stays on 127.0.0.1.
    const location = load.headers.get('location') ?? ''
    expect(location).toMatch(/^\/(?!\/)/)
    const on = new URL(location, address)
    expect(on.origin).toBe(address.origin)
    expect(on.pathname).toBe('/')
    expect([...on.searchParams]).toEqual([['skill', skill]])
    // The cookie it set lets in a page load by the same address.
    const page = await fetch(on, { headers: { cookie: cookie.split(';')[0] } })
    expect(page.status).toBe(200)
    expect((await fetch(address, { redirect: 'manual' })).status).toBe(401)
  })

  it('gives a ticket only for the token in its header, not in the address or the cookie', async () => {
    const { port, token } = serverOf(first)
    const ask = (path: string, headers: Record<string, string>) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: '{}',
      })
    expect((await ask(`/api/ticket?token=${token}`, {})).status).toBe(401)
    expect((await ask('/api/ticket', { cookie: `st_token_${port}=${token}` })).status).toBe(401)
    expect((await ask('/api/ticket', { 'x-skill-studio-token': 'nope' })).status).toBe(401)
    const given = await ask('/api/ticket', { 'x-skill-studio-token': token })
    expect(given.status).toBe(200)
  })

  it.skipIf(process.platform === 'win32')(
    'keeps the file and the log readable by the user alone',
    () => {
      expect(statSync(fileOf(first)).mode & 0o777).toBe(0o600)
      expect(statSync(logOf(first)).mode & 0o777).toBe(0o600)
    },
  )

  it('writes no token to the log, whatever it was asked', async () => {
    const { port, token } = serverOf(first)
    // Refused, signed in, and an operation that fails: each may say something on stderr.
    await fetch(`http://127.0.0.1:${port}/?token=nope`)
    await fetch(`http://127.0.0.1:${port}/?token=${token}`, { redirect: 'manual' })
    await fetch(`http://127.0.0.1:${port}/api/skill.run?token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"skill":"/nowhere","run":"none"}',
    })
    expect(readFileSync(logOf(first), 'utf8')).not.toContain(token)
  })

  it("starts a second checkout's server and leaves the first running", () => {
    const one = serverOf(first)
    const other = stOpen(second, skill)
    expect(other.status).toBe(0)
    expect(other.stderr).toContain('Started the app for this checkout.')
    const two = serverOf(second)
    seen.add(two.pid)
    expect(two.pid).not.toBe(one.pid)
    expect(new URL(other.stdout.trim()).port).toBe(String(two.port))
    expect(two.port).not.toBe(one.port)
    expect(alive(one.pid)).toBe(true)
    expect(serverOf(first)).toEqual(one)
  }, 120_000)

  it("stops this checkout's server with --stop and removes its file, and leaves the other's", () => {
    const one = serverOf(first)
    const two = serverOf(second)
    const stopped = stOpen(first, '--stop')
    expect(stopped.status).toBe(0)
    expect(stopped.stdout).toContain(`Stopped the app at http://127.0.0.1:${one.port}.`)
    expect(alive(one.pid)).toBe(false)
    expect(existsSync(fileOf(first))).toBe(false)
    // The log stays: it is what explains a server that died.
    expect(existsSync(logOf(first))).toBe(true)
    expect(alive(two.pid)).toBe(true)
    expect(stOpen(first, '--stop').stdout).toContain('The app is not running for this checkout.')
    expect(stOpen(second, '--stop').status).toBe(0)
    expect(alive(two.pid)).toBe(false)
    expect(existsSync(fileOf(second))).toBe(false)
  }, 120_000)

  it('removes a file whose process is gone and starts a new server, with a new log', () => {
    const gone = spawnSync(process.execPath, ['-e', '']).pid
    expect(alive(gone)).toBe(false)
    mkdirSync(join(home, '.skill-studio'), { recursive: true })
    writeFileSync(logOf(first), 'what the last server wrote\n', { mode: 0o644 })
    chmodSync(logOf(first), 0o644)
    writeFileSync(
      fileOf(first),
      JSON.stringify({ pid: gone, port: 9, token: 'old', checkout: first }),
      { mode: 0o600 },
    )
    const fresh = stOpen(first, skill)
    expect(fresh.status).toBe(0)
    expect(fresh.stderr).toContain('Started the app for this checkout.')
    const server = serverOf(first)
    seen.add(server.pid)
    expect(server.pid).not.toBe(gone)
    expect(alive(server.pid)).toBe(true)
    expect(new URL(fresh.stdout.trim()).port).toBe(String(server.port))
    expect(readFileSync(logOf(first), 'utf8')).not.toContain('what the last server wrote')
    if (process.platform !== 'win32') expect(statSync(logOf(first)).mode & 0o777).toBe(0o600)
    expect(stOpen(first, '--stop').status).toBe(0)
    expect(existsSync(fileOf(first))).toBe(false)
  }, 120_000)

  it('asks for a build where the app is not built, and starts nothing', () => {
    rmSync(join(second, 'out'), { recursive: true, force: true })
    const unbuilt = stOpen(second, skill)
    expect(unbuilt.stderr).toContain('Run pnpm build first.')
    expect(unbuilt.status).toBe(2)
    expect(existsSync(fileOf(second))).toBe(false)
  }, 60_000)
})

describe('st open, when its server does not come up', () => {
  /**
   * What makes the server `st open` starts write `line` to stderr and then do
   * `then`, before any of its code loads, and leaves `st open` itself alone: a
   * module Node loads first in every process, through `NODE_OPTIONS`, which
   * the server inherits, that acts only where `ST_OPEN_SERVER` is set, as it
   * is for the server alone. No source is edited, so no line end matters.
   */
  function breaking(line: string, then: string): Record<string, string> {
    const dir = scratch('st-open-break-')
    const preload = join(dir, 'break.mjs')
    writeFileSync(
      preload,
      `if (process.env.ST_OPEN_SERVER === '1') { console.error(${JSON.stringify(line)}); ${then} }\n`,
    )
    return { NODE_OPTIONS: `--import=${JSON.stringify(pathToFileURL(preload).href)}` }
  }

  it('says where the log is when the server stops as it starts, and the log says why', () => {
    const checkout = checkoutCopy()
    const st = stOpenWith(breaking('broken on purpose', 'process.exit(3)'), checkout, skill)
    expect(st.status).not.toBe(0)
    expect(st.stderr).toContain(
      `The server stopped as it started. What it wrote is in ${logOf(checkout)}.`,
    )
    expect(readFileSync(logOf(checkout), 'utf8')).toContain('broken on purpose')
    expect(existsSync(fileOf(checkout))).toBe(false)
  }, 60_000)

  it('says where the log is when the server does not answer in time', () => {
    const checkout = checkoutCopy()
    // Held before its code loads, with something to keep it up: it never writes its file.
    const held = breaking(
      'stuck on purpose',
      'setInterval(() => {}, 1000); await new Promise(() => {})',
    )
    const st = stOpenWith(held, checkout, skill)
    expect(st.status).not.toBe(0)
    expect(st.stderr).toContain(
      `The server did not start within 30 seconds. What it wrote is in ${logOf(checkout)}.`,
    )
    expect(readFileSync(logOf(checkout), 'utf8')).toContain('stuck on purpose')
  }, 120_000)
})

describe('the log of the server st open starts', () => {
  it('keeps its newest half, after a line saying so, once it passes its most', () => {
    const dir = scratch('st-open-log-')
    const path = join(dir, 'open-test.log')
    const fd = openSync(path, 'ax', 0o600)
    const cap = logCap(path, fd, 1000)
    try {
      for (let n = 0; n < 100; n += 1) {
        writeSync(fd, `line ${String(n).padStart(3, '0')} ${'x'.repeat(40)}\n`)
        cap()
        expect(statSync(path).size).toBeLessThanOrEqual(1000 + 200)
      }
    } finally {
      closeSync(fd)
    }
    const text = readFileSync(path, 'utf8')
    expect(text).toContain('line 099')
    expect(text).not.toContain('line 000')
    expect(text).toMatch(/^\[.+: the log passed 1000 bytes; its oldest lines went\]\n/)
  })

  it('leaves a descriptor that is not the log alone', () => {
    const dir = scratch('st-open-log-')
    const path = join(dir, 'open-test.log')
    writeFileSync(path, 'y'.repeat(5000))
    const other = openSync(join(dir, 'other.log'), 'ax')
    try {
      logCap(path, other, 1000)()
    } finally {
      closeSync(other)
    }
    expect(statSync(path).size).toBe(5000)
  })
})

describe('the server st open starts, as it stops itself', () => {
  const OWN = fileOf(realpathSync(ROOT), ownHome)
  const HOUR = 1000
  let at = 0
  const stops: number[] = []
  /** Host a stand-in server in this process, as `st serve` does when `st open` started it, on the test's clock. */
  function hosted() {
    process.env.ST_OPEN_SERVER = '1'
    const opened = openedServe({ idleMs: HOUR, everyMs: 5, now: () => at })
    if (!opened) throw new Error('openedServe did not see ST_OPEN_SERVER.')
    expect(opened.host({ port: 1, token: 'stand-in' }, () => stops.push(at))).toBe(true)
    expect(JSON.parse(readFileSync(OWN, 'utf8')).pid).toBe(process.pid)
    return opened
  }
  /** Long enough for the check to have run several times. */
  const checks = () => new Promise((done) => setTimeout(done, 50))
  /** A job that runs until `end` is called, as a run in the app does. */
  function job() {
    let end = (_: boolean) => {}
    runJob(
      'generate',
      'A run',
      null,
      `/runs/${Math.random()}`,
      () => new Promise((done) => (end = done)),
    )
    return () => end(true)
  }

  afterEach(() => {
    at = 0
    stops.length = 0
    rmSync(OWN, { force: true })
  })

  it('stops an hour after the last request, and not before', async () => {
    const opened = hosted()
    at = HOUR - 100
    opened.onRequest()
    at = HOUR + 100
    await checks()
    expect(stops).toEqual([])
    // An hour after the request, less a moment.
    at = 2 * HOUR - 101
    await checks()
    expect(stops).toEqual([])
    at = 2 * HOUR - 100
    await checks()
    expect(stops).toEqual([2 * HOUR - 100])
  })

  it('never stops while a job runs, and stops once none does', async () => {
    hosted()
    const end = job()
    at = 5 * HOUR
    await checks()
    expect(stops).toEqual([])
    end()
    await checks()
    expect(stops).toEqual([5 * HOUR])
  })

  it('stops when its file is gone, though it was used just now', async () => {
    hosted()
    rmSync(OWN)
    await checks()
    expect(stops).toEqual([0])
  })

  it('stops when its file names another server, once no job runs', async () => {
    hosted()
    const end = job()
    writeFileSync(
      OWN,
      JSON.stringify({ pid: process.ppid, port: 2, token: 'other', checkout: realpathSync(ROOT) }),
    )
    await checks()
    expect(stops).toEqual([])
    end()
    await checks()
    expect(stops).toEqual([0])
    // The other server's file is its own: this one's exit leaves it.
    expect(JSON.parse(readFileSync(OWN, 'utf8')).pid).toBe(process.ppid)
  })
})
