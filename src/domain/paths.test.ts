import { describe, expect, it, vi } from 'vitest'
import {
  byFileOrder,
  fileTree,
  folderEnding,
  folderOf,
  isSkillFilePath,
  isWithin,
  nameOf,
  placeNew,
} from './paths.ts'

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

describe('placeNew', () => {
  const files = ['SKILL.md', 'forms.md', 'references/voice.md', 'scripts/lib/check.py']
  const file = (name: string, folder = '') => placeNew('file', name, folder, files)
  const folder = (name: string, inside = '') => placeNew('folder', name, inside, files)

  it('puts a file where it was asked for, beside SKILL.md or in a folder', () => {
    expect(file('notes')).toEqual({ path: 'notes.md' })
    expect(file(' tone.md ', 'references')).toEqual({ path: 'references/tone.md' })
    expect(file('run.py', 'scripts/lib')).toEqual({ path: 'scripts/lib/run.py' })
    expect(file('palette.json', 'assets')).toEqual({ path: 'assets/palette.json' })
  })

  it('takes folders typed in the name', () => {
    expect(file('scripts/lint.py')).toEqual({ path: 'scripts/lint.py' })
    expect(file('notes/tone', 'references')).toEqual({ path: 'references/notes/tone.md' })
  })

  it('names a folder, new or already there', () => {
    expect(folder('assets')).toEqual({ path: 'assets' })
    expect(folder('icons', 'assets')).toEqual({ path: 'assets/icons' })
    expect(folder('references')).toEqual({ path: 'references' })
    expect(folder('v1.2')).toEqual({ path: 'v1.2' })
  })

  it('keeps the spelling of a folder that is there', () => {
    expect(file('tone', 'References')).toEqual({ path: 'references/tone.md' })
    expect(file('Scripts/LIB/run.py')).toEqual({ path: 'scripts/lib/run.py' })
    expect(folder('SCRIPTS')).toEqual({ path: 'scripts' })
    expect(folder('Scripts/New')).toEqual({ path: 'scripts/New' })
  })

  it('refuses a name that is no file of the skill', () => {
    const characters = { error: 'Use letters, digits, dots, dashes and underscores.' }
    for (const name of ['', '../x', 'a b.md', '/abs.md', '.env', 'scripts/.env', 'a//b'])
      expect(file(name)).toEqual(characters)
    expect(folder('my folder')).toEqual(characters)
    const elsewhere = { error: 'Pick another name. A skill’s files cannot be kept there.' }
    expect(file('evals/bench.json')).toEqual(elsewhere)
    expect(file('x.js', 'node_modules')).toEqual(elsewhere)
    expect(folder('evals')).toEqual(elsewhere)
    expect(folder('__pycache__', 'scripts')).toEqual(elsewhere)
  })

  it('refuses a name that is taken, whatever its capitals', () => {
    expect(file('SKILL.md')).toEqual({ error: 'SKILL.md already exists.' })
    expect(file('Forms')).toEqual({ error: 'forms.md already exists.' })
    expect(file('VOICE', 'references')).toEqual({ error: 'references/voice.md already exists.' })
    expect(file('forms.md/extra')).toEqual({
      error: 'forms.md is a file, so nothing can go inside it.',
    })
    expect(folder('forms.md')).toEqual({ error: 'forms.md is a file, not a folder.' })
    expect(folder('more', 'forms.md')).toEqual({
      error: 'forms.md is a file, so nothing can go inside it.',
    })
    expect(placeNew('file', 'lib.md', 'scripts', [...files, 'scripts/lib.md/x'])).toEqual({
      error: 'scripts/lib.md is a folder.',
    })
  })
})

describe('fileTree', () => {
  it('lists each folder’s files, then the folders in it, SKILL.md first', () => {
    const tree = fileTree([
      'scripts/lib/check.py',
      'references/voice.md',
      'forms.md',
      'SKILL.md',
      'references/a.md',
      'scripts/run.sh',
    ])
    expect(tree.files).toEqual(['SKILL.md', 'forms.md'])
    expect(tree.folders.map((f) => f.path)).toEqual(['references', 'scripts'])
    expect(tree.folders[0].files).toEqual(['references/a.md', 'references/voice.md'])
    expect(tree.folders[1]).toEqual({
      name: 'scripts',
      path: 'scripts',
      files: ['scripts/run.sh'],
      folders: [{ name: 'lib', path: 'scripts/lib', files: ['scripts/lib/check.py'], folders: [] }],
    })
  })

  it('lists a folder that holds nothing yet when asked to', () => {
    const tree = fileTree(['SKILL.md', 'scripts/run.sh'], ['scripts/lib', 'assets', 'scripts'])
    expect(tree.folders.map((f) => f.path)).toEqual(['assets', 'scripts'])
    expect(tree.folders[1].folders.map((f) => f.path)).toEqual(['scripts/lib'])
    expect(tree.folders[1].files).toEqual(['scripts/run.sh'])
  })

  it('names a path’s folder and its own name', () => {
    expect(folderOf('SKILL.md')).toBe('')
    expect(folderOf('scripts/lib/check.py')).toBe('scripts/lib')
    expect(nameOf('scripts/lib/check.py')).toBe('check.py')
    expect(nameOf('scripts/lib')).toBe('lib')
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
