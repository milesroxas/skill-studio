import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { blankDraft } from '@domain/case-draft.ts'
import { emptyDrafts } from '@domain/schemas.ts'
import { afterAll, describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-drafts-home-'))
process.env.SKILL_STUDIO_HOME = home
afterAll(() => rmSync(home, { recursive: true, force: true }))
const { readDrafts, writeDrafts } = await import('./drafts.ts')

const draftsDir = join(home, '.skill-studio', 'drafts')

describe('drafts', () => {
  it('reads nothing for a skill with no drafts', () => {
    expect(readDrafts('/skills/none')).toEqual(emptyDrafts())
  })

  it('keeps a skill’s drafts apart from another’s', () => {
    writeDrafts('/skills/a', {
      ...emptyDrafts(),
      files: { 'SKILL.md': { text: 'draft of a', previous: 'saved a' } },
    })
    expect(readDrafts('/skills/a').files['SKILL.md']).toEqual({
      text: 'draft of a',
      previous: 'saved a',
    })
    expect(readDrafts('/skills/b').files).toEqual({})
  })

  it('keeps when each drafted case was saved as its draft began', () => {
    writeDrafts('/skills/bases', {
      ...emptyDrafts(),
      cases: { intro: { ...blankDraft(), id: 'intro', prompt: 'p' } },
      caseBases: { intro: '2026-11-09T10:00:00.000Z' },
    })
    expect(readDrafts('/skills/bases').caseBases).toEqual({ intro: '2026-11-09T10:00:00.000Z' })
  })

  it('keeps unsaved scoring, on its own too', () => {
    const scoring = { packs: ['generic'], rules: null, weights: { adherence: 50 }, yes: 0.6 }
    writeDrafts('/skills/scoring', { ...emptyDrafts(), scoring })
    expect(readDrafts('/skills/scoring').scoring).toEqual(scoring)
    writeDrafts('/skills/scoring', { ...emptyDrafts(), scoring: null })
    expect(readDrafts('/skills/scoring')).toEqual(emptyDrafts())
  })

  it('stamps when the drafts were stored', () => {
    const updatedAt = writeDrafts('/skills/c', {
      ...emptyDrafts(),
      cases: {
        '+new': {
          id: 'x',
          title: '',
          prompt: 'p',
          expectedOutcome: '',
          words: null,
          images: [],
          graders: [],
        },
      },
    })
    expect(updatedAt).not.toBeNull()
    expect(readDrafts('/skills/c').updatedAt).toBe(updatedAt)
  })

  it('removes the file once nothing is left', () => {
    writeDrafts('/skills/d', {
      ...emptyDrafts(),
      files: { 'SKILL.md': { text: 'x', previous: null } },
    })
    const before = readdirSync(draftsDir).length
    expect(writeDrafts('/skills/d', emptyDrafts())).toBeNull()
    expect(readdirSync(draftsDir).length).toBe(before - 1)
  })
})
