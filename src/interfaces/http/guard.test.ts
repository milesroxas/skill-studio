import { describe, expect, it } from 'vitest'
import {
  artifactPathOf,
  type Decision,
  decide,
  newToken,
  type Remote,
  ticketBook,
} from './guard.ts'

const json = { 'content-type': 'application/json' }
const token = newToken()
/** The cookie a signed-in browser sends to a server on `port`. */
const cookie = (port: number, value = token) => ({ cookie: `st_token_${port}=${value}` })

/**
 * Why a request is refused for where it comes from, or null when it is served.
 * It carries the cookie of every port these tests use, so only the origin decides.
 */
function refusal(
  method: string,
  headers: Record<string, string>,
  remote?: Remote | null,
): string | null {
  const signedIn = [4400, 80, 8443, 443].map((port) => `st_token_${port}=${token}`).join('; ')
  const decision = decide(
    { method, url: '/', headers: { cookie: signedIn, ...headers } },
    { token, remote },
  )
  return decision.kind === 'refuse' ? decision.error : null
}

const local = (
  method: string,
  url: string,
  headers: Record<string, string> = {},
  remote?: Remote | null,
): Decision =>
  decide({ method, url, headers: { host: 'localhost:4400', ...headers } }, { token, remote })

describe('refusal', () => {
  it.each(['localhost:4400', '127.0.0.1:4400', '[::1]:4400', 'localhost'])(
    'serves the app on %s',
    (host) => {
      expect(refusal('GET', { host, 'sec-fetch-site': 'same-origin' })).toBeNull()
      expect(refusal('POST', { host, origin: `http://${host}`, ...json })).toBeNull()
    },
  )

  it('serves the CLI and other tools that send no browser headers', () => {
    expect(refusal('POST', { host: '127.0.0.1:4400', ...json })).toBeNull()
  })

  it('refuses a rebound host name', () => {
    expect(refusal('GET', { host: 'evil.example:4400' })).toMatch('localhost')
    expect(refusal('GET', {})).toMatch('localhost')
  })

  it('refuses another site, by origin or by fetch metadata', () => {
    const host = 'localhost:4400'
    expect(refusal('POST', { host, origin: 'https://evil.example', ...json })).toMatch(
      'other sites',
    )
    expect(refusal('POST', { host, origin: 'http://localhost:5173', ...json })).toMatch(
      'other sites',
    )
    expect(refusal('POST', { host, origin: 'null', ...json })).toMatch('other sites')
    expect(refusal('GET', { host, 'sec-fetch-site': 'cross-site' })).toMatch('other sites')
  })

  it('refuses a POST that is not JSON, which a page could send without a preflight', () => {
    expect(refusal('POST', { host: 'localhost:4400', 'content-type': 'text/plain' })).toMatch(
      'application/json',
    )
    expect(refusal('POST', { host: 'localhost:4400' })).toMatch('application/json')
  })

  describe('on a tailnet host', () => {
    const remote = { host: 'mac.tail1234.ts.net', users: ['me@github'] }
    const host = 'mac.tail1234.ts.net:8443'
    const origin = `https://${host}`
    const me = { host, 'tailscale-user-login': 'me@github' }

    it('serves the allowed user', () => {
      expect(refusal('GET', { ...me, 'sec-fetch-site': 'same-origin' }, remote)).toBeNull()
      expect(refusal('POST', { ...me, origin, ...json }, remote)).toBeNull()
    })

    it('refuses it when remote access is off', () => {
      expect(refusal('GET', me)).toMatch('localhost')
      expect(refusal('GET', me, null)).toMatch('localhost')
    })

    it('refuses requests with no login, as Funnel and tagged devices send', () => {
      expect(refusal('GET', { host }, remote)).toMatch('Tailscale user')
      expect(refusal('GET', { host, 'tailscale-user-login': '' }, remote)).toMatch('Tailscale user')
    })

    it('refuses other tailnet users', () => {
      expect(refusal('GET', { host, 'tailscale-user-login': 'you@github' }, remote)).toMatch(
        'Tailscale user',
      )
    })

    it('refuses other host names, even with a login', () => {
      const evil = { host: 'evil.example', 'tailscale-user-login': 'me@github' }
      expect(refusal('GET', evil, remote)).toMatch('localhost')
      const sibling = { host: 'other.tail1234.ts.net', 'tailscale-user-login': 'me@github' }
      expect(refusal('GET', sibling, remote)).toMatch('localhost')
    })

    it('refuses a proxied request that claims to be localhost', () => {
      const via = { 'x-forwarded-for': '100.64.0.9', 'tailscale-user-login': 'you@github' }
      expect(refusal('GET', { host: 'localhost:4400', ...via }, remote)).toMatch('localhost')
      expect(refusal('GET', { host: '127.0.0.1', ...via }, remote)).toMatch('localhost')
      expect(refusal('GET', { host: 'localhost', ...via })).toMatch('localhost')
      const mine = { ...via, 'tailscale-user-login': 'me@github' }
      expect(refusal('GET', { host: 'localhost', ...mine }, remote)).toMatch('localhost')
      expect(refusal('GET', { host: 'localhost', 'tailscale-headers-info': 'x' })).toMatch(
        'localhost',
      )
      const loginOnly = { host: 'localhost:4400', 'tailscale-user-login': 'me@github' }
      expect(refusal('GET', loginOnly, remote)).toMatch('localhost')
      expect(refusal('GET', loginOnly)).toMatch('localhost')
    })

    it('still refuses other sites', () => {
      expect(refusal('POST', { ...me, origin: 'https://evil.example', ...json }, remote)).toMatch(
        'other sites',
      )
      expect(refusal('GET', { ...me, 'sec-fetch-site': 'cross-site' }, remote)).toMatch(
        'other sites',
      )
    })
  })

  describe('the token', () => {
    it('refuses a local request with no token, and says where to find it', () => {
      for (const decision of [local('GET', '/'), local('POST', '/api/jobs.list', json)]) {
        expect(decision).toMatchObject({ kind: 'refuse', status: 401 })
        expect(decision.kind === 'refuse' && decision.error).toMatch('address `st serve` printed')
      }
    })

    it('refuses a wrong token, in the address or in the cookie', () => {
      expect(local('GET', `/?token=${newToken()}`)).toMatchObject({ kind: 'refuse', status: 401 })
      expect(local('GET', '/?token=')).toMatchObject({ kind: 'refuse', status: 401 })
      expect(local('GET', `/?token=${token}x`)).toMatchObject({ kind: 'refuse', status: 401 })
      expect(local('GET', '/', cookie(4400, newToken()))).toMatchObject({ status: 401 })
      expect(local('GET', '/', cookie(4400, ''))).toMatchObject({ status: 401 })
    })

    it('trades a token in a page address for a cookie, and goes on without it', () => {
      expect(local('GET', `/?token=${token}`)).toEqual({
        kind: 'sign-in',
        cookie: `st_token_4400=${token}; HttpOnly; SameSite=Strict; Path=/`,
        location: '/',
      })
      expect(local('GET', `/api/artifact?skill=%2Fa%20b&token=${token}&run=r`)).toMatchObject({
        kind: 'sign-in',
        location: '/api/artifact?skill=%2Fa+b&run=r',
      })
    })

    it('serves a request that carries the cookie', () => {
      expect(local('GET', '/', cookie(4400))).toEqual({ kind: 'serve' })
      expect(local('POST', '/api/jobs.list', { ...json, ...cookie(4400) })).toEqual({
        kind: 'serve',
      })
      const among = { cookie: `theme=dark; st_token_4400=${token}; other=1` }
      expect(local('GET', '/', among)).toEqual({ kind: 'serve' })
    })

    it('serves a tool that sends the token with each POST', () => {
      expect(local('POST', `/api/jobs.list?token=${token}`, json)).toEqual({ kind: 'serve' })
    })

    it('keeps the cookie of a server on another port apart', () => {
      expect(local('GET', '/', cookie(4401))).toMatchObject({ kind: 'refuse', status: 401 })
    })

    it('checks where a request comes from before its token', () => {
      const elsewhere = { 'sec-fetch-site': 'cross-site', ...cookie(4400) }
      expect(local('GET', `/?token=${token}`, elsewhere)).toMatchObject({
        kind: 'refuse',
        status: 403,
      })
      const rebound = decide(
        { method: 'GET', url: `/?token=${token}`, headers: { host: 'evil.example:4400' } },
        { token },
      )
      expect(rebound).toMatchObject({ kind: 'refuse', status: 403 })
    })

    describe('on the tailnet', () => {
      const remote = { host: 'mac.tail1234.ts.net', users: ['me@github'] }
      const host = 'mac.tail1234.ts.net:8443'
      const tailnet = (url: string, headers: Record<string, string> = {}) =>
        decide(
          {
            method: 'GET',
            url,
            headers: { host, 'tailscale-user-login': 'me@github', ...headers },
          },
          { token, remote },
        )

      it('asks the token of a request Tailscale signed in, as of any other', () => {
        expect(tailnet('/')).toMatchObject({ kind: 'refuse', status: 401 })
        expect(tailnet('/', { cookie: `st_token_8443=${token}` })).toEqual({ kind: 'serve' })
        // The same server still wants the token from this machine's own accounts.
        expect(local('GET', '/', {}, remote)).toMatchObject({ kind: 'refuse', status: 401 })
      })

      it('refuses another account on this machine that sends the headers `tailscale serve` adds', () => {
        // Any program here can reach 127.0.0.1 with the tailnet name and the owner's login.
        const forged = decide(
          {
            method: 'POST',
            url: '/api/skill.generate',
            headers: { host: remote.host, 'tailscale-user-login': 'me@github', ...json },
          },
          { token, remote },
        )
        expect(forged).toMatchObject({ kind: 'refuse', status: 401 })
      })

      it('still checks the login of a request that carries the token', () => {
        const other = decide(
          {
            method: 'GET',
            url: `/?token=${token}`,
            headers: { host, 'tailscale-user-login': 'you@github' },
          },
          { token, remote },
        )
        expect(other).toMatchObject({ kind: 'refuse', status: 403 })
      })

      it('trades the token for a cookie sent over HTTPS only', () => {
        expect(tailnet(`/?token=${token}`)).toEqual({
          kind: 'sign-in',
          cookie: `st_token_8443=${token}; HttpOnly; SameSite=Strict; Path=/; Secure`,
          location: '/',
        })
        const on443 = decide(
          {
            method: 'GET',
            url: `/?token=${token}`,
            headers: { host: remote.host, 'tailscale-user-login': 'me@github' },
          },
          { token, remote },
        )
        expect(on443).toMatchObject({ cookie: expect.stringMatching(/^st_token_443=/) })
      })
    })

    describe('a ticket', () => {
      const withTickets = (tickets: ReturnType<typeof ticketBook>) => ({ token, tickets })
      const load = (url: string, access: ReturnType<typeof withTickets>, extra = {}) =>
        decide({ method: 'GET', url, headers: { host: 'localhost:4400', ...extra } }, access)

      it('is traded once for the cookie, and the address goes on without it', () => {
        const access = withTickets(ticketBook())
        const ticket = access.tickets.issue()
        expect(load(`/?ticket=${ticket}`, access)).toEqual({
          kind: 'sign-in',
          cookie: `st_token_4400=${token}; HttpOnly; SameSite=Strict; Path=/`,
          location: '/',
        })
        const again = load(`/?ticket=${ticket}`, access)
        expect(again).toMatchObject({ kind: 'refuse', status: 401 })
        expect(again.kind === 'refuse' && again.error).toMatch('works once')
      })

      it('is worth nothing after its minute', () => {
        let now = 1_000
        const access = withTickets(ticketBook(60_000, () => now))
        const ticket = access.tickets.issue()
        now += 60_001
        expect(load(`/?ticket=${ticket}`, access)).toMatchObject({ kind: 'refuse', status: 401 })
      })

      it('is only one the server issued, and never stands in for the token on a call', () => {
        const access = withTickets(ticketBook())
        expect(load(`/?ticket=${newToken()}`, access)).toMatchObject({ status: 401 })
        expect(load(`/?ticket=${token}`, access)).toMatchObject({ status: 401 })
        const ticket = access.tickets.issue()
        const call = decide(
          {
            method: 'POST',
            url: `/api/jobs.list?ticket=${ticket}`,
            headers: { host: 'localhost:4400', ...json },
          },
          access,
        )
        expect(call).toMatchObject({ kind: 'refuse', status: 401 })
      })

      it('sends a reader who is signed in already on without the used one', () => {
        const access = withTickets(ticketBook())
        const ticket = access.tickets.issue()
        load(`/?ticket=${ticket}`, access)
        expect(load(`/?ticket=${ticket}&x=1`, access, cookie(4400))).toMatchObject({
          kind: 'sign-in',
          location: '/?x=1',
        })
      })
    })

    it('makes a new token each time, long enough not to be guessed', () => {
      expect(newToken()).not.toBe(newToken())
      expect(Buffer.from(newToken(), 'base64url')).toHaveLength(32)
      expect(newToken()).toMatch(/^[\w-]+$/)
    })
  })
})

