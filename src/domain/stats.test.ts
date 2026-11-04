import { describe, expect, it } from 'vitest'
import { agreement, certainty, mean, spearman, spread, stddev, weighted } from './stats.ts'

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

describe('spread', () => {
  it('is max minus min, null when empty', () => {
    expect(spread([3, 9, 1])).toBe(8)
    expect(spread([])).toBeNull()
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

describe('spearman', () => {
  it('is 1 for the same order and -1 for the reverse', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1)
    expect(spearman([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1)
  })
  it('depends on rank, not magnitude', () => {
    expect(spearman([1, 2, 3], [1, 100, 1000])).toBeCloseTo(1)
  })
  it('gives tied values their average rank', () => {
    // ranks a = [1, 2.5, 2.5, 4], b = [1, 2, 3, 4]
    expect(spearman([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9487, 3)
  })
  it('is null under three pairs, on length mismatch, or with a constant list', () => {
    expect(spearman([1, 2], [1, 2])).toBeNull()
    expect(spearman([1, 2, 3], [1, 2])).toBeNull()
    expect(spearman([1, 1, 1], [1, 2, 3])).toBeNull()
  })
})

describe('agreement', () => {
  it('counts only keys both voted on', () => {
    const jev = { x: 'a', y: 'b', z: 'tie' }
    const human = { x: 'a', y: 'a', w: 'b' }
    expect(agreement(jev, human)).toEqual({ agreed: 1, compared: 2, share: 0.5 })
  })
  it('has a null share when nothing overlaps', () => {
    expect(agreement({ x: 'a' }, { y: 'a' })).toEqual({ agreed: 0, compared: 0, share: null })
  })
})
