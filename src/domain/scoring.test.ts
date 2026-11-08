import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config.ts'
import type { PackScoring } from './pack.ts'
import type { BenchConfig } from './schemas.ts'
import { checkReaders, layerOrder, scoreResult } from './scoring.ts'

type Raw = { layers: Record<string, number | null>; confidence?: number }

/** A fixture pack that returns whatever layer shares its stored answers hold. */
const pack = (id: string, layers: string[], checks: string | null = null): PackScoring<Raw> => ({
  id,
  layers,
  checks,
  defaults: {},
  layerHome: {},
  score: (raw) => ({
    layers: Object.fromEntries(layers.map((l) => [l, raw?.layers[l] ?? null])),
    flags: raw ? [] : [`${id}: not judged`],
  }),
  confidence: (raw) => raw?.confidence ?? null,
})

const voice = pack('voice', ['voice', 'clarity'])
const rules = pack('rules', ['adherence'], 'adherence')
const scorers = [voice, rules] as PackScoring[]

const config = (over: Partial<BenchConfig> = {}): BenchConfig => ({
  ...DEFAULT_CONFIG,
  packs: ['voice', 'rules'],
  weights: { voice: 2, clarity: 1, adherence: 1 },
  ...over,
})

const result = (packs: Record<string, unknown>, over = {}) => ({
  packs,
  case: 'intro',
  primary: { file: 'out.md', kind: 'markdown' as const },
  artifacts: [],
  words: 100,
  range: null,
  ...over,
})

describe('scoreResult', () => {
  it('scores layers 0 to 100 and weights the total', () => {
    const { scores } = scoreResult(
      result({
        voice: { layers: { voice: 1, clarity: 0.5 } },
        rules: { layers: { adherence: 0 } },
      }),
      config(),
      scorers,
    )
    // (1 * 2 + 0.5 * 1 + 0 * 1) / 4
    expect(scores).toEqual({ total: 63, voice: 100, clarity: 50, adherence: 0 })
  })

  it('leaves a layer with no answers out of the total and reports it as null', () => {
    const { scores, flags } = scoreResult(
      result({ voice: { layers: { voice: 0.8, clarity: 0.4 } } }),
      config(),
      scorers,
    )
    expect(scores.adherence).toBeNull()
    expect(scores.total).toBe(67) // (0.8 * 2 + 0.4) / 3
    expect(flags).toContain('rules: not judged')
  })

  it('has a null total when no layer was judged', () => {
    const { scores, confidence } = scoreResult(result({}), config(), scorers)
    expect(scores.total).toBeNull()
    expect(confidence).toBeNull()
  })

  it('drops zero-weight and unweighted layers from the total', () => {
    const { scores } = scoreResult(
      result({ voice: { layers: { voice: 1, clarity: 0 } } }),
      config({ weights: { voice: 1, clarity: 0 } }),
      scorers,
    )
    expect(scores.total).toBe(100)
    expect(scores.clarity).toBe(0)
  })

  it('skips packs that are not active', () => {
    const { scores } = scoreResult(
      result({ voice: { layers: { voice: 1 } }, rules: { layers: { adherence: 0 } } }),
      config({ packs: ['voice'] }),
      scorers,
    )
    expect(scores).not.toHaveProperty('adherence')
    expect(scores.total).toBe(100)
  })

  it('averages pack confidences, ignoring packs that asked none', () => {
    const { confidence } = scoreResult(
      result({ voice: { layers: {}, confidence: 0.9 }, rules: { layers: {}, confidence: 0.5 } }),
      config(),
      scorers,
    )
    expect(confidence).toBeCloseTo(0.7)
  })

  it('flags a missing output and a length outside the range', () => {
    expect(scoreResult(result({}, { primary: null }), config(), []).flags).toEqual([
      'no output to judge',
    ])
    expect(scoreResult(result({}, { words: 40, range: [50, 120] }), config(), []).flags).toEqual([
      'length: 40 words, case asks 50 to 120',
    ])
    expect(scoreResult(result({}, { words: 120, range: [50, 120] }), config(), []).flags).toEqual(
      [],
    )
  })
})

describe('layerOrder', () => {
  it('lists active pack layers in order, then total', () => {
    expect(layerOrder(config(), scorers)).toEqual(['voice', 'clarity', 'adherence', 'total'])
    expect(layerOrder(config({ packs: ['rules'] }), scorers)).toEqual(['adherence', 'total'])
  })
})

describe('checkReaders', () => {
  it('names the active packs with a layer that marks the checks', () => {
    expect(checkReaders(config(), scorers).map((p) => p.id)).toEqual(['rules'])
    expect(checkReaders(config({ packs: ['voice'] }), scorers)).toEqual([])
  })
})
