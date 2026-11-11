import { describe, expect, it } from 'vitest'
import { artifactPolicy, sampleRequest, servedFile, withStageBridge } from './artifact-page.ts'

const page = (html: string, type = 'text/html; charset=utf-8') => ({
  bytes: new TextEncoder().encode(html),
  type,
})
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('artifactPolicy', () => {
  const policy = artifactPolicy('artifact:')

  it('lets a page run its scripts, sandboxed in an origin of its own', () => {
    expect(policy).toContain('sandbox allow-scripts;')
    expect(policy).not.toContain('allow-same-origin')
    expect(policy).not.toMatch(/allow-(forms|popups|top-navigation|modals)/)
    expect(policy).toContain("script-src 'unsafe-inline' 'unsafe-eval' artifact: blob:")
  })

  it('loads nothing from the network: only the sample’s own files and inline data', () => {
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("connect-src 'none'")
    expect(policy).not.toMatch(/https?:|\*/)
  })
})

describe('withStageBridge', () => {
  it('goes before the last </body>, whatever its case', () => {
    const html = withStageBridge('<p>a</p></BODY></html>')
    expect(html.indexOf('data-skill-studio-stage')).toBeLessThan(html.indexOf('</BODY>'))
    expect(html.endsWith('</BODY></html>')).toBe(true)
  })

  it('goes at the end of a page with no body tag', () => {
    expect(withStageBridge('<p>a</p>')).toMatch(/^<p>a<\/p><script data-skill-studio-stage>/)
  })
})

describe('servedFile', () => {
  it('adds the stage’s script only to a page the stage asked for', () => {
    const html = page('<body>hi</body>')
    expect(text(servedFile(html, { stage: true, own: 'artifact:' }).bytes)).toContain(
      'data-skill-studio-stage',
    )
    expect(text(servedFile(html, { stage: false, own: 'artifact:' }).bytes)).toBe('<body>hi</body>')
  })

  it('leaves any other file as written, under the same policy', () => {
    const css = page('body{}', 'text/css; charset=utf-8')
    const served = servedFile(css, { stage: true, own: "'self'" })
    expect(text(served.bytes)).toBe('body{}')
    expect(served.headers).toEqual({
      'content-type': 'text/css; charset=utf-8',
      'content-security-policy': artifactPolicy("'self'"),
    })
  })
})

describe('sampleRequest', () => {
  it('reads the file from the path and the stage from the query', () => {
    expect(
      sampleRequest('/%2Fs/run/case-s1/outputs/index.html', new URLSearchParams('stage=1')),
    ).toEqual({
      address: { skill: '/s', run: 'run', sample: 'case-s1', file: 'outputs/index.html' },
      stage: true,
    })
    expect(sampleRequest('/s/run/case-s1/a.css', new URLSearchParams())?.stage).toBe(false)
    expect(sampleRequest('/s/run', new URLSearchParams())).toBeNull()
  })
})
