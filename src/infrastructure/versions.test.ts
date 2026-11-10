import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { RunMeta } from '@domain/schemas.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { failRenames } from './__fixtures__/fs.ts'
import { versionFiles, versionsOf } from './runs.ts'
import { restoreSkillFiles, skillFiles, skillHash, skillIdentity, skillVersions } from './skill.ts'
import { savedVersions, saveVersion } from './versions.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-versions-'))
  writeFileSync(join(dir, 'SKILL.md'), 'first')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** A run of `version` with a snapshot of `text`, as generate leaves it. */
function writeRun(name: string, version: string, text: string) {
  const run = join(dir, 'evals/runs', name)
  mkdirSync(join(run, '_skill'), { recursive: true })
  writeFileSync(join(run, '_skill/SKILL.md'), text)
  const meta: Partial<RunMeta> = {
    name,
    skillVersion: version,
    skillName: `${version} run`,
    skillHash: 'from-a-run',
    note: '',
    createdAt: '2026-11-01T10:00:00Z',
  }
  writeFileSync(join(run, 'run.json'), JSON.stringify(meta))
}

describe('saveVersion', () => {
  it('saves the working tree as v0 with a copy of its files', () => {
    const saved = saveVersion(dir, versionsOf(dir).current, ' First draft ', ' why ')
    expect(saved).toMatchObject({ version: 'v0', name: 'First draft', note: 'why', saved: true })
    expect(readFileSync(join(dir, 'evals/versions/v0/files/SKILL.md'), 'utf8')).toBe('first')
    expect(versionsOf(dir).current).toMatchObject({ version: 'v0', changed: false })
  })

  it('numbers the next version after the saved ones', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    writeFileSync(join(dir, 'SKILL.md'), 'second')
    expect(versionsOf(dir).current).toMatchObject({ version: 'v1', changed: true })
    saveVersion(dir, versionsOf(dir).current, 'Two', '')
    expect(savedVersions(dir).map((v) => v.version)).toEqual(['v0', 'v1'])
  })

  it('numbers after runs too, sharing one sequence', () => {
    writeRun('2026-11-01-skill-v0-a', 'v0', 'old')
    expect(versionsOf(dir).current.version).toBe('v1')
  })

  it('refuses files that already are a version', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    expect(() => saveVersion(dir, versionsOf(dir).current, 'Again', '')).toThrow('already v0')
  })

  it('refuses a version with no name', () => {
    expect(() => saveVersion(dir, versionsOf(dir).current, '  ', '')).toThrow('Name the version')
    expect(existsSync(join(dir, 'evals/versions'))).toBe(false)
  })

  it('finishes a save that crashed before version.json was written', () => {
    // The files were copied, then the process died: no version.json, so nothing is saved yet.
    mkdirSync(join(dir, 'evals/versions/v0/files'), { recursive: true })
    writeFileSync(join(dir, 'evals/versions/v0/files/SKILL.md'), 'stale')
    expect(savedVersions(dir)).toEqual([])
    expect(() => versionFiles(dir, 'v0')).toThrow('No copy of v0')
    const saved = saveVersion(dir, versionsOf(dir).current, 'One', '')
    expect(saved.version).toBe('v0')
    expect(readFileSync(join(dir, 'evals/versions/v0/files/SKILL.md'), 'utf8')).toBe('first')
  })

  it('lists the other versions when one version.json cannot be read', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    mkdirSync(join(dir, 'evals/versions/v7'), { recursive: true })
    writeFileSync(join(dir, 'evals/versions/v7/version.json'), '{"version": "v7"')
    expect(savedVersions(dir).map((v) => v.version)).toEqual(['v0'])
  })
})

describe('versionFiles', () => {
  it('reads a saved version from its own copy', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    writeFileSync(join(dir, 'SKILL.md'), 'changed')
    expect(versionFiles(dir, 'v0')).toEqual({ 'SKILL.md': 'first' })
  })

  it('falls back to the snapshot of a run of that version', () => {
    writeRun('2026-11-01-skill-v0-a', 'v0', 'from the run')
    expect(versionFiles(dir, 'v0')).toEqual({ 'SKILL.md': 'from the run' })
  })

  it('says when no copy is kept', () => {
    expect(() => versionFiles(dir, 'v4')).toThrow('No copy of v4')
  })
})

