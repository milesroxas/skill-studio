import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunMeta } from '@domain/schemas.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { versionFiles, versionsOf } from './runs.ts'
import { replaceSkillFiles, skillFiles } from './skill.ts'
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

describe('replaceSkillFiles', () => {
  it('writes the set and removes references it does not hold', () => {
    mkdirSync(join(dir, 'references'))
    writeFileSync(join(dir, 'references/extra.md'), 'gone soon')
    replaceSkillFiles(dir, { 'SKILL.md': 'restored', 'references/kept.md': 'kept' })
    expect(skillFiles(dir)).toEqual({ 'SKILL.md': 'restored', 'references/kept.md': 'kept' })
  })

  it('refuses a set without SKILL.md', () => {
    expect(() => replaceSkillFiles(dir, { 'references/a.md': 'x' })).toThrow('no SKILL.md')
    expect(readFileSync(join(dir, 'SKILL.md'), 'utf8')).toBe('first')
  })

  it('never writes outside the editable set', () => {
    expect(() => replaceSkillFiles(dir, { 'SKILL.md': 'x', 'evals/bench.json': '{}' })).toThrow(
      'Only SKILL.md',
    )
  })
})
