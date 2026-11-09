import { describe, expect, it } from 'vitest'
import { certainty, mean, stddev, weighted } from './stats.ts'

describe('mean', () => {
  it('is null for no values', () => expect(mean([])).toBeNull())
  it('averages values', () => expect(mean([1, 2, 3, 6])).toBe(3))
})

describe('stddev', () => {
  it('is null for no values and 0 for one', () => {
    expect(stddev([])).toBeNull()
    expect(stddev([5])).toBe(0)
  })
  it('uses the sample (n - 1) formula', () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7))
  })
})

describe('weighted', () => {
  it('weights each value by its weight', () => {
    expect(
      weighted([
        [1, 3],
        [0, 1],
      ]),
    ).toBe(0.75)
  })
  it('is null when the weights sum to zero', () => {
    expect(weighted([])).toBeNull()
    expect(weighted([[1, 0]])).toBeNull()
  })
})

describe('certainty', () => {
  it('is 0 at 0.5 and 1 at either end', () => {
    expect(certainty(0.5)).toBe(0)
    expect(certainty(0)).toBe(1)
    expect(certainty(1)).toBe(1)
    expect(certainty(0.75)).toBe(0.5)
  })
})
