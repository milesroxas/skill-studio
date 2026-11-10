import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunMeta } from '@domain/schemas.ts'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { failRenames } from './__fixtures__/fs.ts'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-trash-home-'))
process.env.SKILL_STUDIO_HOME = home
afterAll(() => rmSync(home, { recursive: true, force: true }))
const { deleteVersion, undeleteVersion } = await import('./trash.ts')
const { loadReviews, saveCorrection, savePick } = await import('./reviews.ts')
const { versionsOf } = await import('./runs.ts')
const { saveVersion } = await import('./versions.ts')

const trash = join(home, '.skill-studio', 'trash')
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-trash-'))
  writeFileSync(join(dir, 'SKILL.md'), 'first')
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

function writeRun(name: string, version: string) {
  const run = join(dir, 'evals/runs', name)
  mkdirSync(join(run, '_skill'), { recursive: true })
  writeFileSync(join(run, '_skill/SKILL.md'), 'first')
  const meta: Partial<RunMeta> = { name, skillVersion: version, createdAt: '2026-11-01T10:00:00Z' }
  writeFileSync(join(run, 'run.json'), JSON.stringify(meta))
}

describe('deleteVersion', () => {
  it('moves a saved version out, and the files stay as they are', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    const gone = deleteVersion(dir, 'v0')
    expect(gone).toMatchObject({ deleted: 'v0', runs: 0, reviews: 0 })
    expect(existsSync(join(dir, 'evals/versions/v0'))).toBe(false)
    expect(existsSync(join(dir, 'SKILL.md'))).toBe(true)
    expect(versionsOf(dir).versions).toEqual([])
    expect(versionsOf(dir).current).toMatchObject({ version: 'v0', changed: true })
  })

  it('takes the runs of the version and the corrections and picks on them', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    writeRun('r-v0', 'v0')
    writeRun('r-v1', 'v1')
    saveCorrection(dir, 'r-v0/case-s1', 'rule:Be brief.', true)
    saveCorrection(dir, 'r-v1/case-s1', 'rule:Be brief.', true)
    savePick(dir, { a: 'r-v0/case-s1', b: 'r-v1/case-s1', vote: 'a' })
    expect(deleteVersion(dir, 'v0')).toMatchObject({ runs: 1, reviews: 1 })
    expect(existsSync(join(dir, 'evals/runs/r-v0'))).toBe(false)
    expect(existsSync(join(dir, 'evals/runs/r-v1'))).toBe(true)
    const left = loadReviews(dir)
    expect(Object.keys(left.reviews)).toEqual(['r-v1/case-s1'])
    expect(left.preferences).toEqual([])
  })

  it('refuses a version that is not there', () => {
    expect(() => deleteVersion(dir, 'v3')).toThrow('There is no v3.')
  })

  it('keeps only the latest delete in the trash', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    writeFileSync(join(dir, 'SKILL.md'), 'second')
    saveVersion(dir, versionsOf(dir).current, 'Two', '')
    const first = deleteVersion(dir, 'v0')
    const second = deleteVersion(dir, 'v1')
    expect(readdirSync(trash)).toEqual([second.undo])
    expect(() => undeleteVersion(dir, first.undo)).toThrow('can no longer be undone')
  })
})

describe('undeleteVersion', () => {
  it('puts the version, its runs, its corrections and its picks back', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    writeRun('r-v0', 'v0')
    saveCorrection(dir, 'r-v0/case-s1', 'rule:Be brief.', true)
    savePick(dir, { a: 'r-v0/case-s1', b: 'r-v0/case-s2', vote: 'a' })
    const { undo } = deleteVersion(dir, 'v0')
    expect(undeleteVersion(dir, undo)).toEqual({ restored: 'v0' })
    expect(versionsOf(dir).versions.map((v) => [v.version, v.saved])).toEqual([['v0', true]])
    expect(existsSync(join(dir, 'evals/runs/r-v0/_skill/SKILL.md'))).toBe(true)
    expect(Object.keys(loadReviews(dir).reviews)).toEqual(['r-v0/case-s1'])
    expect(loadReviews(dir).preferences).toHaveLength(1)
    expect(existsSync(join(trash, undo))).toBe(false)
  })

  it('refuses when the number was saved again since', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    const { undo } = deleteVersion(dir, 'v0')
    saveVersion(dir, versionsOf(dir).current, 'Again', '')
    expect(() => undeleteVersion(dir, undo)).toThrow('was made since')
  })

  it('refuses a delete from another skill', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    const { undo } = deleteVersion(dir, 'v0')
    expect(() => undeleteVersion(join(dir, 'other'), undo)).toThrow('can no longer be undone')
  })
})

