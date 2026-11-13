import {
  chmodSync,
  type Dirent,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { failRenames, patchFs } from './__fixtures__/fs.ts'
import {
  deleteSkillFile,
  editablePath,
  skillFiles,
  skillHash,
  skillHead,
  skillIdentity,
  skillInfo,
  snapshotSkill,
  writeSkillFile,
} from './skill.ts'

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

describe('names people give reference files', () => {
  it('writes and deletes a file whose name has a space or an accent', () => {
    writeSkillFile(dir, 'references/API guide é.md', 'x', null)
    expect(skillFiles(dir)['references/API guide é.md']).toBe('x')
    deleteSkillFile(dir, 'references/API guide é.md')
    expect(existsSync(join(dir, 'references'))).toBe(false)
  })

  it('leaves no temporary file beside the one it writes', () => {
    writeSkillFile(dir, 'SKILL.md', 'v2', 'v1')
    expect(readdirSync(dir)).toEqual(['SKILL.md'])
  })
})

describe.skipIf(process.platform === 'win32')('a link that leads out of the skill', () => {
  let outside: string
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'st-skill-outside-'))
    writeFileSync(join(outside, 'theirs.md'), 'theirs')
  })
  afterEach(() => rmSync(outside, { recursive: true, force: true }))

  it('is never written through, whether the link is the folder or the file', () => {
    symlinkSync(outside, join(dir, 'references'))
    expect(() => writeSkillFile(dir, 'references/new.md', 'x', null)).toThrow('leads outside')
    expect(() => writeSkillFile(dir, 'references/theirs.md', 'x', 'theirs')).toThrow(
      'leads outside',
    )
    expect(readdirSync(outside)).toEqual(['theirs.md'])
    expect(readFileSync(join(outside, 'theirs.md'), 'utf8')).toBe('theirs')
  })

  it("is never deleted through, and what it points at is not read as the skill's", () => {
    mkdirSync(join(dir, 'references'))
    symlinkSync(join(outside, 'theirs.md'), join(dir, 'references/link.md'))
    expect(skillFiles(dir)).toEqual({ 'SKILL.md': 'v1' })
    expect(() => deleteSkillFile(dir, 'references/link.md')).toThrow('leads outside')
    expect(existsSync(join(outside, 'theirs.md'))).toBe(true)
  })
})

describe('skillIdentity', () => {
  it('is the hash of SKILL.md and references alone for a skill with nothing else', () => {
    expect(skillIdentity(dir)).toEqual({
      hash: skillHash({ 'SKILL.md': 'v1' }),
      files: skillHash({ 'SKILL.md': 'v1' }),
    })
  })

  it('follows a script, an asset or any other file the agent gets, and not evals/', () => {
    mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts/check.sh'), 'one')
    const first = skillIdentity(dir)
    expect(first.hash).not.toBe(first.files)
    mkdirSync(join(dir, 'evals'))
    writeFileSync(join(dir, 'evals/bench.json'), '{}')
    expect(skillIdentity(dir).hash).toBe(first.hash)
    writeFileSync(join(dir, 'scripts/check.sh'), 'two, and longer')
    expect(skillIdentity(dir).hash).not.toBe(first.hash)
    expect(skillIdentity(dir).files).toBe(first.files)
  })
})

