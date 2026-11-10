import { describe, expect, it } from 'vitest'
import { maxTokensWithin } from './anthropic.ts'

describe('maxTokensWithin', () => {
  it("asks for no more than the model's own limit", () => {
    expect(maxTokensWithin(8192)).toBe(8192)
    expect(maxTokensWithin(64_000)).toBe(64_000)
  })

  it('asks for the usual room when the model allows more, or its limit is not known', () => {
    expect(maxTokensWithin(128_000)).toBe(64_000)
    expect(maxTokensWithin(undefined)).toBe(64_000)
    expect(maxTokensWithin(null)).toBe(64_000)
  })
})
