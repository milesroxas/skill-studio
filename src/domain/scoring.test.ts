import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config.ts'
import { type PackScoring, packFailure } from './pack.ts'
import type { BenchConfig } from './schemas.ts'
import { behindOf, layerOrder, scoreResult } from './scoring.ts'

type Raw = { layers: Record<string, number | null>; certainties?: number[] }

/** A fixture pack that returns whatever layer shares its stored answers hold. */
const pack = (id: string, layers: string[]): PackScoring<Raw> => ({
  id,
  artifacts: [],
  layers,
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
const rules = pack('rules', ['adherence'])
const scorers = [voice, rules] as PackScoring[]

const config = (over: Partial<BenchConfig> = {}): BenchConfig => ({
  ...DEFAULT_CONFIG,
  packs: ['voice', 'rules'],
  weights: { voice: 2, clarity: 1, adherence: 1 },
  ...over,
})

/** One graded output. A pack with no answers here ran and had nothing to say of it, as grading records it. */
const result = (packs: Record<string, unknown>, over = {}) => ({
  packs: { voice: null, rules: null, ...packs },
  case: 'intro',
  primary: { file: 'out.md', kind: 'markdown' as const },
  artifacts: [],
  words: 100,
  range: null,
  flags: [] as string[],
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

  it('gives an output on a file Jev cannot read no score, not 0, and nothing to grade again', () => {
    const packs = { voice: { layers: { voice: 1, clarity: 1 } } }
    const pdf = { primary: { file: 'outputs/report.pdf', kind: 'other' as const }, words: 0 }
    const scored = scoreResult(result(packs, { ...pdf, range: [10, 20] }), config(), scorers)
    expect(scored.scores).toEqual({ total: null, voice: null, clarity: null, adherence: null })
    expect(scored.flags).toEqual(['a kind of file Jev cannot read, so it has no score'])
    expect(scored.verdicts.map((v) => v.text)).toEqual([
      'a kind of file Jev cannot read, so it has no score',
    ])
    expect(scored.regrade).toEqual([])
    // A pack ticked since it was graded is owed nothing either.
    const later = scoreResult(
      result({}, pdf),
      config({ packs: ['voice', 'rules', 'code'] }),
      scorers,
    )
    expect(later.regrade).toEqual([])
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

describe('an output a pack failed on', () => {
  const packs = { rules: { layers: { adherence: 1 } } }
  const flags = ['voice pack failed: no network']

  it('has no total, keeps the layers that were scored, and opens with why', () => {
    const scored = scoreResult(result(packs, { flags }), config(), scorers)
    // Counted from adherence alone the total would read 100, a score of the whole it is not.
    expect(scored.scores).toEqual({ total: null, voice: null, clarity: null, adherence: 100 })
    expect(scored.flags[0]).toBe('voice pack failed: no network')
    expect(scored.verdicts[0]).toMatchObject({
      text: 'Grading failed: no network',
      met: false,
      layer: null,
    })
  })

  it('scores as before once the pack that failed is no longer one the skill is graded as', () => {
    const scored = scoreResult(result(packs, { flags }), config({ packs: ['rules'] }), scorers)
    expect(scored.scores.total).toBe(100)
    expect(scored.flags).toEqual([])
    expect(scored.verdicts.map((v) => v.text)).toEqual(['adherence'])
  })

  it('reads only a failure from the flags it is given: the rest are counted again', () => {
    const stale = ['length: 3 words, case asks 50 to 120', 'rule not followed (S): be brief']
    const scored = scoreResult(result(packs, { flags: stale }), config(), scorers)
    expect(scored.scores.total).toBe(100)
    expect(scored.flags).toEqual(['voice: not judged'])
  })

  it('still scores 0 when the output has nothing in it', () => {
    const scored = scoreResult(result(packs, { flags, primary: null }), config(), scorers)
    expect(scored.scores.total).toBe(0)
  })
})

describe('an output graded before the skill was graded as another kind', () => {
  const graded = { voice: { layers: { voice: 1, clarity: 1 } } }
  /** As a grading that ran `voice` alone records it: `rules` has no entry at all. */
  const before = { ...result({}), packs: graded }

  it('has no total until it is graded as that kind too, and says which', () => {
    const scored = scoreResult(before, config(), scorers)
    expect(scored.scores).toEqual({ total: null, voice: 100, clarity: 100, adherence: null })
    expect(scored.flags[0]).toBe('rules pack not graded')
    // The grading did not fail, so nothing is listed as missed: the reason stands beside the score.
    expect(scored.verdicts.map((v) => v.text)).toEqual(['voice', 'clarity'])
    expect(scored.regrade).toEqual(['Not graded as Rules yet'])
    expect(scored.stale).toEqual(['Not graded as Rules yet'])
  })

  it('stands when that kind ran and had nothing to say, and when it is not ticked', () => {
    const silent = scoreResult(result(graded), config(), scorers)
    expect(silent.scores.total).toBe(100)
    expect(silent.regrade).toEqual([])
    expect(scoreResult(before, config({ packs: ['voice'] }), scorers).scores.total).toBe(100)
  })

  it('names the pack every skill is graded by as its rules and checks', () => {
    const base = { ...voice, id: 'generic' } as PackScoring
    const scored = scoreResult(before, config({ packs: ['voice', 'generic'] }), [
      voice,
      base,
    ] as PackScoring[])
    expect(scored.regrade).toEqual(['Rules and checks are not marked yet'])
  })

  it('still scores 0 when the output has nothing in it, with nothing owed', () => {
    const scored = scoreResult({ ...before, primary: null }, config(), scorers)
    expect(scored.scores.total).toBe(0)
    expect(scored.regrade).toEqual([])
  })
})

describe('a grading that is behind', () => {
  const packs = { voice: { layers: { voice: 1, clarity: 1 } }, rules: { layers: { adherence: 1 } } }

  it('is one made without Jev once a key is set, and one made before its case changed', () => {
    const now = { yardstick: 'b', jev: true }
    expect(behindOf({ yardstick: 'b', model: 'jev' }, now)).toBeNull()
    expect(behindOf({ yardstick: 'b', model: null }, now)).toBe('Graded without Jev')
    // With no key, a grading without Jev is all a grading now would be.
    expect(behindOf({ yardstick: 'b', model: null }, { yardstick: 'b', jev: false })).toBeNull()
    expect(behindOf({ yardstick: 'a', model: 'jev' }, now)).toBe('Graded before its case changed')
  })

  it('is not one that kept no record of what it was held to, nor one whose case is unknown', () => {
    expect(behindOf({ model: 'jev' }, { yardstick: 'b', jev: true })).toBeNull()
    expect(behindOf({ yardstick: 'a', model: 'jev' }, { yardstick: null, jev: true })).toBeNull()
  })

  it('is one graded on other questions, by another Jev model or without the page drawn', () => {
    const was = { model: 'jev-1', packs: { generic: 8, design: 4 }, drawn: true }
    const now = { yardstick: 'b', jev: true, with: { ...was } }
    const graded = (graded: typeof was | Omit<typeof was, 'drawn'>) => ({
      yardstick: 'b',
      model: 'jev-1',
      graded,
    })
    expect(behindOf(graded(was), now)).toBeNull()
    expect(behindOf(graded({ ...was, packs: { generic: 7, design: 4 } }), now)).toBe(
      'Graded by an older version of Skill Studio',
    )
    expect(behindOf(graded({ ...was, model: 'jev-0' }), now)).toBe(
      'Graded by another version of Jev',
    )
    expect(behindOf(graded({ ...was, drawn: false }), now)).toBe(
      'Graded without looking at the page',
    )
    // Nothing was for drawing, or the host draws nothing either: the same grading anywhere.
    expect(behindOf(graded({ model: 'jev-1', packs: was.packs }), now)).toBeNull()
    expect(
      behindOf(graded({ ...was, drawn: false }), { ...now, with: { ...was, drawn: false } }),
    ).toBeNull()
    // A pack the skill is not graded as now, and a model left to stand, take nothing away.
    expect(
      behindOf(graded({ ...was, packs: { generic: 8, design: 1 } }), {
        ...now,
        with: { ...was, packs: { generic: 8 } },
      }),
    ).toBeNull()
    expect(
      behindOf(graded({ ...was, model: 'jev-0' }), { ...now, with: { ...was, model: null } }),
    ).toBeNull()
  })

  it('is not one whose report says nothing of what graded it', () => {
    const now = { yardstick: 'b', jev: true, with: { model: 'jev-2', packs: { generic: 9 } } }
    expect(behindOf({ yardstick: 'b', model: 'jev-1' }, now)).toBeNull()
  })

  it('has no total, keeps its layers and its verdicts, and opens with why', () => {
    const why = 'Graded before its case changed'
    const scored = scoreResult(result(packs), config(), scorers, undefined, why)
    expect(scored.scores).toEqual({ total: null, voice: 100, clarity: 100, adherence: 100 })
    expect(scored.verdicts).toHaveLength(3)
    expect(scored.flags).toContain(why)
    expect(scored.regrade).toEqual([why])
    expect(scored.stale).toEqual([why])
    expect(scoreResult(result(packs), config(), scorers).regrade).toEqual([])
  })

  it('still scores 0 when the output has nothing in it', () => {
    const scored = scoreResult(result(packs, { primary: null }), config(), scorers, undefined, 'x')
    expect(scored.scores.total).toBe(0)
    expect(scored.regrade).toEqual([])
  })
})

describe('packFailure', () => {
  it('reads the pack and the reason from the flag a failed pack leaves, and from no other flag', () => {
    expect(packFailure('generic pack failed: no network')).toEqual({
      pack: 'generic',
      reason: 'no network',
    })
    // An error may run over several lines, or say nothing at all.
    expect(packFailure('code pack failed: spawn sh ENOENT\n  at exec')?.reason).toBe(
      'spawn sh ENOENT\n  at exec',
    )
    expect(packFailure('code pack failed: ')).toEqual({ pack: 'code', reason: '' })
    expect(packFailure('rule not followed (S): say when a pack failed: plainly')).toBeNull()
    expect(packFailure('no output to judge')).toBeNull()
  })
})

describe('an output with nothing in it', () => {
  it('is scored from that one fact: no part reads as met beside its 0', () => {
    const scored = scoreResult(
      result(
        { voice: { layers: { voice: 1, clarity: 1 } }, rules: { layers: { adherence: 1 } } },
        { primary: null },
      ),
      config(),
      scorers,
    )
    expect(scored.scores).toEqual({ total: 0, voice: 0, clarity: 0, adherence: 0 })
    expect(scored.verdicts.map((v) => [v.text, v.met, v.layer])).toEqual([
      ['no output to judge', false, null],
    ])
  })
})

describe('layerOrder', () => {
  it('lists active pack layers in order, then total', () => {
    expect(layerOrder(config(), scorers)).toEqual(['voice', 'clarity', 'adherence', 'total'])
    expect(layerOrder(config({ packs: ['rules'] }), scorers)).toEqual(['adherence', 'total'])
  })
})
