import { describe, expect, it } from 'vitest'
import { benchOf, DEFAULT_CONFIG, mergeConfig } from './config.ts'
import type { PackScoring } from './pack.ts'

const pack = (id: string, defaults: PackScoring['defaults']): PackScoring => ({
  id,
  layers: [],
  checks: null,
  defaults,
  score: () => ({ layers: {}, flags: [], verdicts: [] }),
  certainties: () => [],
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
    const merged = mergeConfig({ weights: { clarity: 0 }, yes: 0.8 }, scorers)
    expect(merged.weights).toEqual({ voice: 30, clarity: 0 })
    expect(merged.yes).toBe(0.8)
  })

  it('does not carry on keys nothing reads any more', () => {
    const merged = mergeConfig({ sure: 0.8, agreeAt: 70, defaultCase: 'intro' }, scorers)
    expect(merged).not.toHaveProperty('sure')
    expect(merged).not.toHaveProperty('agreeAt')
    expect(merged).not.toHaveProperty('defaultCase')
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

  it('keeps a pack’s setting when the saved one is of another kind', () => {
    const workflow = pack('workflow', { workflow: { maxRetries: 1, summaryLines: 80 }, cap: 0.5 })
    const saved = { packs: ['workflow'], workflow: null, cap: 'high', weights: null }
    const merged = mergeConfig(saved as never, [workflow])
    expect(merged.workflow).toEqual({ maxRetries: 1, summaryLines: 80 })
    expect(merged.cap).toBe(0.5)
    expect(merged.weights).toEqual({})
    // One level down too: a count that is not a number leaves the default.
    const partly = mergeConfig(
      { packs: ['workflow'], workflow: { maxRetries: '3', summaryLines: 40 } } as never,
      [workflow],
    )
    expect(partly.workflow).toEqual({ maxRetries: 1, summaryLines: 40 })
  })

  it('names each pack once', () => {
    expect(mergeConfig({ packs: ['rules', 'rules', 'generic'] }, scorers).packs).toEqual([
      'rules',
      'generic',
    ])
  })
})

describe('benchOf', () => {
  it('reads anything that is not an object as an empty config', () => {
    for (const raw of [null, undefined, 'x', 3, []])
      expect(benchOf(raw)).toEqual({ packs: [], rules: null, weights: {}, yes: 0.5 })
  })

  it('holds the threshold to a probability and the points at 0 or more', () => {
    expect(benchOf({ yes: 1.5 }).yes).toBe(1)
    expect(benchOf({ yes: -0.2 }).yes).toBe(0)
    expect(benchOf({ yes: 0.45 }).yes).toBe(0.45)
    // Not a number: a null here once read every answer as met.
    expect(benchOf({ yes: null }).yes).toBe(0.5)
    expect(benchOf({ yes: 'high' }).yes).toBe(0.5)
    expect(benchOf({ weights: { a: 200, b: -5, c: 40, d: 'x', e: Number.NaN } }).weights).toEqual({
      a: 200,
      b: 0,
      c: 40,
    })
  })

  it('keeps saved scoring the Scoring screen’s sliders would not reach', () => {
    // An earlier number field had no top: a file saved with it scores as it did.
    const saved = benchOf({ weights: { adherence: 100, rubric: 20 }, yes: 0.9 })
    expect(saved.weights).toEqual({ adherence: 100, rubric: 20 })
    expect(saved.yes).toBe(0.9)
    expect(benchOf({ yes: 0.2 }).yes).toBe(0.2)
  })

  it('holds a number inside a pack’s setting at 0 or more, and a credit within one', () => {
    const read = benchOf({
      structure: { pointerCredit: 3, opening: -9, point: 4 },
      workflow: { maxRetries: -2, summaryLines: Number.POSITIVE_INFINITY },
      lint: { command: 'lint', timeoutSeconds: -1 },
    })
    expect(read.structure).toEqual({ pointerCredit: 1, opening: 0, point: 4 })
    expect(read.workflow).toEqual({ maxRetries: 0 })
    expect(read.lint).toEqual({ command: 'lint', timeoutSeconds: 0 })
    expect(benchOf({ structure: { pointerCredit: -0.5 } }).structure).toEqual({ pointerCredit: 0 })
  })

  it('drops blank and repeated rules, and has none for a list that says nothing', () => {
    expect(benchOf({ rules: ['', '  ', 'Same rule.', ' Same rule. ', 7, 'Other.'] }).rules).toEqual(
      ['Same rule.', 'Other.'],
    )
    expect(benchOf({ rules: ['', ' '] }).rules).toBeNull()
    expect(benchOf({ rules: 'one rule' }).rules).toBeNull()
  })

  it('keeps a cost at or above nothing and a share within one', () => {
    const read = benchOf({ warningCost: -1, groundingPrior: 3, contradictionCap: -0.2 })
    expect(read).toMatchObject({ warningCost: 0, groundingPrior: 1, contradictionCap: 0 })
    expect(benchOf({ groundingPrior: 'most' })).not.toHaveProperty('groundingPrior')
  })

  it('passes a pack’s own settings through, and leaves out keys nothing reads', () => {
    const read = benchOf({ packs: ['writing', 7, 'writing'], writer: 'Ada', sure: 0.8 })
    expect(read.packs).toEqual(['writing'])
    expect(read.writer).toBe('Ada')
    expect(read).not.toHaveProperty('sure')
  })
})
