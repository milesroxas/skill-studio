import { describe, expect, it } from 'vitest'
import { artifactAddress, artifactPath } from './artifact-address.ts'

describe('artifactPath', () => {
  const page = {
    skill: '/Users/me/skills/pricing page',
    run: 'v1-sonnet-2026-11-10',
    sample: 'pricing-s1',
    file: 'outputs/site/index.html',
  }

  it('keeps the skill in one segment and the file as folders', () => {
    expect(artifactPath(page)).toBe(
      '/%2FUsers%2Fme%2Fskills%2Fpricing%20page/v1-sonnet-2026-11-10/pricing-s1/outputs/site/index.html',
    )
  })

  it('reads back what it writes', () => {
    expect(artifactAddress(artifactPath(page))).toEqual(page)
  })

  it('resolves a page’s relative file beside it, in the same sample', () => {
    const url = new URL('app.js', `artifact://sample${artifactPath(page)}`)
    expect(artifactAddress(url.pathname)).toEqual({ ...page, file: 'outputs/site/app.js' })
  })

  it('keeps an empty skill, which means the first one served', () => {
    expect(artifactAddress(artifactPath({ ...page, skill: '' }))).toEqual({ ...page, skill: '' })
  })

  it('names no file for a path too short, with an empty part, or that does not decode', () => {
    expect(artifactAddress('/skill/run/sample')).toBeNull()
    expect(artifactAddress('/skill/run/sample/outputs//a.html')).toBeNull()
    expect(artifactAddress('/skill/run/sample/%E0%A4%A')).toBeNull()
    expect(artifactAddress('/skill//sample/a.html')).toBeNull()
  })
})