describe("versions and the skill's other files", () => {
  it('counts a script as part of the version, so a changed script is a changed skill', () => {
    mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts/lint.mjs'), 'one')
    saveVersion(dir, versionsOf(dir).current, 'With a script', '')
    expect(versionsOf(dir).current).toMatchObject({ version: 'v0', changed: false })
    writeFileSync(join(dir, 'scripts/lint.mjs'), 'two, and longer')
    expect(versionsOf(dir).current).toMatchObject({ version: 'v1', changed: true })
  })

  it('still reads a version stamped from SKILL.md and references alone', () => {
    const run = join(dir, 'evals/runs/old-run')
    mkdirSync(join(run, '_skill'), { recursive: true })
    writeFileSync(join(run, '_skill/SKILL.md'), 'first')
    writeFileSync(
      join(run, 'run.json'),
      JSON.stringify({
        name: 'old-run',
        skillVersion: 'v0',
        skillHash: skillHash(skillFiles(dir)),
      }),
    )
    mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts/lint.mjs'), 'one')
    expect(versionsOf(dir).current).toMatchObject({ version: 'v0', changed: false })
  })

  it('hands back the whole hash for a version stamped from SKILL.md and references, so a later script edit is a new version', () => {
    mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts/run.sh'), 'echo one')
    writeRun('old-run', 'v0', 'first')
    const stamped = (name: string, hash: string) =>
      writeFileSync(
        join(dir, 'evals/runs', name, 'run.json'),
        JSON.stringify({ name, skillVersion: 'v0', skillHash: hash, createdAt: '2026-11-01' }),
      )
    stamped('old-run', skillHash(skillFiles(dir)))
    const current = versionsOf(dir).current
    expect(current).toMatchObject({ version: 'v0', changed: false })
    expect(current.hash).toBe(skillIdentity(dir).hash)
    // A run of it stamps that whole hash; the next script edit is then a change.
    writeRun('new-run', 'v0', 'first')
    stamped('new-run', current.hash)
    expect(versionsOf(dir).current).toMatchObject({ version: 'v0', changed: false })
    writeFileSync(join(dir, 'scripts/run.sh'), 'echo two, and longer')
    expect(versionsOf(dir).current).toMatchObject({ version: 'v1', changed: true })
  })

  it('takes an older version stamped from SKILL.md and references alone for no later scripts', () => {
    mkdirSync(join(dir, 'scripts'))
    writeFileSync(join(dir, 'scripts/run.sh'), 'echo one')
    const files = skillHash(skillFiles(dir))
    const v0 = { version: 'v0', name: 'Old', hash: files, note: '', date: undefined, saved: true }
    const v1 = { ...v0, version: 'v1', name: 'New', hash: skillIdentity(dir).hash }
    writeFileSync(join(dir, 'scripts/run.sh'), 'echo three')
    expect(skillVersions(dir, [], [v0, v1]).current).toMatchObject({ version: 'v2', changed: true })
  })

  it('takes no version from a run whose version is not a label', () => {
    const run = join(dir, 'evals/runs/odd-run')
    mkdirSync(run, { recursive: true })
    writeFileSync(join(run, 'run.json'), JSON.stringify({ name: 'odd-run', skillVersion: '../v9' }))
    expect(versionsOf(dir).versions).toEqual([])
  })
})

