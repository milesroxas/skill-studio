import { describe, expect, it } from 'vitest'
import {
  parseSampleDir,
  type RunNameParts,
  runName,
  runNamed,
  runShown,
  sampleDir,
  versionWords,
} from './run-name.ts'

const base: RunNameParts = {
  date: '2026-10-31',
  skillVersion: 'v3',
  engine: 'claude',
  model: 'opus-4',
  effort: null,
  configuration: 'with_skill',
}

describe('runName', () => {
  it('joins date, skill version, engine and model', () => {
    expect(runName(base)).toBe('2026-10-31-skill-v3-claude-opus-4')
  })

  it('adds effort unless it is default', () => {
    expect(runName({ ...base, effort: 'high' })).toBe('2026-10-31-skill-v3-claude-opus-4-high')
    expect(runName({ ...base, effort: 'default' })).toBe('2026-10-31-skill-v3-claude-opus-4')
  })

  it('leaves out a missing model', () => {
    expect(runName({ ...base, model: null })).toBe('2026-10-31-skill-v3-claude')
  })

  it('slugs parts and appends a non-default configuration', () => {
    expect(runName({ ...base, model: 'GPT 5.1', configuration: 'without_skill' })).toBe(
      '2026-10-31-skill-v3-claude-gpt-5-1-without-skill',
    )
  })
})

describe('sampleDir and parseSampleDir', () => {
  it('round-trip a case id with dashes', () => {
    expect(parseSampleDir(sampleDir('cold-email-s2b', 3))).toEqual({
      case: 'cold-email-s2b',
      index: 3,
    })
  })

  it('accept a legacy .md file name', () => {
    expect(parseSampleDir('intro-s12.md')).toEqual({ case: 'intro', index: 12 })
  })

  it('reject names that are not sample dirs', () => {
    expect(parseSampleDir('intro')).toBeNull()
    expect(parseSampleDir('intro-s')).toBeNull()
    expect(parseSampleDir('-s1')).toBeNull()
    expect(parseSampleDir('intro-sx')).toBeNull()
  })
})

describe('runNamed, versionWords and runShown', () => {
  const versions = [
    { version: 'v0', name: 'First draft' },
    { version: 'v1', name: 'draft a' },
  ]
  const stamped = (
    skillVersion: string,
    skillName = '',
    configuration = 'with_skill' as const,
  ) => ({
    skillVersion,
    skillName,
    configuration,
  })

  it('names the version a run ran by the name `st versions` lists, beside the run’s folder', () => {
    // The run recorded another name: the one the versions list holds is the one shown.
    const run = runNamed('2026-11-26-skill-v1-claude-haiku', stamped('v1', 'old name'), versions)
    expect(run).toEqual({
      name: '2026-11-26-skill-v1-claude-haiku',
      version: 'v1',
      versionName: 'draft a',
      configuration: 'with_skill',
    })
    expect(runShown(run)).toBe('2026-11-26-skill-v1-claude-haiku (v1 · draft a)')
  })

  it('names no version for a run without the skill, though it was stamped with one', () => {
    const run = runNamed(
      '2026-11-26-skill-v1-claude-haiku-without-skill',
      { skillVersion: 'v1', skillName: 'draft a', configuration: 'without_skill' },
      versions,
    )
    expect([run.version, run.versionName]).toEqual([null, null])
    expect(runShown(run)).toBe('2026-11-26-skill-v1-claude-haiku-without-skill (without the skill)')
  })

  it('keeps the name a run recorded for a version no longer listed, and says nothing of one it did not record', () => {
    expect(runShown(runNamed('r', stamped('v7', 'gone draft'), versions))).toBe(
      'r (v7 · gone draft)',
    )
    expect(runShown(runNamed('r', stamped('v7'), versions))).toBe('r (v7)')
    // A run.json whose version is no label, or no run.json at all, names the folder alone.
    expect(runShown(runNamed('r', stamped(''), versions))).toBe('r')
    expect(runShown(runNamed('r', null, versions))).toBe('r')
  })

  it('shows a version with no name, or only spaces for one, by its number', () => {
    const blank = [{ version: 'v2', name: ' \n ' }]
    expect(runNamed('r', stamped('v2', 'recorded'), blank).versionName).toBeNull()
    expect(runShown(runNamed('r', stamped('v2', 'recorded'), blank))).toBe('r (v2)')
  })

  it('says a run of a kept copy of a version is one', () => {
    const run = runNamed('r', { ...stamped('v0'), configuration: 'old_skill' }, versions)
    expect(runShown(run)).toBe('r (v0 · First draft · old skill)')
  })

  it('shows a name on one line, markup and all, and whole however long, where the JSON keeps it as given', () => {
    const odd = `draft <b>a</b> &\nits\r\nsecond   line`
    const run = runNamed('r', stamped('v3'), [{ version: 'v3', name: odd }])
    expect(run.versionName).toBe(odd)
    expect(versionWords(run)).toBe('v3 · draft <b>a</b> & its second line')
    const long = 'x'.repeat(200)
    expect(runShown(runNamed('r', stamped('v3'), [{ version: 'v3', name: long }]))).toBe(
      `r (v3 · ${long})`,
    )
  })

  it('shows a name without what a terminal or a sheet would act on: escapes, controls, direction overrides', () => {
    const run = runNamed('r', stamped('v3'), [
      { version: 'v3', name: '‮draft a\u001b[1A\u001b[2K⁦b⁩\u0000' },
    ])
    expect(runShown(run)).toBe('r (v3 · draft ab)')
  })

  it('tells apart two versions given the same name, and two runs of one version, by their folders and numbers', () => {
    const same = [
      { version: 'v0', name: 'Draft' },
      { version: 'v1', name: 'Draft' },
    ]
    const shown = [
      runShown(runNamed('day-skill-v0-claude-haiku', stamped('v0'), same)),
      runShown(runNamed('day-skill-v1-claude-haiku', stamped('v1'), same)),
      runShown(runNamed('day-skill-v1-claude-haiku-2', stamped('v1'), same)),
    ]
    expect(new Set(shown).size).toBe(3)
    expect(shown[2]).toBe('day-skill-v1-claude-haiku-2 (v1 · Draft)')
  })
})
