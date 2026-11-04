import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from './config.ts'
import type { PackScoring } from './pack.ts'

const pack = (id: string, defaults: PackScoring['defaults']): PackScoring => ({
  id,
  layers: [],
  defaults,
  layerHome: {},
  score: () => ({ layers: {}, flags: [] }),
  confidence: () => null,
})

const generic = pack('generic', { weights: { voice: 30, clarity: 20 }, yes: 0.6 })
const rules = pack('rules', { weights: { adherence: 50 }, strict: true })
const scorers = [generic, rules]

describe('mergeConfig', () => {
  it('returns defaults plus the default pack defaults with nothing saved', () => {
    expect(mergeConfig(null, scorers)).toEqual({
      ...DEFAULT_CONFIG,
      weights: { voice: 30, clarity: 20 },
      yes: 0.6,
    })
  })

  it('only applies defaults from active packs', () => {
    const merged = mergeConfig({ packs: ['generic', 'rules'] }, scorers)
    expect(merged.weights).toEqual({ voice: 30, clarity: 20, adherence: 50 })
    expect(merged.strict).toBe(true)
    expect(mergeConfig({ packs: ['generic'] }, scorers)).not.toHaveProperty('strict')
  })

  it('lays saved values over pack defaults, merging objects one level deep', () => {
    const merged = mergeConfig({ weights: { clarity: 0 }, sure: 0.8 }, scorers)
    expect(merged.weights).toEqual({ voice: 30, clarity: 0 })
    expect(merged.sure).toBe(0.8)
  })

  it('falls back to the default packs for an empty saved list', () => {
    expect(mergeConfig({ packs: [] }, scorers).packs).toEqual(['generic'])
  })

  it('ignores undefined saved values and does not mutate the defaults', () => {
    const merged = mergeConfig({ yes: undefined }, scorers)
    expect(merged.yes).toBe(0.6)
    merged.weights.voice = 1
    expect(DEFAULT_CONFIG.weights).toEqual({})
    expect(generic.defaults.weights).toEqual({ voice: 30, clarity: 20 })
  })
})
