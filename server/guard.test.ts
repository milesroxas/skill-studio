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
})
