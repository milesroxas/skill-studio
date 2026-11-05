import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyDrafts } from '@domain/schemas.ts'
import { describe, expect, it } from 'vitest'

// The library reads SKILL_STUDIO_HOME once, at import.
const home = mkdtempSync(join(tmpdir(), 'st-drafts-home-'))
process.env.SKILL_STUDIO_HOME = home
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
