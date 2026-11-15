import { describe, expect, it } from 'vitest'
import { blankDraft } from './case-draft.ts'
import { mergeDrafts, touchedBetween, touchedBoth } from './drafts.ts'
import { emptyDrafts, type SkillDrafts } from './schemas.ts'

const file = (text: string) => ({ text, previous: 'saved' })
const drafts = (over: Partial<SkillDrafts>): SkillDrafts => ({ ...emptyDrafts(), ...over })

describe('touchedBetween', () => {
  it('names each draft set, changed or cleared, and no other', () => {
    const kept = file('kept')
    const before = drafts({ files: { 'SKILL.md': kept, 'references/a.md': file('a') } })
    const after = drafts({
      files: { 'SKILL.md': kept, 'references/b.md': file('b') },
      cases: { intro: { ...blankDraft(), id: 'intro' } },
      caseBases: { intro: null },
    })
    expect(touchedBetween(before, after)).toEqual({
      files: ['references/a.md', 'references/b.md'],
      cases: ['intro'],
      bases: ['intro'],
    })
    expect(
      touchedBoth(
        { files: ['a'], cases: [], bases: [] },
        { files: ['a', 'b'], cases: [], bases: [] },
      ).files,
    ).toEqual(['a', 'b'])
  })
})

describe('mergeDrafts', () => {
  it('stores the drafts one writer changed and keeps those another stored meanwhile', () => {
    const intro = { ...blankDraft(), id: 'intro', prompt: 'other window' }
    const stored = drafts({
      files: { 'SKILL.md': file('other window'), 'references/a.md': file('a') },
      cases: { intro },
      caseBases: { intro: '2026-11-15T10:00:00.000Z' },
      updatedAt: '2026-11-15T10:00:00.000Z',
    })
    const mine = drafts({ files: { 'references/b.md': file('mine') } })
    const merged = mergeDrafts(stored, mine, {
      files: ['references/a.md', 'references/b.md'],
      cases: [],
      bases: [],
    })
    expect(merged.files).toEqual({
      'SKILL.md': file('other window'),
      'references/b.md': file('mine'),
    })
    expect(merged.cases).toEqual({ intro })
    expect(merged.caseBases).toEqual({ intro: '2026-11-15T10:00:00.000Z' })
  })

  it('clears a case and its base together', () => {
    const stored = drafts({
      cases: { intro: { ...blankDraft(), id: 'intro' } },
      caseBases: { intro: null },
    })
    const merged = mergeDrafts(stored, emptyDrafts(), { files: [], cases: ['intro'], bases: [] })
    expect(merged.cases).toEqual({})
    expect(merged.caseBases).toEqual({})
  })
})
