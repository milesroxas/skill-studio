import { describe, expect, it } from 'vitest'
import { mergedConfig } from './model.ts'
import { restoredScoring, scoringToKeep } from './scoring-draft.ts'

const saved = mergedConfig(null)
const edited = { ...saved, yes: saved.yes / 2 }

describe('restoredScoring', () => {
  it('gives back a stored edit', () => {
    expect(restoredScoring(edited, null)).toEqual(edited)
  })

  it('gives back nothing when there is no draft, or it says what is saved', () => {
    expect(restoredScoring(null, null)).toBeNull()
    expect(restoredScoring(saved, null)).toBeNull()
    // Saved since the draft was stored: there is nothing left to give back.
    expect(restoredScoring(edited, edited)).toBeNull()
  })
})

describe('scoringToKeep', () => {
  it('keeps an edit and drops the scoring as saved', () => {
    expect(scoringToKeep(edited, null)).toBe(edited)
    expect(scoringToKeep(saved, null)).toBeNull()
  })
})
