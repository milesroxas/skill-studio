import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import { describe, expect, it } from 'vitest'
import { type GenericRaw, genericScoring } from './score.ts'

const config = mergeConfig({ packs: ['generic'] }, [genericScoring])
const subject: ScoreSubject = { case: null, primary: null, artifacts: [], words: 0, range: null }

const raw: GenericRaw = {
  adherence: {
    rules: [
      { id: 'r1', text: 'Open with the first name.', section: 'Rules', noul: 0.9 },
      { id: 'r2', text: 'Keep it under 25 words.', section: 'Rules', noul: 0.2 },
    ],
  },
  rubric: {
    statements: [
      { id: 'g1', text: 'The note names Priya.', weight: 1, noul: 0.8, units: null, best: null },
      {
        id: 'g2',
        text: 'The note has two sentences.',
        weight: 2,
        noul: 0.3,
        units: [0.1, 0.3],
        best: 1,
      },
    ],
  },
}

describe('generic scoring', () => {
  it('counts rules followed and checks met, and flags each miss', () => {
    const { layers, flags } = genericScoring.score(raw, subject, config)
    expect(layers).toEqual({ adherence: 1 / 2, rubric: 1 / 3 })
    expect(flags).toEqual([
      'rule not followed (Rules): Keep it under 25 words.',
      'grader g2 (×2) not met: The note has two sentences. (closest: unit 2)',
    ])
  })

  it('names each fact by its kind and its words, so an edited rule is a new fact', () => {
    const { verdicts } = genericScoring.score(raw, subject, config)
    expect(verdicts.map((v) => [v.id, v.met, v.layer])).toEqual([
      ['rule:Open with the first name.', true, 'adherence'],
      ['rule:Keep it under 25 words.', false, 'adherence'],
      ['check:The note names Priya.', true, 'rubric'],
      ['check:The note has two sentences.', false, 'rubric'],
    ])
    expect(verdicts.every((v) => v.open && !v.corrected)).toBe(true)
    expect(verdicts[1].section).toBe('Rules')
    expect(verdicts[3].weight).toBe(2)
  })

  it('lets the reader’s answer stand over Jev’s, either way', () => {
    const { layers, flags, verdicts } = genericScoring.score(raw, subject, config, {
      'rule:Keep it under 25 words.': true,
      'check:The note names Priya.': false,
    })
    expect(layers).toEqual({ adherence: 1, rubric: 0 })
    expect(flags).toEqual([
      'grader g1 not met: The note names Priya.',
      'grader g2 (×2) not met: The note has two sentences. (closest: unit 2)',
    ])
    expect(verdicts.filter((v) => v.corrected).map((v) => v.id)).toEqual([
      'rule:Keep it under 25 words.',
      'check:The note names Priya.',
    ])
  })

  it('does not call an answer corrected when it says what Jev said', () => {
    const { verdicts } = genericScoring.score(raw, subject, config, {
      'rule:Open with the first name.': true,
    })
    expect(verdicts[0]).toMatchObject({ met: true, corrected: false })
  })

  it('leaves every layer out without raw answers', () => {
    expect(genericScoring.score(null, subject, config)).toEqual({
      layers: { adherence: null, rubric: null },
      flags: [],
      verdicts: [],
    })
  })
})