describe('a sample’s file, by the artifact key', () => {
  const artifactKey = newToken()
  const access = { token, artifactKey }
  const file = `/api/artifact/${artifactKey}/%2Fskill/run-1/case-s1/outputs/app.js`
  // What a page an agent wrote sends for the file beside it: no cookie, and an origin of its own.
  const ownRequest = { host: 'localhost:4400', 'sec-fetch-site': 'cross-site', origin: 'null' }

  it('is served without the cookie, from the page’s own origin', () => {
    expect(decide({ method: 'GET', url: file, headers: ownRequest }, access)).toEqual({
      kind: 'serve',
    })
  })

  it('still comes from this machine, and is only read', () => {
    const rebound = { ...ownRequest, host: 'evil.example' }
    expect(decide({ method: 'GET', url: file, headers: rebound }, access).kind).toBe('refuse')
    expect(decide({ method: 'POST', url: file, headers: ownRequest }, access).kind).toBe('refuse')
  })

  it('needs this start’s key, which opens nothing else', () => {
    const wrong = file.replace(artifactKey, newToken())
    expect(decide({ method: 'GET', url: wrong, headers: ownRequest }, access).kind).toBe('refuse')
    expect(decide({ method: 'GET', url: file, headers: ownRequest }, { token }).kind).toBe('refuse')
    const api = `/api/${artifactKey}/skill.read`
    expect(decide({ method: 'GET', url: api, headers: ownRequest }, access).kind).toBe('refuse')
  })

  it('names the file after the key', () => {
    expect(artifactPathOf(file, access)).toBe('/%2Fskill/run-1/case-s1/outputs/app.js')
    expect(artifactPathOf(`/api/artifact/${artifactKey}`, access)).toBeNull()
    expect(artifactPathOf('/api/artifact//x/y/z/f', access)).toBeNull()
  })
})