describe('restoreSkillFiles', () => {
  const made: string[] = []
  afterEach(() => {
    for (const path of made.splice(0)) rmSync(path, { recursive: true, force: true })
  })

  /** A folder holding a version's copy, as `versionSource` names one. */
  function source(files: Record<string, string | Buffer>): string {
    const from = mkdtempSync(join(tmpdir(), 'st-version-source-'))
    made.push(from)
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(from, path)), { recursive: true })
      writeFileSync(join(from, path), content)
    }
    return from
  }

  it('makes the files those of the version and removes references it does not hold', () => {
    mkdirSync(join(dir, 'references/old'), { recursive: true })
    writeFileSync(join(dir, 'references/old/extra.md'), 'gone soon')
    restoreSkillFiles(dir, source({ 'SKILL.md': 'restored', 'references/kept.md': 'kept' }))
    expect(skillFiles(dir)).toEqual({ 'SKILL.md': 'restored', 'references/kept.md': 'kept' })
    expect(existsSync(join(dir, 'references/old'))).toBe(false)
    expect(readdirSync(dir).filter((name) => name.startsWith('.restore'))).toEqual([])
  })

  it('refuses a version without SKILL.md and changes nothing', () => {
    expect(() => restoreSkillFiles(dir, source({ 'references/a.md': 'x' }))).toThrow('no SKILL.md')
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe('first')
    expect(existsSync(join(dir, 'references'))).toBe(false)
  })

  it('restores only SKILL.md and references, whatever else the copy holds', () => {
    restoreSkillFiles(
      dir,
      source({ 'SKILL.md': 'restored', 'evals/bench.json': '{}', 'run.sh': 'x' }),
    )
    expect(existsSync(join(dir, 'evals'))).toBe(false)
    expect(existsSync(join(dir, 'run.sh'))).toBe(false)
  })

  it('brings a picture back byte for byte, and a file whose name has a space', () => {
    // Bytes that are not valid UTF-8: read as text they would come back changed.
    const picture = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0xc3, 0x28])
    restoreSkillFiles(
      dir,
      source({ 'SKILL.md': 'x', 'references/shot.png': picture, 'references/My notes.md': 'n' }),
    )
    expect(readFileSync(join(dir, 'references/shot.png')).equals(picture)).toBe(true)
    expect(readFileSync(join(dir, 'references/My notes.md'), 'utf8')).toBe('n')
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'changes nothing when one file cannot be replaced',
    () => {
      mkdirSync(join(dir, 'references/locked'), { recursive: true })
      writeFileSync(join(dir, 'references/a.md'), 'a')
      writeFileSync(join(dir, 'references/locked/x.md'), 'x')
      chmodSync(join(dir, 'references/locked'), 0o555)
      try {
        expect(() =>
          restoreSkillFiles(
            dir,
            source({
              'SKILL.md': 'new',
              'references/a.md': 'new a',
              'references/locked/x.md': 'new x',
            }),
          ),
        ).toThrow()
      } finally {
        chmodSync(join(dir, 'references/locked'), 0o755)
      }
      expect(skillFiles(dir)).toEqual({
        'SKILL.md': 'first',
        'references/a.md': 'a',
        'references/locked/x.md': 'x',
      })
      expect(readdirSync(dir).filter((name) => name.startsWith('.restore'))).toEqual([])
    },
  )

  describe('when a file is held and cannot be moved', () => {
    const restore = () =>
      restoreSkillFiles(dir, source({ 'SKILL.md': 'old version', 'references/b.md': 'old ref' }))
    const stages = () => readdirSync(dir).filter((name) => name.startsWith('.restore'))
    beforeEach(() => {
      writeFileSync(join(dir, 'SKILL.md'), 'my unsaved text')
      mkdirSync(join(dir, 'references'))
      writeFileSync(join(dir, 'references/a.md'), 'my reference')
    })

    it('goes on putting files back past one that cannot be, and keeps nothing it need not', () => {
      // The version's b.md cannot come in, and its SKILL.md, once in, cannot go back out.
      const undo = failRenames(
        (from, to) =>
          from.endsWith(join('new', 'references', 'b.md')) || to.endsWith(join('new', 'SKILL.md')),
      )
      try {
        expect(restore).toThrow('EBUSY')
      } finally {
        undo()
      }
      // The writer's SKILL.md went back over the version's.
      expect(skillFiles(dir)).toEqual({
        'SKILL.md': 'my unsaved text',
        'references/a.md': 'my reference',
      })
      expect(stages()).toEqual([])
    })

    it('keeps the writer’s file it could not put back, and says where it is', () => {
      const undo = failRenames(
        (from) =>
          from.endsWith(join('new', 'references', 'b.md')) ||
          from.endsWith(join('old', 'references', 'a.md')),
      )
      let message = ''
      try {
        restore()
      } catch (error) {
        message = (error as Error).message
      } finally {
        undo()
      }
      expect(message).toContain('Nothing of yours is lost')
      const [stage] = stages()
      const kept = join(dir, stage, 'old', 'references', 'a.md')
      expect(message).toContain(`${kept} to ${join(dir, 'references', 'a.md')}`)
      expect(readFileSync(kept, 'utf8')).toBe('my reference')
      expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe('my unsaved text')
    })
  })

  it.skipIf(process.platform === 'win32')(
    'refuses to write through a link that leaves the skill, and changes nothing',
    () => {
      const outside = mkdtempSync(join(tmpdir(), 'st-outside-'))
      made.push(outside)
      writeFileSync(join(outside, 'secret.md'), 'theirs')
      mkdirSync(join(dir, 'references'))
      symlinkSync(join(outside, 'secret.md'), join(dir, 'references/out.md'))
      expect(() =>
        restoreSkillFiles(dir, source({ 'SKILL.md': 'new', 'references/out.md': 'mine now' })),
      ).toThrow('leads outside')
      expect(readFileSync(join(outside, 'secret.md'), 'utf8')).toBe('theirs')
      expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe('first')
    },
  )
})
