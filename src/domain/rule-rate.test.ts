import { describe, expect, it } from 'vitest'
import type { Verdict } from './pack.ts'
import { mostlyBroken, newestRates, ruleRates } from './rule-rate.ts'

const rule = (text: string, met: boolean, aside?: Verdict['aside']): Verdict =>
  ({
    kind: 'rule',
    id: `rule:${text}`,
    text,
    layer: 'adherence',
    met,
    jev: met,
    open: true,
    corrected: false,
    ...(aside ? { aside, met: false, jev: null } : {}),
  }) as Verdict

describe('ruleRates', () => {
  it('counts each rule followed and broken over the outputs with a score', () => {
    const rates = ruleRates([
      { total: 50, verdicts: [rule('Be brief.', false), rule('Use plain words.', true)] },
      { total: 0, verdicts: [rule('Be brief.', false), rule('Use plain words.', false)] },
      { total: 100, verdicts: [rule('Be brief.', true), rule('Use plain words.', true)] },
      // No score: it counts for nothing, whatever it says.
      { total: null, verdicts: [rule('Be brief.', false)] },
    ])
    expect(rates.get('Be brief.')).toEqual({ followed: 1, broken: 2 })
    expect(rates.get('Use plain words.')).toEqual({ followed: 2, broken: 1 })
  })

  it('counts a rule Jev was not sure of, or one that does not apply, as neither', () => {
    const rates = ruleRates([
      { total: 100, verdicts: [rule('Be brief.', false, 'unsure')] },
      { total: 100, verdicts: [rule('Be brief.', false, 'inapplicable')] },
      { total: 100, verdicts: [rule('Be brief.', true)] },
    ])
    expect(rates.get('Be brief.')).toEqual({ followed: 1, broken: 0 })
    expect(ruleRates([{ total: 100, verdicts: [rule('Ask.', false, 'unsure')] }]).size).toBe(0)
  })

  it('counts a check as no rule, and a rule once an output', () => {
    const check = { ...rule('Names Priya.', false), kind: 'check' } as Verdict
    const rates = ruleRates([
      { total: 0, verdicts: [check, rule('Be brief.', false), rule('Be brief.', false)] },
    ])
    expect([...rates]).toEqual([['Be brief.', { followed: 0, broken: 1 }]])
  })
})

describe('newestRates', () => {
  it('reads each rule on the newest version that counted it', () => {
    const v1 = new Map([
      ['Be brief.', { followed: 0, broken: 4 }],
      ['Ask first.', { followed: 1, broken: 2 }],
    ])
    const v2 = new Map([['Be brief.', { followed: 3, broken: 0 }]])
    const rates = newestRates([v1, v2])
    // Broken on v1, followed on v2: the fix shows. A rule v2 did not run keeps v1's count.
    expect(rates.get('Be brief.')).toEqual({ followed: 3, broken: 0 })
    expect(rates.get('Ask first.')).toEqual({ followed: 1, broken: 2 })
    expect(newestRates([]).size).toBe(0)
  })
})

describe('mostlyBroken', () => {
  it('is true when more outputs broke the rule than followed it', () => {
    expect(mostlyBroken({ followed: 1, broken: 2 })).toBe(true)
    expect(mostlyBroken({ followed: 1, broken: 1 })).toBe(false)
    expect(mostlyBroken({ followed: 3, broken: 0 })).toBe(false)
  })
})
