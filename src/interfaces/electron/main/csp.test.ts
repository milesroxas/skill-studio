import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, withStyleNonce } from './csp.ts'

const styleSrc = (policy: string) => policy.split('; ').find((d) => d.startsWith('style-src '))

describe('contentSecurityPolicy', () => {
  it('blocks every inline style tag in the built app by default', () => {
    expect(styleSrc(contentSecurityPolicy())).toBe("style-src 'self'")
  })

  it("lets only the page's own nonce through for the editor's style tag", () => {
    expect(styleSrc(contentSecurityPolicy({ styleNonce: 'abc' }))).toBe(
      "style-src 'self' 'nonce-abc'",
    )
  })

  it('keeps inline styles open on the dev server, where a nonce would switch them off', () => {
    expect(styleSrc(contentSecurityPolicy({ nonce: 'dev', styleNonce: 'abc' }))).toBe(
      "style-src 'self' 'unsafe-inline'",
    )
  })
})

describe('withStyleNonce', () => {
  it('puts the nonce in a csp-nonce meta tag at the top of the head', () => {
    expect(withStyleNonce('<html><head><title>x</title></head></html>', 'abc')).toBe(
      '<html><head><meta property="csp-nonce" nonce="abc" /><title>x</title></head></html>',
    )
  })
})
