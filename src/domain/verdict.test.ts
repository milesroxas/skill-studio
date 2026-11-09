import { describe, expect, it } from 'vitest'
import type { Verdict } from './pack.ts'
import {
  codeVerdict,
  countOf,
  finding,
  jevVerdict,
  layerCount,
  sumCounts,
  verdictId,
} from './verdict.ts'

const rule = { kind: 'rule' as const, text: 'Be brief.', layer: 'adherence' }

describe('jevVerdict', () => {
  it('is met when the probability reaches the threshold', () => {
    expect(jevVerdict(rule, 0.5, 0.5, {})).toMatchObject({ met: true, open: true })
    expect(jevVerdict(rule, 0.49, 0.5, {})).toMatchObject({ met: false, corrected: false })
  })

  it('takes the reader’s answer over Jev’s', () => {
    const id = verdictId('rule', 'Be brief.')
    expect(jevVerdict(rule, 0.1, 0.5, { [id]: true })).toMatchObject({
      met: true,
      jev: false,
      corrected: true,
    })
    expect(jevVerdict(rule, 0.9, 0.5, { [id]: false })).toMatchObject({
      met: false,
      jev: true,
      corrected: true,
    })
  })

  it('keeps an answer the reader gave when a moved threshold brings Jev round to it', () => {
    const id = verdictId('rule', 'Be brief.')
    expect(jevVerdict(rule, 0.6, 0.5, { [id]: true })).toMatchObject({
      met: true,
      jev: true,
      corrected: true,
    })
  })

  it('keeps a name of its own when it is given one', () => {
    const fixed = { ...rule, kind: 'other' as const, id: 'other:hierarchy' }
    expect(jevVerdict(fixed, 0.1, 0.5, { 'other:hierarchy': true })).toMatchObject({
      id: 'other:hierarchy',
      met: true,
    })
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
    jevVerdict(rule, 0.9, 0.5, {}),
    jevVerdict({ ...rule, text: 'Name the person.' }, 0.1, 0.5, {}),
    jevVerdict({ kind: 'check', text: 'Two sentences.', layer: 'rubric' }, 0.9, 0.5, {}),
    finding('no output to judge'),
  ]

  it('counts the facts of one kind, and of one layer', () => {
    expect(countOf(verdicts, 'rule')).toEqual({ met: 1, total: 2 })
    expect(countOf(verdicts, 'check')).toEqual({ met: 1, total: 1 })
    expect(layerCount(verdicts, 'adherence')).toEqual({ met: 1, total: 2 })
  })

  it('counts a weighted check by its weight on both sides, as the layer share does', () => {
    const check = { kind: 'check' as const, layer: 'rubric' }
    const weighted: Verdict[] = [
      jevVerdict({ ...check, text: 'Names Priya.', weight: 2 }, 0.9, 0.5, {}),
      jevVerdict({ ...check, text: 'Two sentences.' }, 0.9, 0.5, {}),
      jevVerdict({ ...check, text: 'Says Saturday.' }, 0.1, 0.5, {}),
    ]
    // 3 of 4 reads as the 75 the bar shows, where 2 of 3 would not.
    expect(countOf(weighted, 'check')).toEqual({ met: 3, total: 4 })
    expect(layerCount(weighted, 'rubric')).toEqual({ met: 3, total: 4 })
  })

  it('has no count where there are no facts', () => {
    expect(countOf([], 'rule')).toBeNull()
    expect(layerCount(verdicts, 'tone')).toBeNull()
  })

  it('adds counts up across outputs, passing over outputs with none', () => {
    expect(sumCounts([{ met: 1, total: 2 }, null, { met: 3, total: 3 }])).toEqual({
      met: 4,
      total: 5,
    })
    expect(sumCounts([null, null])).toBeNull()
  })
})
