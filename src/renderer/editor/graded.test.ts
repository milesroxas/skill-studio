import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { gradedRules, numberTitle, numberTone, rateLine, ruleBulletAt } from './graded.ts'

const SKILL =
  '# Rules\n\n- Keep every answer short and plain.\n- Name the file you changed first.\n'

/** The rate the number of the rule on `line` is drawn with, read from the decoration it gets. */
function rateOn(rates: Map<string, { followed: number; broken: number }>, line: number) {
  const state = EditorState.create({ doc: SKILL, extensions: gradedRules(false, rates) })
  const deco = ruleBulletAt(state, state.doc.line(line).from)
  return (deco?.spec.widget as { rate: unknown } | undefined)?.rate ?? null
}

describe('a rule’s number', () => {
  it('carries the rate of the rule its words name', () => {
    const rates = new Map([['Name the file you changed first.', { followed: 2, broken: 5 }]])
    expect(rateOn(rates, 4)).toEqual({ followed: 2, broken: 5 })
    expect(rateOn(rates, 3)).toBeNull()
  })

  it('turns red where more outputs broke the rule than followed it, over amber', () => {
    expect(numberTone(false, { followed: 2, broken: 5 })).toBe('broken')
    expect(numberTone(true, { followed: 2, broken: 5 })).toBe('broken')
    expect(numberTone(true, { followed: 3, broken: 3 })).toBe('flagged')
    expect(numberTone(false, { followed: 5, broken: 2 })).toBeNull()
    expect(numberTone(false, null)).toBeNull()
  })

  it('says how many answers broke it, for every rule with any', () => {
    expect(rateLine('04', { followed: 2, broken: 5 })).toBe('Rule 04: broken by 5 of 7 answers.')
    expect(rateLine('01', { followed: 1, broken: 0 })).toBe('Rule 01: broken by 0 of 1 answer.')
    expect(rateLine('01', { followed: 0, broken: 0 })).toBeNull()
    expect(numberTitle('04', true, { followed: 2, broken: 5 })).toBe(
      'Rule 04: broken by 5 of 7 answers. The writing checks found something. Click to select it.',
    )
    expect(numberTitle('02', false, null)).toBe('Rule 02. Click to select it.')
  })

  it('says how many answers written without the skill followed it, where any counted it', () => {
    expect(rateLine('04', { followed: 2, broken: 5, without: { followed: 2, broken: 0 } })).toBe(
      'Rule 04: broken by 5 of 7 answers. Followed by 2 of 2 answers written without the skill.',
    )
    expect(rateLine('03', { followed: 0, broken: 0, without: { followed: 0, broken: 1 } })).toBe(
      'Rule 03: followed by 0 of 1 answer written without the skill.',
    )
    expect(rateLine('03', { followed: 1, broken: 0, without: { followed: 0, broken: 0 } })).toBe(
      'Rule 03: broken by 0 of 1 answer.',
    )
  })
})