describe('a version number given out again', () => {
  it('refuses the undo when a run has taken the number since, so two texts never share it', () => {
    writeRun('r-old', 'v0')
    const { undo } = deleteVersion(dir, 'v0')
    writeFileSync(join(dir, 'SKILL.md'), 'second')
    writeRun('r-new', 'v0')
    expect(() => undeleteVersion(dir, undo)).toThrow('a new v0 was made since')
    expect(existsSync(join(dir, 'evals/runs/r-old'))).toBe(false)
  })
})

describe('a move that cannot be taken back', () => {
  // What these keep in the trash on purpose must not reach the other tests.
  afterEach(() => rmSync(trash, { recursive: true, force: true }))

  /** The move of `run` out of the skill, and the move that would bring `back` home again. */
  const blocked = (run: string, back: string) =>
    failRenames(
      (from, to) =>
        (from.endsWith(join('evals', 'runs', run)) && to.startsWith(trash)) ||
        (from.startsWith(trash) && to.endsWith(join('evals', 'runs', back))),
    )

  it('keeps the trash entry that holds it, names where it is, and no later delete empties it', () => {
    writeRun('r-a', 'v0')
    writeRun('r-b', 'v0')
    writeRun('r-c', 'v1')
    const undo = blocked('r-b', 'r-a')
    let message = ''
    try {
      deleteVersion(dir, 'v0')
    } catch (error) {
      message = (error as Error).message
    } finally {
      undo()
    }
    expect(message).not.toContain('nothing was changed')
    expect(message).toContain('Nothing is lost')
    const [id] = readdirSync(trash)
    const kept = join(trash, id, 'runs', 'r-a')
    expect(message).toContain(`${kept} to ${join(dir, 'evals', 'runs', 'r-a')}`)
    expect(existsSync(join(kept, 'run.json'))).toBe(true)
    expect(existsSync(join(dir, 'evals/runs/r-b/run.json'))).toBe(true)
    // The next delete empties the trash of finished entries only.
    const next = deleteVersion(dir, 'v1')
    expect(readdirSync(trash).sort()).toEqual([id, next.undo].sort())
    expect(existsSync(join(kept, 'run.json'))).toBe(true)
  })

  it('keeps an undo that stopped partway from being emptied, and names what to move', () => {
    writeRun('r-a', 'v0')
    writeRun('r-b', 'v0')
    const { undo: id } = deleteVersion(dir, 'v0')
    // r-a comes back and cannot return to the trash; r-b cannot come back at all.
    const undo = failRenames(
      (from, to) =>
        (from.endsWith(join(id, 'runs', 'r-b')) && to.endsWith(join('evals', 'runs', 'r-b'))) ||
        (from.endsWith(join('evals', 'runs', 'r-a')) && to.startsWith(trash)),
    )
    try {
      expect(() => undeleteVersion(dir, id)).toThrow(
        `move ${join(dir, 'evals', 'runs', 'r-a')} to ${join(trash, id, 'runs', 'r-a')}`,
      )
    } finally {
      undo()
    }
    writeRun('r-c', 'v1')
    deleteVersion(dir, 'v1')
    expect(existsSync(join(trash, id, 'runs', 'r-b', 'run.json'))).toBe(true)
  })

  it('leaves a finished delete unmarked, so the next one empties it', () => {
    writeRun('r-a', 'v0')
    const { undo: id } = deleteVersion(dir, 'v0')
    expect(readFileSync(join(trash, id, 'entry.json'), 'utf8')).not.toContain('unfinished')
  })
})

describe('a delete that cannot finish', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'puts back what it had moved, keeps the reviews and leaves nothing to undo',
    () => {
      saveVersion(dir, versionsOf(dir).current, 'One', '')
      writeRun('r-v0', 'v0')
      saveCorrection(dir, 'r-v0/case-s1', 'rule:Be brief.', true)
      // The saved copy can leave its folder; the run cannot leave this one.
      chmodSync(join(dir, 'evals/runs'), 0o555)
      try {
        expect(() => deleteVersion(dir, 'v0')).toThrow('nothing was changed')
      } finally {
        chmodSync(join(dir, 'evals/runs'), 0o755)
      }
      expect(versionsOf(dir).versions.map((v) => [v.version, v.saved])).toEqual([['v0', true]])
      expect(existsSync(join(dir, 'evals/runs/r-v0/run.json'))).toBe(true)
      expect(Object.keys(loadReviews(dir).reviews)).toEqual(['r-v0/case-s1'])
      expect(existsSync(trash) ? readdirSync(trash) : []).toEqual([])
    },
  )
})
