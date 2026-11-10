import { blankDraft, draftOf } from '@domain/case-draft.ts'
import {
  type Case,
  type CaseDraft,
  emptyDrafts,
  NEW_CASE_KEY,
  type SkillDrafts,
} from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import {
  afterCaseSave,
  afterFileSave,
  basesAfterCaseSave,
  caseUnsaved,
  formDraft,
  orphanCases,
  unsavedCases,
  withBase,
  withCase,
  withFile,
} from './draft-edits.ts'

const aCase = (patch: Partial<CaseDraft> = {}): CaseDraft => ({
  id: 'note',
  title: 'Note',
  prompt: 'Write a note',
  expectedOutcome: '',
  words: null,
  images: [],
  graders: [],
  ...patch,
})

const drafts = (patch: Partial<SkillDrafts>): SkillDrafts => ({ ...emptyDrafts(), ...patch })

describe('withFile and withCase', () => {
  it('set a draft and clear it, leaving the others', () => {
    const one = withFile(emptyDrafts(), 'SKILL.md', { text: 'a', previous: null })
    const two = withCase(one, 'note', aCase())
    expect(Object.keys(two.files)).toEqual(['SKILL.md'])
    expect(withFile(two, 'SKILL.md', null).files).toEqual({})
    expect(withFile(two, 'SKILL.md', null).cases.note).toEqual(aCase())
    expect(withCase(two, 'note', null).cases).toEqual({})
  })
})

describe('afterFileSave', () => {
  it('drops the draft that was saved', () => {
    const all = drafts({ files: { 'SKILL.md': { text: 'new', previous: 'old' } } })
    expect(afterFileSave(all, 'SKILL.md', 'new').files).toEqual({})
  })

  it('keeps what was typed while the file was written, begun on what was saved', () => {
    const all = drafts({ files: { 'SKILL.md': { text: 'new and more', previous: 'old' } } })
    expect(afterFileSave(all, 'SKILL.md', 'new').files['SKILL.md']).toEqual({
      text: 'new and more',
      previous: 'new',
    })
  })

  it('leaves the drafts alone when the file has none', () => {
    const all = drafts({ files: { 'references/a.md': { text: 'a', previous: null } } })
    expect(afterFileSave(all, 'SKILL.md', 'new')).toBe(all)
  })
})

describe('afterCaseSave', () => {
  it('drops the draft that was saved', () => {
    const all = drafts({ cases: { note: aCase({ prompt: 'p' }) } })
    expect(afterCaseSave(all, 'note', aCase({ prompt: 'p' }), 'note').cases).toEqual({})
  })

  it('keeps edits made while it was written', () => {
    const all = drafts({ cases: { note: aCase({ prompt: 'p and more' }) } })
    const after = afterCaseSave(all, 'note', aCase({ prompt: 'p' }), 'note')
    expect(after.cases.note?.prompt).toBe('p and more')
  })

  it('moves a new case’s later edits under the id it was saved with', () => {
    const all = drafts({ cases: { '': aCase({ id: '', prompt: 'p and more' }) } })
    const after = afterCaseSave(all, '', aCase({ id: 'p', prompt: 'p' }), 'p')
    expect(Object.keys(after.cases)).toEqual(['p'])
    expect(after.cases.p).toMatchObject({ id: 'p', prompt: 'p and more' })
  })
})

describe('orphanCases', () => {
  it('names the drafts of cases that are gone, never the new case’s', () => {
    const cases = { new: aCase(), kept: aCase(), gone: aCase() }
    expect(orphanCases(cases, ['kept'], 'new')).toEqual(['gone'])
  })
})

describe('case bases', () => {
  it('sets a stamp, clears it, and moves it to the id a save gave', () => {
    const one = withBase({}, '+new', null)
    expect(one).toEqual({ '+new': null })
    expect(withBase(one, '+new', undefined)).toEqual({})
    expect(basesAfterCaseSave({ '+new': null, other: 't0' }, '+new', 'note', 't1')).toEqual({
      other: 't0',
      note: 't1',
    })
    expect(basesAfterCaseSave({ note: 't0' }, 'note', 'note', 't1')).toEqual({ note: 't1' })
  })
})

describe('caseUnsaved and unsavedCases', () => {
  const saved = {
    id: 'note',
    legacyId: null,
    title: 'Note',
    prompt: 'Write a note',
    expectedOutcome: '',
    files: [],
    graders: [],
    settings: {},
    bench: {},
    source: 'folder',
    dir: 'evals/cases/note',
  } as unknown as Case

  it('reads a draft that says what the saved case says as no unsaved work', () => {
    const base = draftOf(saved)
    expect(caseUnsaved(undefined, base)).toBe(false)
    expect(caseUnsaved({ ...base }, base)).toBe(false)
    expect(caseUnsaved({ ...base, prompt: 'Write a longer note' }, base)).toBe(true)
  })

  it('keeps the saved pictures of a draft stored before cases had them', () => {
    const base = { ...draftOf(saved), images: [{ name: 'a.png', file: 'a.png', upload: null }] }
    const old = { ...base, images: undefined } as unknown as CaseDraft
    expect(formDraft(old, base).images).toEqual(base.images)
    expect(caseUnsaved(old, base)).toBe(false)
  })

  it('lists the cases with unsaved work, and the new case while it holds anything', () => {
    const all = {
      note: draftOf(saved),
      gone: aCase({ id: 'gone' }),
      [NEW_CASE_KEY]: { ...blankDraft(), prompt: 'Something' },
    }
    expect(unsavedCases([saved], all)).toEqual([NEW_CASE_KEY])
    expect(unsavedCases([saved], { ...all, note: aCase({ prompt: 'Changed' }) })).toEqual([
      'note',
      NEW_CASE_KEY,
    ])
    expect(unsavedCases([saved], { [NEW_CASE_KEY]: blankDraft() })).toEqual([])
  })
})
