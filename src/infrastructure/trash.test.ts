import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunMeta } from '@domain/schemas.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-trash-home-'))
process.env.SKILL_STUDIO_HOME = home
const { deleteVersion, undeleteVersion } = await import('./trash.ts')
const { loadReviews, saveReview, savePreference } = await import('./reviews.ts')
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

const review = { rating: 4, layers: {}, note: '' }

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

  it('takes the runs of the version and the reviews and votes on them', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    writeRun('r-v0', 'v0')
    writeRun('r-v1', 'v1')
    saveReview(dir, 'r-v0/case-s1', review)
    saveReview(dir, 'r-v1/case-s1', review)
    savePreference(dir, {
      a: 'r-v0/case-s1',
      b: 'r-v1/case-s1',
      criterion: 'overall',
      vote: 'a',
      by: 'human',
    })
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
  it('puts the version, its runs and its reviews back', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    writeRun('r-v0', 'v0')
    saveReview(dir, 'r-v0/case-s1', review)
    savePreference(dir, {
      a: 'r-v0/case-s1',
      b: 'r-v0/case-s2',
      criterion: 'overall',
      vote: 'a',
      by: 'human',
    })
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
    expect(() => undeleteVersion(dir, undo)).toThrow('was saved since')
  })

  it('refuses a delete from another skill', () => {
    saveVersion(dir, versionsOf(dir).current, 'One', '')
    const { undo } = deleteVersion(dir, 'v0')
    expect(() => undeleteVersion(join(dir, 'other'), undo)).toThrow('can no longer be undone')
  })
})
