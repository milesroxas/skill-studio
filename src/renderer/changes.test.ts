import type { Case } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'
import {
  caseDetail,
  caseLabels,
  caseTarget,
  fileDetail,
  fileDone,
  fileStanding,
  legacyCase,
  losesEdits,
  replaceWarning,
  showsDiff,
  unsavedFiles,
  versionDetail,
  versionSaved,
} from './changes.ts'
import { lineDiff } from './diff.ts'

const text = 'a\nb\n'

describe('file standing', () => {
  const lines = (before: string) => lineDiff(before, text)

  it('reads the saved file first', () => {
    expect(fileDetail({ before: undefined, draft: undefined, text }, [])).toBe(
      'Reading the saved file…',
    )
  })

  it('counts a new file, and one already applied', () => {
    expect(fileDetail({ before: null, draft: undefined, text }, lines(''))).toBe(
      'New file, 2 lines',
    )
    expect(fileDetail({ before: text, draft: undefined, text }, [])).toBe('2 lines')
    expect(fileDone({ before: text, draft: undefined, text })).toBe(true)
  })

  it('shows the change against the unsaved text when there is some', () => {
    const standing = { before: 'a\n', draft: 'a\nc\n', text }
    expect(fileDetail(standing, lineDiff('a\nc\n', text))).toBe(
      '1 added, 1 removed to your unsaved text',
    )
    expect(fileDetail({ before: 'a\n', draft: text, text }, [])).toBe('Saves your unsaved text')
    expect(fileDetail({ before: 'a\n', draft: undefined, text }, lines('a\n'))).toBe(
      '1 added, 0 removed',
    )
  })

  it('stands a path against the files and drafts', () => {
    expect(fileStanding(null, {}, 'SKILL.md', text).before).toBeUndefined()
    expect(fileStanding({}, {}, 'SKILL.md', text).before).toBeNull()
    expect(
      fileStanding({ 'SKILL.md': 'a\n' }, { 'SKILL.md': { text: 'b\n' } }, 'SKILL.md', text),
    ).toEqual({
      before: 'a\n',
      draft: 'b\n',
      text,
    })
  })

  it('opens to a diff only when there is one to show', () => {
    expect(showsDiff({ before: 'a\n', draft: undefined, text })).toBe(true)
    expect(showsDiff({ before: undefined, draft: undefined, text })).toBe(false)
    expect(showsDiff({ before: text, draft: undefined, text })).toBe(false)
    expect(showsDiff({ before: 'a\n', draft: text, text })).toBe(false)
  })

  it('warns only when unsaved edits would be lost', () => {
    expect(losesEdits({ before: 'a\n', draft: 'a\nc\n', text })).toBe(true)
    expect(losesEdits({ before: 'a\n', draft: 'a\n', text })).toBe(false)
    expect(losesEdits({ before: 'a\n', draft: text, text })).toBe(false)
    expect(losesEdits({ before: 'a\n', draft: undefined, text })).toBe(false)
  })
})

