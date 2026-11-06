import { describe, expect, it } from 'vitest'
import { canReset, isPrerelease } from './reset.ts'

describe('isPrerelease', () => {
  it('knows a version with a suffix', () => {
    expect(isPrerelease('0.1.0-beta.2')).toBe(true)
    expect(isPrerelease('1.2.0-rc.1')).toBe(true)
  })

  it('takes a finished version for what it is', () => {
    expect(isPrerelease('1.2.0')).toBe(false)
    // Build metadata names a build of the release, not a version ahead of it.
    expect(isPrerelease('1.2.0+20261105')).toBe(false)
  })

  it('reads anything that is no version as finished, so the doubt hides the reset', () => {
    expect(isPrerelease('')).toBe(false)
    expect(isPrerelease('1.2.0-')).toBe(false)
    expect(isPrerelease('beta')).toBe(false)
  })
})

describe('canReset', () => {
  it('offers a reset in a packaged prerelease', () => {
    expect(canReset({ version: '0.1.0-beta.2', packaged: true })).toBe(true)
  })

  it('offers none in a finished release', () => {
    expect(canReset({ version: '1.0.0', packaged: true })).toBe(false)
  })

  it('offers one in a development build, whatever its version', () => {
    expect(canReset({ version: '1.0.0', packaged: false })).toBe(true)
  })
})
