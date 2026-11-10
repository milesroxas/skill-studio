import { describe, expect, it } from 'vitest'
import { keptConfig, mergedConfig, scoringDirty } from './model.ts'

const saved = mergedConfig(null)
const edited = { ...saved, yes: saved.yes / 2 }

describe('scoringDirty', () => {
  it('is false for the scoring as saved', () => {
    expect(scoringDirty(saved, null)).toBe(false)
    expect(scoringDirty(mergedConfig({ packs: saved.packs }), { packs: saved.packs })).toBe(false)
  })

  it('is true once the scoring in hand differs', () => {
    expect(scoringDirty(edited, null)).toBe(true)
  })
})

describe('keptConfig', () => {
  it('takes the saved scoring on a first read', () => {
    expect(keptConfig(null, null, saved)).toBe(saved)
  })

  it('keeps an edit that is not saved yet', () => {
    expect(keptConfig(edited, saved, saved)).toBe(edited)
  })

  it('takes a scoring that changed on disk when nothing was edited here', () => {
    const onDisk = { ...saved, yes: 0.9 }
    expect(keptConfig(saved, saved, onDisk)).toBe(onDisk)
  })

  it('never keeps a scoring read for another skill: with no read before it, the new one stands', () => {
    const other = { ...saved, yes: 0.1 }
    expect(keptConfig(other, null, saved)).toBe(saved)
  })
})
