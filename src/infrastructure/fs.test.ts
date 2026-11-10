import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { failRenames } from './__fixtures__/fs.ts'
import {
  assertInside,
  assertSafe,
  assertSafePath,
  readJson,
  readTree,
  writeJson,
  writeText,
} from './fs.ts'

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

describe('assertSafePath, on names people give files', () => {
  it.each(['outputs/Cover Letter.md', 'references/résumé.md', 'references/notes (1).md'])(
    'accepts %j',
    (value) => {
      expect(assertSafePath(value, 'path')).toBe(value)
    },
  )

  it.each(['references/a\nb.md', 'references/..', `references/${'x'.repeat(256)}`])(
    'rejects %j',
    (value) => {
      expect(() => assertSafePath(value, 'path')).toThrow('Bad path.')
    },
  )

  it.each([
    'references/a.md:x',
    'references/a<b.md',
    'references/a>b.md',
    'references/"quoted".md',
    'references/a|b.md',
    'references/why?.md',
    'references/*.md',
  ])('rejects %j, which Windows cannot name, on every system', (value) => {
    expect(() => assertSafePath(value, 'path')).toThrow('Bad path.')
  })
})

describe('assertSafePath, on Windows', () => {
  const platform = process.platform
  beforeEach(() => Object.defineProperty(process, 'platform', { value: 'win32' }))
  afterEach(() => Object.defineProperty(process, 'platform', { value: platform }))

  it.each([
    'con',
    'references/CON',
    'references/nul.md',
    'references/Aux.tar.gz',
    'references/prn.txt',
    'references/com1.md',
    'references/LPT9',
    'references/com¹.md',
    'references/notes.',
    'references/notes ',
  ])('rejects the device name or trailing dot or space in %j', (value) => {
    expect(() => assertSafePath(value, 'path')).toThrow('Bad path.')
  })

  it.each([
    'references/console.md',
    'references/nullable.md',
    'references/com10.md',
    'references/API guide é.md',
  ])('accepts %j', (value) => {
    expect(assertSafePath(value, 'path')).toBe(value)
  })
})

describe.skipIf(process.platform === 'win32')('assertSafePath, elsewhere', () => {
  it('accepts a name Windows keeps for a device', () => {
    expect(assertSafePath('references/con.md', 'path')).toBe('references/con.md')
  })
})

describe('writeText', () => {
  it('writes the file whole, makes its folder and leaves no temporary file', () => {
    writeText(join(dir, 'deep/note.md'), 'one')
    writeText(join(dir, 'deep/note.md'), 'two')
    expect(readFileSync(join(dir, 'deep/note.md'), 'utf8')).toBe('two')
    expect(readdirSync(join(dir, 'deep'))).toEqual(['note.md'])
  })

  it('takes its temporary file away when the file cannot be replaced', () => {
    writeText(join(dir, 'note.md'), 'one')
    const undo = failRenames(() => true)
    try {
      expect(() => writeText(join(dir, 'note.md'), 'two')).toThrow('EBUSY')
    } finally {
      undo()
    }
    expect(readdirSync(dir)).toEqual(['note.md'])
    expect(readFileSync(join(dir, 'note.md'), 'utf8')).toBe('one')
  })
})

describe.skipIf(process.platform === 'win32')('writeText and a link', () => {
  let outside: string
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'st-fs-outside-'))
    writeFileSync(join(outside, 'theirs.md'), 'theirs')
    mkdirSync(join(dir, 'shared'))
    writeFileSync(join(dir, 'shared/real.md'), 'one')
  })
  afterEach(() => rmSync(outside, { recursive: true, force: true }))

  it('writes through a link to a file inside the root, and the link stays a link', () => {
    symlinkSync(join(dir, 'shared/real.md'), join(dir, 'alias.md'))
    writeText(join(dir, 'alias.md'), 'two', { root: dir })
    expect(lstatSync(join(dir, 'alias.md')).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(dir, 'shared/real.md'), 'utf8')).toBe('two')
    expect(readdirSync(join(dir, 'shared'))).toEqual(['real.md'])
  })

  it('replaces a link out of the root with the file, and never writes where it led', () => {
    symlinkSync(join(outside, 'theirs.md'), join(dir, 'away.md'))
    writeText(join(dir, 'away.md'), 'mine', { root: dir })
    expect(lstatSync(join(dir, 'away.md')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(outside, 'theirs.md'), 'utf8')).toBe('theirs')
  })
})

describe.skipIf(process.platform === 'win32')('links that leave the folder', () => {
  let outside: string
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'st-fs-outside-'))
    writeFileSync(join(outside, 'secret.md'), 'theirs')
    mkdirSync(join(dir, 'in'))
    writeFileSync(join(dir, 'in/own.md'), 'mine')
  })
  afterEach(() => rmSync(outside, { recursive: true, force: true }))

  it('assertInside takes a file in the folder, there or not yet, and a link that stays in it', () => {
    symlinkSync(join(dir, 'in/own.md'), join(dir, 'alias.md'))
    for (const path of ['in/own.md', 'in/new.md', 'new/deep/file.md', 'alias.md'])
      expect(assertInside(dir, join(dir, path))).toBe(join(dir, path))
  })

  it('assertInside refuses a link out of the folder, a file under one, and a link to nothing', () => {
    symlinkSync(join(outside, 'secret.md'), join(dir, 'file-link.md'))
    symlinkSync(outside, join(dir, 'dir-link'))
    symlinkSync(join(outside, 'gone.md'), join(dir, 'dangling.md'))
    for (const path of ['file-link.md', 'dir-link/new.md', 'dangling.md', '../elsewhere.md'])
      expect(() => assertInside(dir, join(dir, path))).toThrow('leads outside')
  })

  it('readTree reads what is in the folder and passes over links out of it, to nothing, or in a loop', () => {
    symlinkSync(join(outside, 'secret.md'), join(dir, 'in/secret.md'))
    symlinkSync(outside, join(dir, 'in/away'))
    symlinkSync(join(outside, 'gone.md'), join(dir, 'in/dangling.md'))
    symlinkSync(join(dir, 'in'), join(dir, 'in/again'))
    expect(readTree(dir)).toEqual({ 'in/own.md': 'mine' })
  })
})
