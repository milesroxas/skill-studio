import { describe, expect, it } from 'vitest'
import { changeAnswers } from './change.ts'
import { NO_CORRECTIONS } from './pack.ts'

describe('changeAnswers', () => {
  it('keeps the reader’s answer only on a fact answered at both ends', () => {
    const kept = changeAnswers(
      [{ 'rule:Be brief.': false, 'check:Names Priya.': true }],
      [{ 'rule:Be brief.': true }, { 'check:Is short.': true }],
    )
    // The rule is answered at both ends, on an output of each; each check at one end only.
    expect(kept.a).toEqual([{ 'rule:Be brief.': false }])
    expect(kept.b).toEqual([{ 'rule:Be brief.': true }, NO_CORRECTIONS])
  })

  it('reads every fact as Jev answered it when the reader answered at one end only', () => {
    const kept = changeAnswers([NO_CORRECTIONS], [{ 'rule:Be brief.': true }])
    expect(kept).toEqual({ a: [NO_CORRECTIONS], b: [NO_CORRECTIONS] })
  })

  it('hands back the same answers when every one is kept', () => {
    const a = { 'rule:Be brief.': true }
    const b = { 'rule:Be brief.': true }
    const kept = changeAnswers([a], [b])
    expect(kept.a[0]).toBe(a)
    expect(kept.b[0]).toBe(b)
  })
})
