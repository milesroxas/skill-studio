import { describe, expect, it } from 'vitest'
import type { Verdict } from './pack.ts'
import {
  checkIds,
  codeVerdict,
  countOf,
  finding,
  jevVerdict,
  layerCount,
  readingOf,
  sumCounts,
  verdictId,
} from './verdict.ts'

const rule = { kind: 'rule' as const, text: 'Be brief.', layer: 'adherence' }
/** One threshold, as a `bench.json` that names `yes` alone reads: every answer is a yes or a no. */
const BINARY = { yes: 0.5, no: 0.5 }
/** The thresholds every skill starts with. */
const CUTS = { yes: 0.7, no: 0.3 }

describe('jevVerdict', () => {
  it('is met when the probability reaches the threshold', () => {
    expect(jevVerdict(rule, 0.5, BINARY, {})).toMatchObject({ met: true, open: true })
    expect(jevVerdict(rule, 0.49, BINARY, {})).toMatchObject({ met: false, corrected: false })
  })

  it('takes the reader’s answer over Jev’s', () => {
    const id = verdictId('rule', 'Be brief.')
    expect(jevVerdict(rule, 0.1, BINARY, { [id]: true })).toMatchObject({
      met: true,
      jev: false,
      corrected: true,
    })
    expect(jevVerdict(rule, 0.9, BINARY, { [id]: false })).toMatchObject({
      met: false,
      jev: true,
      corrected: true,
    })
  })

  it('keeps an answer the reader gave when a moved threshold brings Jev round to it', () => {
    const id = verdictId('rule', 'Be brief.')
    expect(jevVerdict(rule, 0.6, BINARY, { [id]: true })).toMatchObject({
      met: true,
      jev: true,
      corrected: true,
    })
  })

  it('sets an answer between the two thresholds aside, as neither met nor missed', () => {
    expect(readingOf(0.7, CUTS)).toBe('met')
    expect(readingOf(0.69, CUTS)).toBe('unsure')
    expect(readingOf(0.31, CUTS)).toBe('unsure')
    expect(readingOf(0.3, CUTS)).toBe('missed')
    expect(jevVerdict(rule, 0.49, CUTS, {})).toMatchObject({
      met: false,
      aside: 'unsure',
      jev: null,
      corrected: false,
    })
    expect(jevVerdict(rule, 0.9, CUTS, {})).not.toHaveProperty('aside')
  })

  it('sets a rule for another kind of work aside whatever was answered of it', () => {
    expect(readingOf(0.05, CUTS, 0.02)).toBe('inapplicable')
    expect(readingOf(0.95, CUTS, 0.3)).toBe('inapplicable')
    // Not sure the heading is for this work: the rule's own answer stands.
    expect(readingOf(0.05, CUTS, 0.5)).toBe('missed')
    expect(readingOf(0.95, CUTS, 0.5)).toBe('met')
    expect(jevVerdict(rule, 0.05, CUTS, {}, 0.02)).toMatchObject({
      met: false,
      aside: 'inapplicable',
      jev: null,
    })
  })

  it('counts a fact set aside once the reader answers it', () => {
    const id = verdictId('rule', 'Be brief.')
    const answered = jevVerdict(rule, 0.5, CUTS, { [id]: true })
    expect(answered).toMatchObject({ met: true, jev: null, corrected: true })
    expect(answered).not.toHaveProperty('aside')
    expect(jevVerdict(rule, 0.05, CUTS, { [id]: false }, 0.02)).toMatchObject({
      met: false,
      corrected: true,
    })
    expect(jevVerdict(rule, 0.05, CUTS, { [id]: false }, 0.02)).not.toHaveProperty('aside')
  })

  it('reads every answer as a yes or a no under a config that names no `no`', () => {
    expect(readingOf(0.5, { yes: 0.5 } as never)).toBe('met')
    expect(readingOf(0.49, { yes: 0.5 } as never)).toBe('missed')
    expect(readingOf(0.49, BINARY, 0.5)).toBe('missed')
  })

  it('keeps a name of its own when it is given one', () => {
    const fixed = { ...rule, kind: 'other' as const, id: 'other:hierarchy' }
    expect(jevVerdict(fixed, 0.1, BINARY, { 'other:hierarchy': true })).toMatchObject({
      id: 'other:hierarchy',
      met: true,
    })
  })
})

