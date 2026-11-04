import { describe, expect, it } from 'vitest'
import { refusal } from './guard.ts'

const json = { 'content-type': 'application/json' }

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
})