describe('case standing', () => {
  const saved = { id: 'shift', title: 'A shift', dir: '/cases/shift' }

  it('says what the row does', () => {
    expect(caseDetail({ saved: undefined, done: false, drafted: false }, 2)).toBe(
      'New case, 2 checks',
    )
    expect(caseDetail({ saved, done: false, drafted: false }, 1)).toBe('Replaces a case, 1 check')
    expect(caseDetail({ saved, done: true, drafted: false }, 1)).toBe('Case, 1 check')
    expect(caseDetail({ saved: { ...saved, dir: null }, done: false, drafted: false }, 1)).toBe(
      'Kept in evals.json: change it there',
    )
    expect(caseDetail({ saved: undefined, done: false, drafted: false, twin: 'shift' }, 2)).toBe(
      'New case, 2 checks · shift has the same title',
    )
    expect(legacyCase({ saved: { ...saved, dir: null }, done: false, drafted: false })).toBe(true)
  })

  describe('caseTarget', () => {
    const shift = {
      id: 'tone-check',
      legacyId: null,
      title: 'Tone check',
      prompt: 'Check the tone.',
      expectedOutcome: '',
      files: [],
      graders: [],
      settings: {},
      bench: {},
      source: 'folder',
      dir: 'evals/cases/tone-check',
    } as unknown as Case
    const change = {
      kind: 'case' as const,
      id: 'tone-check',
      idGiven: false,
      title: 'Tone check',
      prompt: 'Rewrite the reply.',
      expected: '',
      checks: [],
    }

    it('adds an unnamed case beside a different case of the same title, and names it', () => {
      expect(caseTarget(change, [shift])).toEqual({
        saved: undefined,
        id: 'tone-check-2',
        twin: shift,
      })
    })

    it('names the case it added before and the reader edited since', () => {
      const edited = { ...shift, title: 'tone-check', prompt: 'Rewrite the reply, briefly.' }
      const untitled = { ...change, title: '' }
      expect(caseTarget({ ...untitled, prompt: 'Tone check' }, [edited]).twin).toBe(edited)
      expect(caseTarget(change, [{ ...shift, id: 'other', title: 'TONE CHECK ' }]).twin?.id).toBe(
        'other',
      )
    })

    it('names no twin when no saved case has the title', () => {
      expect(caseTarget(change, [{ ...shift, id: 'other', title: 'Other' }])).toEqual({
        saved: undefined,
        id: 'tone-check',
      })
    })

    it('reads an unnamed case already added as done, under the id it was given', () => {
      const added = { ...shift, id: 'tone-check-2', prompt: 'Rewrite the reply.' }
      expect(caseTarget(change, [shift, added])).toEqual({ saved: added, id: 'tone-check-2' })
    })

    it('replaces the case a named change names', () => {
      expect(caseTarget({ ...change, idGiven: true }, [shift])).toEqual({
        saved: shift,
        id: 'tone-check',
      })
    })
  })

  it('labels the button and the warning by what is saved', () => {
    expect(caseLabels({ saved: undefined, done: false, drafted: false })).toEqual({
      label: 'Add',
      busy: 'Adding…',
      done: 'Added',
    })
    expect(caseLabels({ saved, done: false, drafted: false }).done).toBe('Replaced')
    expect(caseLabels({ saved, done: true, drafted: false }).done).toBe('Added')
    expect(replaceWarning({ saved, done: false, drafted: true })).toContain('unsaved edits')
    expect(replaceWarning({ saved, done: false, drafted: false })).toContain('pictures stay')
  })
})

describe('version standing', () => {
  const version = (name: string, saved: boolean) => ({
    version: 'v1',
    name,
    hash: 'h',
    note: '',
    date: undefined,
    saved,
  })

  it('finds the version a change named, or the current one when the files are a version', () => {
    const named = version('Before the rewrite', true)
    expect(
      versionSaved({ versions: [named], current: { ...named, changed: true } }, named.name),
    ).toBe(named)
    const current = { ...version('v1', true), changed: false }
    expect(versionSaved({ versions: [], current }, 'Anything')).toBe(current)
    expect(
      versionSaved({ versions: [], current: { ...current, changed: true } }, 'Anything'),
    ).toBeUndefined()
    expect(versionSaved(undefined, 'x')).toBeUndefined()
  })

  it('says what saving does', () => {
    const current = { ...version('x', false), version: 'v2', changed: true }
    expect(versionDetail({ versions: [], current }, undefined)).toBe('Saves the files as v2')
    expect(versionDetail({ versions: [], current }, version('x', true))).toBe('Version v1')
    expect(versionDetail(undefined, undefined)).toBe('A version of the files')
  })
})

describe('unsavedFiles', () => {
  const drafts = { 'SKILL.md': { text: 'edited' }, 'references/a.md': { text: 'same' } }
  it('counts a draft only when its text differs from the file as saved', () => {
    expect(unsavedFiles({ 'SKILL.md': 'saved', 'references/a.md': 'same' }, drafts)).toEqual([
      'SKILL.md',
    ])
  })
  it('counts a draft of a file that is not on disk', () => {
    expect(unsavedFiles({}, { 'references/new.md': { text: '' } })).toEqual(['references/new.md'])
  })
  it('counts every draft until the saved files are read', () => {
    expect(unsavedFiles(null, drafts)).toEqual(['SKILL.md', 'references/a.md'])
  })
})
