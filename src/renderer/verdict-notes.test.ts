import type { CodeAnswer } from '@domain/pack.ts'
import type { ExactTest } from '@domain/rule-reading.ts'
import { describe, expect, it } from 'vitest'
import { codeNote, unmarkedNote } from './verdict-notes.ts'

const words: ExactTest = {
  test: 'count',
  read: { part: 'text', skip: null },
  what: 'words',
  compare: 'at most',
  n: 120,
}
const holds: ExactTest = {
  test: 'has',
  read: { part: 'text', skip: null },
  values: { from: 'listed', items: ['Priya'] },
  need: 'all',
  at: 'anywhere',
  match: 'words',
  case: 'any',
}

const answered = (over: Partial<CodeAnswer>): CodeAnswer => ({
  met: false,
  why: null,
  saw: [],
  tests: [],
  stands: true,
  ...over,
})

describe('codeNote', () => {
  it('says what the app counted against the bound, in the words of what it counts', () => {
    const saw = [
      {
        test: 'count' as const,
        answer: 'missed' as const,
        why: null,
        counts: [7524, 7524, 7530, 7530],
        compare: 'at most' as const,
        n: 120,
      },
    ]
    expect(codeNote(answered({ saw, tests: [words] }))).toBe(
      'Checked by the app: 7,524 words, more than 120.',
    )
    const met = [{ ...saw[0], answer: 'met' as const, counts: [98] }]
    expect(codeNote(answered({ met: true, saw: met, tests: [words] }))).toBe(
      'Checked by the app: 98 words, within 120.',
    )
  })

  it('quotes what it found, or names what is not there, from the output and the rule', () => {
    const found = {
      test: 'has' as const,
      answer: 'met' as const,
      why: null,
      found: [{ value: 'Priya', piece: 0, at: 4, text: 'Priya' }],
      missing: [],
      foundTotal: 1,
      missingTotal: 0,
    }
    expect(codeNote(answered({ met: true, saw: [found], tests: [holds] }))).toBe(
      'Checked by the app: found “Priya”.',
    )
    const missing = {
      ...found,
      answer: 'missed' as const,
      found: [],
      missing: ['Priya'],
      foundTotal: 0,
      missingTotal: 1,
    }
    expect(codeNote(answered({ saw: [missing], tests: [holds] }))).toBe(
      'Checked by the app: no “Priya”.',
    )
  })

  it('says why the app could not settle a fact it set aside', () => {
    const saw = [
      {
        test: 'count' as const,
        answer: 'none' as const,
        why: 'convention' as const,
        counts: [119, 121],
        compare: 'at most' as const,
        n: 120,
      },
    ]
    expect(codeNote(answered({ met: null, why: 'convention', saw, tests: [words] }))).toBe(
      'The app could not settle it: 119 to 121 words by different ways of counting, against 120.',
    )
  })

  it('says nothing where Jev’s answer stands', () => {
    expect(codeNote(answered({ met: null, why: 'kind', stands: false }))).toBeNull()
    expect(codeNote(undefined)).toBeNull()
  })
})

describe('unmarkedNote', () => {
  it('says why nobody can mark it, then the fix', () => {
    expect(unmarkedNote({ why: 'vague', with: null, fix: 'Write in a warm, plain tone.' })).toBe(
      'Two careful readers would mark it differently. Try: Write in a warm, plain tone.',
    )
    expect(unmarkedNote({ why: 'conflict', with: 'Open with the headline.', fix: null })).toBe(
      'It cannot hold beside “Open with the headline”.',
    )
  })
})
