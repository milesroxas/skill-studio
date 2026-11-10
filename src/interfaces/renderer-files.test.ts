import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { rendererFile } from './renderer-files.ts'

const root = mkdtempSync(join(tmpdir(), 'renderer-files-'))
const dir = join(root, 'renderer')
mkdirSync(join(dir, 'assets'), { recursive: true })
writeFileSync(join(dir, 'index.html'), '<html><head></head></html>')
writeFileSync(join(dir, 'assets', 'app-1a2b.js'), '')
writeFileSync(join(dir, 'assets', 'a b.css'), '')
writeFileSync(join(dir, 'icon.png'), '')
writeFileSync(join(root, 'secret.txt'), 'outside')
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('rendererFile', () => {
  const index = { path: join(dir, 'index.html'), html: true, hashed: false }

  it('serves the page at the root, and for any path that names no file', () => {
    expect(rendererFile(dir, '/')).toEqual(index)
    expect(rendererFile(dir, '/index.html')).toEqual(index)
    expect(rendererFile(dir, '/skills/thank-you-note')).toEqual(index)
    expect(rendererFile(dir, '/assets')).toEqual(index)
    expect(rendererFile(dir, '/assets/gone.js')).toEqual(index)
  })

  it('marks a file under assets as one that never changes', () => {
    expect(rendererFile(dir, '/assets/app-1a2b.js')).toEqual({
      path: join(dir, 'assets', 'app-1a2b.js'),
      html: false,
      hashed: true,
    })
    expect(rendererFile(dir, '/icon.png')).toMatchObject({ html: false, hashed: false })
  })

  it('decodes the path', () => {
    expect(rendererFile(dir, '/assets/a%20b.css')?.path).toBe(join(dir, 'assets', 'a b.css'))
  })

  it('finds nothing outside the folder, however the path is written', () => {
    expect(rendererFile(dir, '/../secret.txt')).toBeNull()
    expect(rendererFile(dir, '/%2e%2e/secret.txt')).toBeNull()
    expect(rendererFile(dir, '/%2e%2e%2fsecret.txt')).toBeNull()
    expect(rendererFile(dir, '/assets/..%2f..%2fsecret.txt')).toBeNull()
    expect(rendererFile(dir, '/..%5csecret.txt')).toBeNull()
  })

  it('finds nothing for a path that does not decode', () => {
    expect(rendererFile(dir, '/%E0%A4%A')).toBeNull()
    expect(rendererFile(dir, '/a%00b')).toBeNull()
  })
})
