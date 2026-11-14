import { describe, expect, it } from 'vitest'
import { type CaseLoad, caseWeight } from './case-weight.ts'

const bare: CaseLoad = {
  prompt: 'Write a thank-you note to Priya.',
  pictures: 0,
  files: 0,
  drawn: false,
}

describe('caseWeight', () => {
  it('is light for a prompt alone', () => {
    const weight = caseWeight(bare)
    expect(weight.level).toBe(1)
    expect(weight.band).toBe('fine')
    expect(weight.parts.map((p) => p.part)).toEqual(['base', 'prompt'])
  })

  it('gives an empty case its base alone', () => {
    expect(caseWeight({ ...bare, prompt: '  ' }).parts).toEqual([{ part: 'base', points: 2 }])
  })

  it('holds a long prompt to one point', () => {
    const long = caseWeight({ ...bare, prompt: 'word '.repeat(2000) })
    expect(long.parts.find((p) => p.part === 'prompt')?.points).toBe(1)
    expect(long.level).toBe(1)
  })

  // The recorded cases: a picture, a folder of 9 files and a page cost four times a bare prompt.
  it('is heavy for a picture, nine files and a page for an answer', () => {
    const weight = caseWeight({ ...bare, pictures: 1, files: 9, drawn: true })
    expect(weight.level).toBe(4)
    expect(weight.band).toBe('long')
    expect(weight.points / caseWeight(bare).points).toBeGreaterThan(3.5)
    expect(weight.points / caseWeight(bare).points).toBeLessThan(4.6)
  })

  it('is very heavy once the folder holds 27 files', () => {
    const weight = caseWeight({ ...bare, pictures: 1, files: 27, drawn: true })
    expect(weight.level).toBe(5)
    expect(weight.band).toBe('over')
  })

  it('stops counting files past thirty', () => {
    const files = (n: number) =>
      caseWeight({ ...bare, files: n }).parts.find((p) => p.part === 'files')?.points
    expect(files(30)).toBe(4)
    expect(files(500)).toBe(4)
    expect(files(1)).toBeCloseTo(1.1)
  })

  it('lists its parts heaviest first', () => {
    const { parts } = caseWeight({ ...bare, pictures: 2, files: 3, drawn: true })
    expect(parts.map((p) => p.part)).toEqual(['pictures', 'drawn', 'base', 'files', 'prompt'])
  })
})
