import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'st-serve-'))
// The library reads SKILL_STUDIO_HOME once, at import.
process.env.SKILL_STUDIO_HOME = join(root, 'home')
const { startServer } = await import('./server.ts')
type Server = Awaited<ReturnType<typeof startServer>>

const rendererDir = join(root, 'renderer')
mkdirSync(join(rendererDir, 'assets'), { recursive: true })
writeFileSync(join(rendererDir, 'index.html'), '<html><head></head><body>app</body></html>')
writeFileSync(join(rendererDir, 'assets', 'app-1a2b.js'), 'console.log(1)')
writeFileSync(join(root, 'secret.txt'), 'outside')

const MAX_BODY = 1024
let server: Server
let base: string
let cookie: string

beforeAll(async () => {
  server = await startServer({ skills: [], port: 0, rendererDir, maxBodyBytes: MAX_BODY })
  base = `http://localhost:${server.port}`
  cookie = `st_token_${server.port}=${server.token}`
})
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const get = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { headers, redirect: 'manual' })

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

/** A POST written by hand, so a body can be longer or shorter than it says. */
const rawPost = (
  path: string,
  headers: Record<string, string>,
  chunks: string[],
): Promise<{ status: number; body: string }> =>
  new Promise((done, fail) => {
    let answered = false
    const req = request(
      `${base}${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json', cookie, ...headers } },
      (res) => {
        answered = true
        let body = ''
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => done({ status: res.statusCode ?? 0, body }))
      },
    )
    // The server may hang up on a body it will not read; the answer is what counts.
    req.on('error', (error) => {
      if (!answered) fail(error)
    })
    for (const chunk of chunks) req.write(chunk)
    req.end()
  })

describe('st serve', () => {
  it('prints an address that carries its token', () => {
    expect(server.url).toBe(`${base}/?token=${server.token}`)
  })

  describe('without the token', () => {
    it('refuses a page with a sentence that says what to open', async () => {
      const response = await get('/')
      expect(response.status).toBe(401)
      expect(response.headers.get('content-type')).toMatch('text/plain')
      expect(await response.text()).toMatch('address `st serve` printed')
    })

    it('refuses an operation, a file and a picture', async () => {
      const call = await post('/api/library.skills', {})
      expect(call.status).toBe(401)
      expect(((await call.json()) as { error: string }).error).toMatch('address `st serve` printed')
      expect((await get('/assets/app-1a2b.js')).status).toBe(401)
      expect((await get('/api/artifact/key/s/r/case-s1/outputs/f.html')).status).toBe(401)
      expect((await get('/api/image?upload=x')).status).toBe(401)
    })

    it('refuses a wrong token and a wrong cookie', async () => {
      expect((await get('/?token=nope')).status).toBe(401)
      expect((await get('/', { cookie: `st_token_${server.port}=nope` })).status).toBe(401)
      const call = await post('/api/library.skills?token=nope', {})
      expect(call.status).toBe(401)
    })
  })

  describe('with the token', () => {
    it('trades it for a cookie and sends the reader on without it', async () => {
      const response = await get(`/?token=${server.token}`)
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('/')
      expect(response.headers.get('set-cookie')).toBe(
        `${cookie}; HttpOnly; SameSite=Strict; Path=/`,
      )
      expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    })

    it('serves the page to the cookie, under the app policy', async () => {
      const response = await get('/', { cookie })
      expect(response.status).toBe(200)
      expect(await response.text()).toMatch('csp-nonce')
      expect(response.headers.get('content-security-policy')).toMatch("script-src 'self'")
    })

    it('runs an operation for the cookie, and for a token sent with the call', async () => {
      const byCookie = await post('/api/library.skills', {}, { cookie })
      expect(byCookie.status).toBe(200)
      expect(await byCookie.json()).toEqual([])
      const byToken = await post(`/api/library.skills?token=${server.token}`, {})
      expect(byToken.status).toBe(200)
    })

    it('trades a one-use ticket for the cookie, once, for the browser `--open` starts', async () => {
      const opened = new URL(server.ticketUrl())
      expect(opened.searchParams.has('token')).toBe(false)
      const path = `${opened.pathname}${opened.search}`
      const first = await get(path)
      expect(first.status).toBe(302)
      expect(first.headers.get('location')).toBe('/')
      expect(first.headers.get('set-cookie')).toBe(`${cookie}; HttpOnly; SameSite=Strict; Path=/`)
      expect((await get(path)).status).toBe(401)
    })

    it('still refuses a request from another site', async () => {
      const response = await post(
        '/api/library.skills',
        {},
        { cookie, origin: 'https://evil.example' },
      )
      expect(response.status).toBe(403)
    })
  })

  describe('with --tailscale', () => {
    it('asks the token of a request that carries the owner’s login, as another account could send it', async () => {
      const remote = { host: 'mac.tail1234.ts.net', users: ['me@github'] }
      const tailnet = await startServer({ skills: [], port: 0, rendererDir, remote })
      try {
        const as = (headers: Record<string, string>) =>
          new Promise<number>((done, fail) => {
            const req = request(
              {
                host: '127.0.0.1',
                port: tailnet.port,
                method: 'POST',
                path: '/api/library.skills',
                headers: {
                  host: remote.host,
                  'tailscale-user-login': 'me@github',
                  'content-type': 'application/json',
                  ...headers,
                },
              },
              (res) => {
                res.resume()
                done(res.statusCode ?? 0)
              },
            )
            req.on('error', fail)
            req.end('{}')
          })
        expect(await as({})).toBe(401)
        expect(await as({ cookie: `st_token_443=${tailnet.token}` })).toBe(200)
      } finally {
        await tailnet.close()
      }
    })
  })

  describe('a file a sample wrote', () => {
    // A skill with one run, whose output is a page and the script beside it.
    const skill = join(root, 'skill')
    const outputs = join(skill, 'evals/runs/run-1/case-s1/outputs')
    mkdirSync(outputs, { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '# Skill\n')
    writeFileSync(join(outputs, 'index.html'), '<body><script src="app.js"></script></body>')
    writeFileSync(join(outputs, 'app.js'), 'document.title = "drawn"')
    /** The key the app's page carries, read as the browser's page reads it. */
    let key = ''
    beforeAll(async () => {
      // The app opens the skill before it shows a run of it.
      expect((await post('/api/skill.drafts', { skill }, { cookie })).status).toBe(200)
      const page = await (await get('/', { cookie })).text()
      key = /<meta name="skill-studio-artifact-key" content="([^"]+)">/.exec(page)?.[1] ?? ''
    })
    const at = (file: string, under = key) =>
      `/api/artifact/${under}/${encodeURIComponent(skill)}/run-1/case-s1/outputs/${file}`

    it('is served by its path under the sandbox policy, and its neighbours by theirs', async () => {
      expect(key).toMatch(/^[\w-]{43}$/)
      const page = await get(at('index.html'), { cookie })
      expect(page.status).toBe(200)
      expect(page.headers.get('content-security-policy')).toMatch(/^sandbox allow-scripts; /)
      expect(await page.text()).toBe('<body><script src="app.js"></script></body>')
      const script = await get(at('app.js'), { cookie })
      expect(script.headers.get('content-type')).toMatch('text/javascript')
      expect(await script.text()).toBe('document.title = "drawn"')
    })

    it('is served to the page’s own requests, which carry no cookie and read as another site', async () => {
      const own = { 'sec-fetch-site': 'cross-site', origin: 'null' }
      expect((await get(at('app.js'), own)).status).toBe(200)
    })

    it('needs this start’s key', async () => {
      expect((await get(at('app.js', 'wrong'))).status).toBe(401)
      expect((await get(at('app.js', 'wrong'), { cookie })).status).not.toBe(200)
    })

    it('carries the stage’s script when the stage asks for it', async () => {
      const page = await get(`${at('index.html')}?stage=1`, { cookie })
      expect(await page.text()).toMatch(
        /<script data-skill-studio-stage>[\s\S]*<\/script><\/body>$/,
      )
    })

    it('finds nothing outside the sample', async () => {
      const out = await get(
        `/api/artifact/${encodeURIComponent(skill)}/run-1/case-s1/outputs/..%2F..%2F..%2F..%2FSKILL.md`,
        { cookie },
      )
      expect(out.status).not.toBe(200)
    })
  })

  describe('the built app', () => {
    it('serves a built file, and marks a hashed one as never changing', async () => {
      const response = await get('/assets/app-1a2b.js', { cookie })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('console.log(1)')
      expect(response.headers.get('cache-control')).toMatch('immutable')
    })

    it('falls back to the page for a path that names no file', async () => {
      for (const path of ['/skills/thank-you-note', '/assets/gone.js', '/assets']) {
        const response = await get(path, { cookie })
        expect(response.status).toBe(200)
        expect(await response.text()).toMatch('<body>app</body>')
        expect(response.headers.get('content-security-policy')).toBeTruthy()
      }
    })

    it('finds nothing outside the built folder', async () => {
      for (const path of ['/%2e%2e%2fsecret.txt', '/assets/..%2f..%2fsecret.txt', '/%E0%A4%A']) {
        const response = await get(path, { cookie })
        expect(response.status).toBe(404)
        expect(await response.text()).not.toMatch('outside')
      }
    })
  })

  describe('a request body', () => {
    it('is refused past the limit when its length says so, before it is read', async () => {
      const { status, body } = await rawPost(
        '/api/library.skills',
        { 'content-length': String(MAX_BODY + 1) },
        ['{'],
      )
      expect(status).toBe(413)
      expect(JSON.parse(body).error).toMatch('at most')
    })

    it('is refused past the limit when it arrives in pieces with no length', async () => {
      const piece = `"${'x'.repeat(600)}",`
      const { status } = await rawPost('/api/library.skills', {}, ['[', piece, piece, '0]'])
      expect(status).toBe(413)
    })

    it('is read when it fits', async () => {
      const { status } = await rawPost('/api/library.skills', {}, ['{', '}'])
      expect(status).toBe(200)
    })
  })
})
