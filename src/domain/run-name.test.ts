import { describe, expect, it } from 'vitest'
import { parseSampleDir, type RunNameParts, runName, sampleDir } from './run-name.ts'

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
