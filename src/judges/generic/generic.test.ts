import { mergeConfig } from '@domain/config.ts'
import type { ScoreSubject } from '@domain/pack.ts'
import { describe, expect, it } from 'vitest'
import { type GenericRaw, genericScoring } from './score.ts'

const config = mergeConfig({ packs: ['generic'] }, [genericScoring])
const subject: ScoreSubject = {
  case: null,
  primary: { file: 'outputs/output.md', kind: 'markdown' },
  artifacts: [],
  words: 40,
  range: null,
}

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
      'grader g2 (×2) not met: The note has two sentences.',
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
      'grader g2 (×2) not met: The note has two sentences.',
    ])
    expect(verdicts.filter((v) => v.corrected).map((v) => v.id)).toEqual([
      'rule:Keep it under 25 words.',
      'check:The note names Priya.',
    ])
  })

  it('keeps the reader’s answer as theirs when it says what Jev said', () => {
    const { verdicts } = genericScoring.score(raw, subject, config, {
      'rule:Open with the first name.': true,
    })
    expect(verdicts[0]).toMatchObject({ met: true, corrected: true })
  })

  it('leaves a check that was not asked out of the rubric, and flags it', () => {
    const unasked =
      'grader g3 not judged, its picture is not shown to Jev (it is larger than 16 MB): Matches the mock-up.'
    const rubric = { statements: raw.rubric?.statements ?? [], unasked: [unasked] }
    const { layers, flags, verdicts } = genericScoring.score({ ...raw, rubric }, subject, config)
    expect(layers.rubric).toBe(1 / 3)
    expect(flags).toContain(unasked)
    expect(verdicts.find((v) => v.text === unasked)).toMatchObject({ layer: null, met: false })
    // With none asked, the layer is left out of the total.
    const none = genericScoring.score(
      { adherence: null, rubric: { statements: [], unasked: [unasked] } },
      subject,
      config,
    )
    expect(none.layers.rubric).toBeNull()
    expect(none.flags).toEqual([unasked])
  })

  it('flags what Jev read only some of, in a reading kept before and in one made now', () => {
    const old =
      'judged on the first 12,000 characters of the output and none of the files beside it: the whole is more than Jev reads at once'
    const cut = [
      'Jev read only the first 6,000 characters of notes.md',
      'Jev read none of outputs/app.js',
    ]
    for (const [read, lines] of [
      [{ ...raw, short: old }, [old]],
      [{ ...raw, cut }, cut],
    ] as const) {
      const { flags, verdicts, layers } = genericScoring.score(read, subject, config)
      expect(flags).toEqual(expect.arrayContaining([...lines]))
      for (const line of lines)
        expect(verdicts.find((v) => v.text === line)).toMatchObject({ layer: null, met: false })
      expect(layers).toEqual(genericScoring.score(raw, subject, config).layers)
      expect(genericScoring.behind?.(read)).toBeNull()
    }
  })

  it('reads a kept reading of the start of a long output as not read, and as owed a grading', () => {
    // Kept before long outputs were asked in parts: each answer is of the first 40,000 characters alone.
    const cut = ['Jev read only the first 40,000 characters of the output']
    const kept = { ...raw, cut }
    const { flags, verdicts, layers } = genericScoring.score(kept, subject, config)
    expect(layers).toEqual({ adherence: null, rubric: null })
    const facts = verdicts.filter((v) => v.kind === 'rule' || v.kind === 'check')
    expect(facts).toHaveLength(4)
    for (const fact of facts) expect(fact).toMatchObject({ aside: 'unread', met: false, jev: null })
    expect(flags).toEqual(expect.arrayContaining(cut))
    expect(flags).toContain(
      'rule not counted, the output is too long for Jev to read it whole (Rules): Keep it under 25 words.',
    )
    expect(flags).toContain(
      'grader g2 not counted, the output is too long for Jev to read it whole: The note has two sentences.',
    )
    expect(genericScoring.behind?.(kept)).toBe('Graded by an older version of Skill Studio')
    // Jev answered nothing of the whole, so it was sure of nothing.
    expect(genericScoring.certainties(kept, config)).toEqual([])
    // The reader's own answer on a fact not read counts.
    const yours = genericScoring.score(kept, subject, config, {
      'rule:Keep it under 25 words.': true,
    })
    expect(yours.layers.adherence).toBe(1)
    expect(yours.verdicts.find((v) => v.id === 'rule:Keep it under 25 words.')).toMatchObject({
      met: true,
      corrected: true,
      jev: null,
    })
    expect(yours.verdicts.find((v) => v.id === 'rule:Keep it under 25 words.')).not.toHaveProperty(
      'aside',
    )
  })

  it('joins the answers of an output asked in parts, by each fact’s span where it is known', () => {
    const parted: GenericRaw = {
      parts: { read: 2, of: 2 },
      adherence: {
        rules: [
          // Every part met: met, as sure as the least sure part.
          {
            id: 'r1',
            text: 'Open with the first name.',
            section: 'Rules',
            noul: 0.9,
            parts: [0.9, 0.8],
          },
          // The parts differ and nobody said how to join them: not read.
          {
            id: 'r2',
            text: 'Keep it under 25 words.',
            section: 'Rules',
            noul: 0.9,
            parts: [0.9, 0.1],
          },
          // Something forbidden that one part does: missed.
          {
            id: 'r3',
            text: 'Never name the codename.',
            section: 'Rules',
            noul: 0.9,
            parts: [0.9, 0.1],
            span: 'every',
          },
        ],
      },
      rubric: {
        statements: [
          // Something present in one part: met.
          {
            id: 'g1',
            text: 'The page has a footer.',
            weight: 1,
            noul: 0.2,
            parts: [0.2, 0.95],
            span: 'any',
            units: null,
            best: null,
          },
        ],
      },
    }
    const { layers, verdicts } = genericScoring.score(parted, subject, config)
    const by = (id: string) => verdicts.find((v) => v.id === id)
    expect(by('rule:Open with the first name.')).toMatchObject({ met: true, jev: true })
    expect(by('rule:Keep it under 25 words.')).toMatchObject({ aside: 'unread', jev: null })
    expect(by('rule:Never name the codename.')).toMatchObject({ met: false, jev: false })
    expect(by('check:The page has a footer.')).toMatchObject({ met: true, jev: true })
    expect(layers).toEqual({ adherence: 1 / 2, rubric: 1 })
    // How sure Jev was is read off the joined answers; the one not read has none.
    expect(genericScoring.certainties(parted, config)).toHaveLength(3)
    expect(genericScoring.behind?.(parted)).toBeNull()
  })

  it('leaves every layer out without raw answers', () => {
    expect(genericScoring.score(null, subject, config)).toEqual({
      layers: { adherence: null, rubric: null },
      flags: [],
      verdicts: [],
    })
  })
})
