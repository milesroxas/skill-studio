import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertSafe, assertSafePath, readJson, writeJson } from './fs.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-fs-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('readJson', () => {
  it('reads a file, and the fallback when there is none', () => {
    writeFileSync(join(dir, 'a.json'), '{"n": 1}')
    expect(readJson(join(dir, 'a.json'), null)).toEqual({ n: 1 })
    expect(readJson(join(dir, 'none.json'), { none: true })).toEqual({ none: true })
  })

  it('names a file that does not parse instead of reading it as the fallback', () => {
    const path = join(dir, 'torn.json')
    writeFileSync(path, '{"n": 1')
    expect(() => readJson(path, null)).toThrow(`${path} is malformed`)
  })
})

describe('writeJson', () => {
  it('writes the file whole and leaves no temporary file behind', () => {
    const path = join(dir, 'deep', 'b.json')
    writeJson(path, { ok: true })
    expect(readFileSync(path, 'utf8')).toBe('{\n  "ok": true\n}\n')
    expect(readdirSync(join(dir, 'deep'))).toEqual(['b.json'])
  })

  it('replaces an existing file', () => {
    const path = join(dir, 'c.json')
    writeJson(path, 1)
    writeJson(path, 2)
    expect(readJson(path, null)).toBe(2)
  })
})

describe('assertSafe', () => {
  it('returns a plain name', () => {
    expect(assertSafe('run-1.2_x', 'run')).toBe('run-1.2_x')
  })

  it.each(['', null, undefined, '.', '..', '.hidden', 'a/b', 'a\\b', 'a b', '-flag'])(
    'rejects %j',
    (value) => {
      expect(() => assertSafe(value, 'run')).toThrow('Bad run.')
    },
  )
})

describe('assertSafePath', () => {
  it('accepts nested safe segments', () => {
    expect(assertSafePath('references/style/tone.md', 'path')).toBe('references/style/tone.md')
  })

  it.each([
    '',
    null,
    '../SKILL.md',
    'references/../../etc/passwd',
    'references/./x.md',
    '/etc/passwd',
    'references//x.md',
    'references/',
    'references/.env',
    'C:\\Windows',
  ])('rejects %j', (value) => {
    expect(() => assertSafePath(value, 'path')).toThrow('Bad path.')
  })
})
