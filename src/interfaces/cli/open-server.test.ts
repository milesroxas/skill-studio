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
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
const { openedServe } = await import('./open-server.ts')
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
  const st = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(checkout, 'src/interfaces/cli/st.ts'), 'open', ...args],
    {
      cwd: checkout,
      encoding: 'utf8',
      env: { ...process.env, SKILL_STUDIO_HOME: home },
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
    expect(address.origin).toBe(`http://localhost:${server.port}`)
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
    if (process.platform !== 'win32') {
      const args = spawnSync('ps', ['-o', 'args=', '-p', String(server.pid)], { encoding: 'utf8' })
      expect(args.stdout).toContain('serve')
      expect(args.stdout).not.toContain(server.token)
    }
  }, 120_000)

  it('prints an address whose first load trades its ticket for the cookie, and no second', async () => {
    const load = await fetch(address, { redirect: 'manual' })
    expect(load.status).toBe(302)
    expect(load.headers.get('set-cookie')).toContain(`st_token_${address.port}=`)
    const on = new URL(load.headers.get('location') ?? '', address)
    expect(on.pathname).toBe('/')
    expect([...on.searchParams]).toEqual([['skill', skill]])
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

  it.skipIf(process.platform === 'win32')('keeps the file readable by the user alone', () => {
    expect(statSync(fileOf(first)).mode & 0o777).toBe(0o600)
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
    expect(stopped.stdout).toContain(`Stopped the app at http://localhost:${one.port}.`)
    expect(alive(one.pid)).toBe(false)
    expect(existsSync(fileOf(first))).toBe(false)
    expect(alive(two.pid)).toBe(true)
    expect(stOpen(first, '--stop').stdout).toContain('The app is not running for this checkout.')
    expect(stOpen(second, '--stop').status).toBe(0)
    expect(alive(two.pid)).toBe(false)
    expect(existsSync(fileOf(second))).toBe(false)
  }, 120_000)

  it('removes a file whose process is gone and starts a new server', () => {
    const gone = spawnSync(process.execPath, ['-e', '']).pid
    expect(alive(gone)).toBe(false)
    mkdirSync(join(home, '.skill-studio'), { recursive: true })
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