describe('checkIds', () => {
  it('names a check by its words, so a name kept in reviews.json still finds it', () => {
    expect(
      checkIds([
        { id: '01-names-priya', text: ' The note names Priya. ' },
        { id: '02-says-sunday', text: 'The note says Sunday.' },
      ]),
    ).toEqual(['check:The note names Priya.', 'check:The note says Sunday.'])
  })

  it('tells two checks with the same words apart by their own ids, the first keeping its name', () => {
    expect(
      checkIds([
        { id: '01-a', text: 'Names Priya.' },
        { id: '02-b', text: 'Says Sunday.' },
        { id: '03-c', text: 'Names Priya.' },
        { id: '04-d', text: 'Names Priya. ' },
      ]),
    ).toEqual([
      'check:Names Priya.',
      'check:Says Sunday.',
      'check:Names Priya. #03-c',
      'check:Names Priya. #04-d',
    ])
  })
})

describe('what code measured', () => {
  it('is never open to a correction', () => {
    expect(codeVerdict(rule, false)).toMatchObject({ met: false, open: false, corrected: false })
    expect(finding('length: 40 words, case asks 50 to 120')).toEqual({
      id: 'other:length: 40 words, case asks 50 to 120',
      kind: 'other',
      text: 'length: 40 words, case asks 50 to 120',
      met: false,
      open: false,
      corrected: false,
      layer: null,
    })
  })
})

describe('counts', () => {
  const verdicts: Verdict[] = [
    jevVerdict(rule, 0.9, BINARY, {}),
    jevVerdict({ ...rule, text: 'Name the person.' }, 0.1, BINARY, {}),
    jevVerdict({ kind: 'check', text: 'Two sentences.', layer: 'rubric' }, 0.9, BINARY, {}),
    finding('no output to judge'),
  ]

  it('counts the facts of one kind, and of one layer', () => {
    expect(countOf(verdicts, 'rule')).toEqual({ met: 1, total: 2, unsure: 0 })
    expect(countOf(verdicts, 'check')).toEqual({ met: 1, total: 1, unsure: 0 })
    expect(layerCount(verdicts, 'adherence')).toEqual({ met: 1, total: 2, unsure: 0 })
  })

  it('counts a weighted check by its weight on both sides, as the layer share does', () => {
    const check = { kind: 'check' as const, layer: 'rubric' }
    const weighted: Verdict[] = [
      jevVerdict({ ...check, text: 'Names Priya.', weight: 2 }, 0.9, BINARY, {}),
      jevVerdict({ ...check, text: 'Two sentences.' }, 0.9, BINARY, {}),
      jevVerdict({ ...check, text: 'Says Saturday.' }, 0.1, BINARY, {}),
    ]
    // 3 of 4 reads as the 75 the bar shows, where 2 of 3 would not.
    expect(countOf(weighted, 'check')).toEqual({ met: 3, total: 4, unsure: 0 })
    expect(layerCount(weighted, 'rubric')).toEqual({ met: 3, total: 4, unsure: 0 })
  })

  it('leaves a fact set aside out of both numbers, and says how many Jev was not sure of', () => {
    const mixed: Verdict[] = [
      jevVerdict(rule, 0.9, CUTS, {}),
      jevVerdict({ ...rule, text: 'Name the person.' }, 0.1, CUTS, {}),
      jevVerdict({ ...rule, text: 'Say the day.' }, 0.5, CUTS, {}),
      jevVerdict({ ...rule, text: 'Frame the device.' }, 0.1, CUTS, {}, 0.02),
    ]
    expect(countOf(mixed, 'rule')).toEqual({ met: 1, total: 2, unsure: 1 })
    // Nothing but rules for other work: no count at all.
    expect(countOf([mixed[3]], 'rule')).toBeNull()
    // Nothing Jev was sure of: a count of none, with what waits for the reader.
    expect(countOf([mixed[2]], 'rule')).toEqual({ met: 0, total: 0, unsure: 1 })
  })

  it('has no count where there are no facts', () => {
    expect(countOf([], 'rule')).toBeNull()
    expect(layerCount(verdicts, 'tone')).toBeNull()
  })

  it('adds counts up across outputs, passing over outputs with none', () => {
    expect(
      sumCounts([{ met: 1, total: 2, unsure: 1 }, null, { met: 3, total: 3, unsure: 2 }]),
    ).toEqual({ met: 4, total: 5, unsure: 3 })
    expect(sumCounts([null, null])).toBeNull()
  })
})
