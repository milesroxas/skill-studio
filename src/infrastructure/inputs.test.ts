import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { blankDraft } from '@domain/case-draft.ts'
import { INPUT_LIMITS } from '@domain/inputs.ts'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-inputs-home-'))
process.env.SKILL_STUDIO_HOME = home
afterAll(() => rmSync(home, { recursive: true, force: true }))
const { inputUploadPath, saveInputUpload } = await import('./inputs.ts')
const { loadCases, saveCase } = await import('./cases.ts')
const { uploadPath } = await import('./images.ts')

const b64 = (text: string) => Buffer.from(text).toString('base64')
const uploads = { picture: uploadPath, input: inputUploadPath }

let skill: string
beforeEach(() => {
  skill = mkdtempSync(join(home, 'skill-'))
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: mockups\n---\n')
})

const draft = { ...blankDraft(), id: 'results', prompt: 'Make a mockup of the Results screen.' }

const folderPick = (text = 'export function Results() {}') =>
  saveInputUpload({
    name: 'screens',
    files: [
      { path: 'screens/Results.tsx', data: b64(text) },
      { path: 'screens/parts/Score.tsx', data: b64('score') },
    ],
  })

describe('saveInputUpload', () => {
  it('keeps a folder as one pick, named from its bytes', () => {
    const pick = folderPick()
    expect(pick).toMatchObject({ name: 'screens', files: 2, folder: true })
    expect(folderPick().upload).toBe(pick.upload)
    expect(folderPick('changed').upload).not.toBe(pick.upload)
    expect(
      readFileSync(join(inputUploadPath(pick.upload), 'screens/parts/Score.tsx'), 'utf8'),
    ).toBe('score')
  })

  it('keeps a file as a pick of its own', () => {
    const pick = saveInputUpload({
      name: 'tokens.css',
      files: [{ path: 'tokens.css', data: b64(':root{}') }],
    })
    expect(pick).toMatchObject({ name: 'tokens.css', files: 1, folder: false })
  })

  it('refuses a path outside its name, a hidden file, a picture alone, and too much', () => {
    const one = (name: string, path: string) =>
      saveInputUpload({ name, files: [{ path, data: b64('x') }] })
    expect(() => one('screens', 'other/a.tsx')).toThrow('not in screens')
    expect(() => one('screens', 'screens/../../a.tsx')).toThrow('Bad file path')
    expect(() => one('screens', 'screens/.env')).toThrow('Bad file path')
    expect(() => one('../up', '../up')).toThrow('Bad file name')
    expect(() => one('shot.png', 'shot.png')).toThrow('Add pictures')
    const many = Array.from({ length: INPUT_LIMITS.files + 1 }, (_, i) => ({
      path: `big/${i}.txt`,
      data: b64('x'),
    }))
    expect(() => saveInputUpload({ name: 'big', files: many })).toThrow('Pick the folder')
  })

  it('refuses an id that is not one', () => {
    expect(() => inputUploadPath('../../etc')).toThrow('no longer kept')
  })
})

describe('saving a case with input files', () => {
  it('copies a pick into files/, where the agent gets it, and lists every file', () => {
    const pick = folderPick()
    saveCase(skill, { ...draft, added: [pick] }, true, uploads)
    const [saved] = loadCases(skill)
    expect(saved.files).toEqual([
      'evals/cases/results/files/screens/Results.tsx',
      'evals/cases/results/files/screens/parts/Score.tsx',
    ])
  })

  it('replaces a file or folder added again under its name, and takes out a removed one', () => {
    saveCase(skill, { ...draft, added: [folderPick()] }, true, uploads)
    const tokens = saveInputUpload({
      name: 'tokens.css',
      files: [{ path: 'tokens.css', data: b64(':root{}') }],
    })
    saveCase(skill, { ...draft, added: [tokens] }, false, uploads)
    // A newer copy of the folder, without the file it no longer has.
    const newer = saveInputUpload({
      name: 'screens',
      files: [{ path: 'screens/Results.tsx', data: b64('v2') }],
    })
    saveCase(skill, { ...draft, added: [newer], removed: ['tokens.css'] }, false, uploads)
    const [saved] = loadCases(skill)
    expect(saved.files).toEqual(['evals/cases/results/files/screens/Results.tsx'])
    expect(readFileSync(join(skill, saved.files[0]), 'utf8')).toBe('v2')
  })

  it('leaves files put in by hand alone', () => {
    saveCase(skill, draft, true, uploads)
    mkdirSync(join(skill, 'evals/cases/results/files'), { recursive: true })
    writeFileSync(join(skill, 'evals/cases/results/files/notes.md'), 'by hand')
    saveCase(skill, { ...draft, added: [folderPick()] }, false, uploads)
    expect(loadCases(skill)[0].files).toContain('evals/cases/results/files/notes.md')
  })

  it('refuses a name that climbs, or a file reached through a link out of the skill, before writing', () => {
    expect(() => saveCase(skill, { ...draft, removed: ['../prompt.md'] }, true, uploads)).toThrow(
      'Bad input file',
    )
    const outside = mkdtempSync(join(home, 'outside-'))
    writeFileSync(join(outside, 'keep.md'), 'keep')
    mkdirSync(join(skill, 'evals/cases/results/files'), { recursive: true })
    symlinkSync(join(outside, 'keep.md'), join(skill, 'evals/cases/results/files/keep.md'))
    expect(() => saveCase(skill, { ...draft, removed: ['keep.md'] }, true, uploads)).toThrow(
      'outside',
    )
    expect(readFileSync(join(outside, 'keep.md'), 'utf8')).toBe('keep')
    expect(loadCases(skill)).toEqual([])
  })

  it('says so when a pick is no longer kept', () => {
    const gone = { name: 'screens', upload: 'f'.repeat(24), files: 1, folder: true }
    expect(() => saveCase(skill, { ...draft, added: [gone] }, true, uploads)).toThrow(
      'Add it again',
    )
  })
})