describe("what an agent's copy holds, and the hash covers", () => {
  let outside: string
  let copy: string
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'st-skill-outside-'))
    copy = mkdtempSync(join(tmpdir(), 'st-skill-copy-'))
    mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts/run.sh'), 'echo one')
  })
  afterEach(() => {
    rmSync(outside, { recursive: true, force: true })
    rmSync(copy, { recursive: true, force: true })
  })

  /** Every file under `root`, hidden ones included, by its path in it. */
  const everything = (root: string): string[] =>
    (readdirSync(root, { recursive: true, withFileTypes: true }) as Dirent[])
      .filter((entry) => !entry.isDirectory())
      .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
      .sort()

  it('leaves out what a crash or a failed restore left: a hidden temporary file and a .restore folder', () => {
    const before = skillIdentity(dir)
    mkdirSync(join(dir, '.restore-4242/old'), { recursive: true })
    writeFileSync(join(dir, '.restore-4242/old/SKILL.md'), 'the writer’s old text')
    writeFileSync(join(dir, `.SKILL.md.4242.tmp`), 'half a save')
    expect(skillIdentity(dir)).toEqual(before)
    snapshotSkill(dir, copy)
    expect(everything(copy)).toEqual(['SKILL.md', 'scripts/run.sh'])
  })

  it('leaves no temporary file to copy or count when a save cannot finish', () => {
    const before = skillIdentity(dir)
    const undo = failRenames(() => true)
    try {
      expect(() => writeSkillFile(dir, 'SKILL.md', 'v2', 'v1')).toThrow('EBUSY')
    } finally {
      undo()
    }
    expect(readdirSync(dir).sort()).toEqual(['SKILL.md', 'scripts'])
    expect(skillIdentity(dir)).toEqual(before)
  })

  it.skipIf(process.platform === 'win32')(
    'follows no link out of the skill, and leaves out installed packages and caches at any depth',
    () => {
      const before = skillIdentity(dir)
      writeFileSync(join(outside, 'big.bin'), 'not the skill’s')
      symlinkSync(outside, join(dir, 'data'))
      symlinkSync(join(outside, 'big.bin'), join(dir, 'big.bin'))
      for (const path of [
        'node_modules/x/index.js',
        'scripts/node_modules/y/index.js',
        'venv/bin/python',
        'scripts/__pycache__/run.cpython-312.pyc',
        'references/__pycache__/x.pyc',
      ]) {
        mkdirSync(dirname(join(dir, path)), { recursive: true })
        writeFileSync(join(dir, path), 'heavy')
      }
      expect(skillIdentity(dir)).toEqual(before)
      snapshotSkill(dir, copy)
      expect(everything(copy)).toEqual(['SKILL.md', 'scripts/run.sh'])
      expect(skillIdentity(copy)).toEqual(before)
    },
  )

  it.skipIf(process.platform === 'win32')('keeps a script runnable in the copy', () => {
    chmodSync(join(dir, 'scripts/run.sh'), 0o755)
    snapshotSkill(dir, copy)
    expect(statSync(join(copy, 'scripts/run.sh')).mode & 0o777).toBe(0o755)
  })

  it('copies a link that stays in the skill as the file it leads to', () => {
    symlinkSync(join(dir, 'scripts'), join(dir, 'tools'))
    snapshotSkill(dir, copy)
    expect(everything(copy)).toEqual(['SKILL.md', 'scripts/run.sh', 'tools/run.sh'])
    expect(skillIdentity(copy).hash).toBe(skillIdentity(dir).hash)
  })

  it('walks the skill again only when a folder in it has changed', () => {
    // Folders last changed an hour ago: a time that has not moved means the same entries.
    const hourAgo = new Date(Date.now() - 3600_000)
    for (const folder of [dir, join(dir, 'scripts')]) utimesSync(folder, hourAgo, hourAgo)
    const reads: string[] = []
    const undo = patchFs(
      'readdirSync',
      (real) =>
        ((path: string, ...rest: never[]) => {
          reads.push(String(path))
          return real(path, ...rest)
        }) as typeof real,
    )
    try {
      const first = skillIdentity(dir).hash
      reads.length = 0
      expect(skillIdentity(dir).hash).toBe(first)
      expect(reads.filter((path) => path.endsWith('scripts'))).toEqual([])
      // An edit to a file is seen without a walk; a new file changes its folder and is walked to.
      writeFileSync(join(dir, 'scripts/run.sh'), 'echo two, and longer')
      const edited = skillIdentity(dir).hash
      expect(edited).not.toBe(first)
      writeFileSync(join(dir, 'scripts/new.sh'), 'echo new')
      expect(skillIdentity(dir).hash).not.toBe(edited)
    } finally {
      undo()
    }
  })
})

describe.skipIf(process.platform === 'win32')('saving a file that is a link', () => {
  it('writes through a link to another file of the skill, and keeps the link', () => {
    mkdirSync(join(dir, 'references/shared'), { recursive: true })
    writeFileSync(join(dir, 'references/shared/tone.md'), 'old')
    symlinkSync(join(dir, 'references/shared/tone.md'), join(dir, 'references/tone.md'))
    writeSkillFile(dir, 'references/tone.md', 'new', 'old')
    expect(lstatSync(join(dir, 'references/tone.md')).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(dir, 'references/shared/tone.md'), 'utf8')).toBe('new')
  })
})

describe('skillInfo', () => {
  it('names a skill by its folder when the front matter gives no name, or an empty one', () => {
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: ""\ndescription: Does a thing.\n---\nBody')
    expect(skillInfo(dir)).toMatchObject({ description: 'Does a thing.' })
    expect(skillInfo(dir).name).toBe(basename(skillInfo(dir).path))
  })

  it('names a copy of the skill that gives no name by the folder its caller says it is', () => {
    writeFileSync(join(dir, 'SKILL.md'), 'Body')
    expect(skillHead(dir).name).toBe(basename(dir))
    expect(skillHead(dir, 'notes').name).toBe('notes')
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: Notes\n---\nBody')
    expect(skillHead(dir, 'notes').name).toBe('Notes')
  })
})
