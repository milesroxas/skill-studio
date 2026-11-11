import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config.ts'
import type { PackScoring } from './pack.ts'
import type { BenchConfig } from './schemas.ts'
import { checkReaders, layerOrder, scoreResult } from './scoring.ts'

type Raw = { layers: Record<string, number | null>; certainties?: number[] }

/** A fixture pack that returns whatever layer shares its stored answers hold. */
const pack = (id: string, layers: string[], checks: string | null = null): PackScoring<Raw> => ({
  id,
  artifacts: [],
  layers,
  checks,
  defaults: {},
  score: (raw, _subject, _config, corrections = {}) => ({
    layers: Object.fromEntries(layers.map((l) => [l, raw?.layers[l] ?? null])),
    flags: raw ? [] : [`${id}: not judged`],
    verdicts: raw
      ? layers.map((layer) => ({
          id: `rule:${layer}`,
          kind: 'rule' as const,
          text: layer,
          met: corrections[`rule:${layer}`] ?? (raw.layers[layer] ?? 0) >= 0.5,
          open: true as const,
          jev: (raw.layers[layer] ?? 0) >= 0.5,
          corrected: corrections[`rule:${layer}`] !== undefined,
          layer,
        }))
      : [],
  }),
  certainties: (raw) => raw?.certainties ?? [],
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

  it('takes one mean over every answer, so a pack that asked more counts for more', () => {
    const { confidence } = scoreResult(
      result({
        voice: { layers: {}, certainties: [0.9, 0.9, 0.9] },
        rules: { layers: {}, certainties: [0.5] },
      }),
      config(),
      scorers,
    )
    // Three answers at 0.9 and one at 0.5: 0.8. A mean of the two packs' means would say 0.7.
    expect(confidence).toBeCloseTo(0.8)
  })

  it('holds every layer to 0 to 100 whatever a pack returns, and so the total', () => {
    const { scores } = scoreResult(
      result({
        voice: { layers: { voice: 1.75, clarity: -1.2 } },
        rules: { layers: { adherence: Number.NaN } },
      }),
      config(),
      scorers,
    )
    expect(scores).toEqual({ total: 67, voice: 100, clarity: 0, adherence: null })
  })

  it('judges a file with no word in it, such as `{}`, as an output', () => {
    const packs = { voice: { layers: { voice: 1, clarity: 1 } } }
    const json = scoreResult(result(packs, { words: 0, blank: false }), config(), scorers)
    expect(json.scores.total).toBe(100)
    expect(json.flags).not.toContain('no output to judge')
    // A report that does not say whether its file was blank reads only a missing file as none.
    expect(scoreResult(result(packs, { words: 0 }), config(), scorers).scores.total).toBe(100)
  })

  it('scores an output with nothing in it 0, in total and on every layer a pack scored', () => {
    const packs = { voice: { layers: { voice: 1, clarity: null } } }
    // No file at all, and a file that says nothing: both are a failed sample, never left out of a mean.
    for (const over of [{ primary: null }, { words: 0, blank: true }]) {
      const { scores, flags } = scoreResult(result(packs, over), config(), scorers)
      expect(scores.total).toBe(0)
      expect(scores.voice).toBe(0)
      expect(scores.clarity).toBeNull()
      expect(flags).toContain('no output to judge')
    }
    expect(scoreResult(result({}, { primary: null }), config(), scorers).scores.total).toBe(0)
    // A picture has no words and is still an output.
    const picture = { primary: { file: 'shot.png', kind: 'image' as const }, words: 0, blank: true }
    const seen = scoreResult(result(packs, picture), config(), scorers)
    expect(seen.scores.total).toBe(100)
    expect(seen.flags).not.toContain('no output to judge')
  })

  it('flags a missing output and a length outside the range', () => {
    expect(scoreResult(result({}, { primary: null }), config(), []).flags).toEqual([
      'no output to judge',
    ])
    expect(scoreResult(result({}, { words: 40, range: [50, 120] }), config(), []).flags).toEqual([
      'length: 40 words, case asks 50 to 120',
    ])
    // An empty file is no output, not a short one.
    expect(
      scoreResult(result({}, { words: 0, blank: true, range: [50, 120] }), config(), []).flags,
    ).toEqual(['no output to judge'])
    expect(scoreResult(result({}, { words: 120, range: [50, 120] }), config(), []).flags).toEqual(
      [],
    )
  })
})

describe('verdicts', () => {
  it('lists the facts of every active pack, after what every output is held to', () => {
    const { verdicts } = scoreResult(
      result(
        { voice: { layers: { voice: 1, clarity: 0.2 } }, rules: { layers: { adherence: 0 } } },
        { words: 40, range: [50, 120] },
      ),
      config(),
      scorers,
    )
    expect(verdicts.map((v) => [v.text, v.met])).toEqual([
      ['length: 40 words, case asks 50 to 120', false],
      ['voice', true],
      ['clarity', false],
      ['adherence', false],
    ])
    expect(verdicts[0]).toMatchObject({ kind: 'other', open: false, layer: null })
  })

  it('hands the reader’s corrections to each pack', () => {
    const { verdicts } = scoreResult(
      result({ rules: { layers: { adherence: 0 } } }),
      config({ packs: ['rules'] }),
      scorers,
      { 'rule:adherence': true },
    )
    expect(verdicts).toEqual([expect.objectContaining({ met: true, corrected: true })])
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
