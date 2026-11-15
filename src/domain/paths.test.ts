import { describe, expect, it, vi } from 'vitest'
import { byFileOrder, folderEnding, isSkillFilePath, isWithin, newFilePath } from './paths.ts'

describe('folderEnding', () => {
  const pair = ['r1', 'case-s1']

  it('gives the folder a path runs through, in the path’s own spelling', () => {
    expect(folderEnding('/old/skill/runs/r1/case-s1/outputs/a.md', pair)).toBe(
      '/old/skill/runs/r1/case-s1',
    )
    expect(folderEnding('/old/skill/runs/r1/case-s1', pair)).toBe('/old/skill/runs/r1/case-s1')
    expect(folderEnding('C:\\old\\runs\\r1\\case-s1\\outputs\\a.md', pair)).toBe(
      'C:\\old\\runs\\r1\\case-s1',
    )
    expect(folderEnding('\\\\host\\share\\r1\\case-s1\\a.md', pair)).toBe(
      '\\\\host\\share\\r1\\case-s1',
    )
  })

  it('gives none for a path that runs through no such folder, or climbs back out of it', () => {
    expect(folderEnding('/old/skill/runs/r1/case-s2/a.md', pair)).toBeNull()
    expect(folderEnding('/old/skill/runs/r2/case-s1/a.md', pair)).toBeNull()
    expect(folderEnding('/old/skill/runs/r1/case-s1/../case-s2/b.md', pair)).toBeNull()
    expect(folderEnding('/old/skill/runs/r1', pair)).toBeNull()
    expect(folderEnding('/anything/at/all', [])).toBeNull()
  })
})

describe('isWithin', () => {
  it('accepts the root itself and anything below it', () => {
    expect(isWithin('/runs/case-s1', '/runs/case-s1')).toBe(true)
    expect(isWithin('/runs/case-s1/outputs/a.md', '/runs/case-s1')).toBe(true)
    expect(isWithin('/runs/case-s1/', '/runs/case-s1')).toBe(true)
  })

  it('rejects a sibling that only shares a name prefix', () => {
    expect(isWithin('/runs/case-s10/a.md', '/runs/case-s1')).toBe(false)
  })

  it('resolves .. segments before comparing', () => {
    expect(isWithin('/runs/case-s1/../case-s2/a.md', '/runs/case-s1')).toBe(false)
    expect(isWithin('/runs/case-s1/x/../a.md', '/runs/case-s1')).toBe(true)
  })

  it('keeps a file whose name starts with two dots inside', () => {
    expect(isWithin('/runs/case-s1/..notes', '/runs/case-s1')).toBe(true)
  })
})

describe('isSkillFilePath', () => {
  it('takes every file a copy of the skill holds', () => {
    expect(isSkillFilePath('SKILL.md')).toBe(true)
    expect(isSkillFilePath('references/voice.md')).toBe(true)
    expect(isSkillFilePath('references/notes/a..voice.md')).toBe(true)
    expect(isSkillFilePath('forms.md')).toBe(true)
    expect(isSkillFilePath('scripts/check.py')).toBe(true)
    expect(isSkillFilePath('assets/fonts/a.woff2')).toBe(true)
    expect(isSkillFilePath('skill.md')).toBe(true)
  })

  it('refuses what no copy holds, and a path not written plainly', () => {
    expect(isSkillFilePath('')).toBe(false)
    expect(isSkillFilePath('evals')).toBe(false)
    expect(isSkillFilePath('evals/bench.json')).toBe(false)
    expect(isSkillFilePath('.git/config')).toBe(false)
    expect(isSkillFilePath('scripts/.env')).toBe(false)
    expect(isSkillFilePath('references/notes/..voice.md')).toBe(false)
    expect(isSkillFilePath('scripts/node_modules/x/index.js')).toBe(false)
    expect(isSkillFilePath('scripts/__pycache__/a.pyc')).toBe(false)
    expect(isSkillFilePath('references/')).toBe(false)
    expect(isSkillFilePath('references//voice.md')).toBe(false)
    expect(isSkillFilePath('references/./voice.md')).toBe(false)
    expect(isSkillFilePath('references/../../x')).toBe(false)
    expect(isSkillFilePath('references/../SKILL.md')).toBe(false)
    expect(isSkillFilePath('references\\voice.md')).toBe(false)
    expect(isSkillFilePath('/etc/passwd')).toBe(false)
  })
})

describe('newFilePath', () => {
  it('makes a bare name a reference, and a name with a folder what it says', () => {
    expect(newFilePath('voice')).toBe('references/voice.md')
    expect(newFilePath(' voice.md ')).toBe('references/voice.md')
    expect(newFilePath('references/notes/tone')).toBe('references/notes/tone.md')
    expect(newFilePath('scripts/check.py')).toBe('scripts/check.py')
    expect(newFilePath('assets/palette.json')).toBe('assets/palette.json')
  })

  it('refuses a name that is no file of the skill', () => {
    expect(newFilePath('')).toBeNull()
    expect(newFilePath('../x')).toBeNull()
    expect(newFilePath('evals/bench.json')).toBeNull()
    expect(newFilePath('scripts/.env')).toBeNull()
    expect(newFilePath('node_modules/x.js')).toBeNull()
    expect(newFilePath('a b.md')).toBeNull()
    expect(newFilePath('/abs.md')).toBeNull()
  })
})

describe('byFileOrder', () => {
  it('puts SKILL.md first and sorts the rest in one fixed locale', () => {
    const compare = vi.spyOn(String.prototype, 'localeCompare')
    expect(['references/b.md', 'SKILL.md', 'references/a.md'].sort(byFileOrder)).toEqual([
      'SKILL.md',
      'references/a.md',
      'references/b.md',
    ])
    expect(compare).toHaveBeenCalled()
    for (const call of compare.mock.calls) expect(call[1]).toBe('en')
    compare.mockRestore()
  })
})
