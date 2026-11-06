import { describe, expect, it } from 'vitest'
import { sizeBand, textSize } from './size.ts'

describe('sizeBand', () => {
  it('is fine to level 3, long at 4 and over at 5', () => {
    expect([0, 1, 2, 3, 4, 5].map(sizeBand)).toEqual([
      'fine',
      'fine',
      'fine',
      'fine',
      'long',
      'over',
    ])
  })
})

describe('textSize', () => {
  it('is zero for an empty or blank text', () => {
    expect(textSize('')).toEqual({ lines: 0, tokens: 0, level: 0 })
    expect(textSize('\n  \n')).toEqual({ lines: 0, tokens: 0, level: 0 })
  })

  it('does not count a closing newline as a line', () => {
    expect(textSize('one\ntwo\n').lines).toBe(2)
    expect(textSize('one\ntwo').lines).toBe(2)
  })

  it('estimates four characters to a token, rounded up', () => {
    expect(textSize('abcde').tokens).toBe(2)
  })

  it('starts a short file at level 1', () => {
    expect(textSize('# Skill\n\n- One rule with its why.\n').level).toBe(1)
  })

  it('takes the higher of the line and token levels', () => {
    // 200 short lines: level 3 by lines, level 1 by tokens.
    expect(textSize('- a\n'.repeat(200)).level).toBe(3)
    // One long line of 8,000 characters: 2,000 tokens is level 3.
    expect(textSize('x'.repeat(8000)).level).toBe(3)
  })

  it('tops out at level 5 past 500 lines or 5,000 tokens', () => {
    expect(textSize('a\n'.repeat(501)).level).toBe(5)
    expect(textSize('x'.repeat(20_004)).level).toBe(5)
    expect(textSize('a\n'.repeat(500)).level).toBe(4)
  })
})
