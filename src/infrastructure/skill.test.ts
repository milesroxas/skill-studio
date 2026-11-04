import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteSkillFile, editablePath, skillFiles, skillHash, writeSkillFile } from './skill.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-skill-'))
  writeFileSync(join(dir, 'SKILL.md'), 'v1')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('editablePath', () => {
  it.each(['SKILL.md', 'references/a.md', 'references/deep/b.md'])('allows %s', (path) => {
    expect(editablePath(path)).toBe(path)
  })

  it.each(['README.md', 'evals/bench.json', 'references', 'scripts/run.sh', 'skill.md'])(
    'refuses %s',
    (path) => {
      expect(() => editablePath(path)).toThrow('Only SKILL.md')
    },
  )

  it.each(['../SKILL.md', 'references/../evals/bench.json', '/tmp/SKILL.md'])(
    'refuses traversal %s',
    (path) => {
      expect(() => editablePath(path)).toThrow('Bad path.')
    },
  )
})

describe('writeSkillFile', () => {
  it('writes when previous matches disk', () => {
    writeSkillFile(dir, 'SKILL.md', 'v2', 'v1')
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe('v2')
  })

  it('refuses when the file changed on disk', () => {
    expect(() => writeSkillFile(dir, 'SKILL.md', 'v2', 'stale')).toThrow('changed on disk')
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe('v1')
  })

  it('refuses to create over an existing file', () => {
    expect(() => writeSkillFile(dir, 'SKILL.md', 'v2', null)).toThrow('already exists')
  })

  it('refuses to edit a file deleted on disk', () => {
    expect(() => writeSkillFile(dir, 'references/gone.md', 'x', 'old')).toThrow('deleted on disk')
  })

  it('creates a new reference with its folders', () => {
    writeSkillFile(dir, 'references/a/b.md', 'new', null)
    expect(readFileSync(join(dir, 'references/a/b.md'), 'utf8')).toBe('new')
  })

  it('never writes outside the editable set', () => {
    expect(() => writeSkillFile(dir, '../escape.md', 'x', null)).toThrow()
    expect(() => writeSkillFile(dir, 'evals/bench.json', '{}', null)).toThrow()
    expect(existsSync(join(dir, '..', 'escape.md'))).toBe(false)
    expect(existsSync(join(dir, 'evals'))).toBe(false)
  })
})

describe('deleteSkillFile', () => {
  it('removes a reference and the folders it left empty', () => {
    mkdirSync(join(dir, 'references/a'), { recursive: true })
    writeFileSync(join(dir, 'references/a/b.md'), 'x')
    deleteSkillFile(dir, 'references/a/b.md')
    expect(existsSync(join(dir, 'references'))).toBe(false)
    expect(existsSync(join(dir, 'SKILL.md'))).toBe(true)
  })

  it('refuses SKILL.md', () => {
    expect(() => deleteSkillFile(dir, 'SKILL.md')).toThrow('cannot be deleted')
  })
})

describe('skillFiles and skillHash', () => {
  it('reads SKILL.md and references only, and hashes by content', () => {
    mkdirSync(join(dir, 'references'))
    writeFileSync(join(dir, 'references/r.md'), 'ref')
    writeFileSync(join(dir, 'README.md'), 'ignored')
    const files = skillFiles(dir)
    expect(files).toEqual({ 'SKILL.md': 'v1', 'references/r.md': 'ref' })
    expect(skillHash(files)).toBe(skillHash({ 'references/r.md': 'ref', 'SKILL.md': 'v1' }))
    expect(skillHash(files)).not.toBe(skillHash({ ...files, 'SKILL.md': 'v2' }))
  })
})
