import { describe, expect, it } from 'vitest'
import { maxTokensWithin, systemBlocks } from './anthropic.ts'

describe('systemBlocks', () => {
  it('caches the brief alone, and sends what changes from turn to turn after it', () => {
    expect(systemBlocks({ system: 'Brief.', turn: 'The reader is on the Cases screen.' })).toEqual([
      { type: 'text', text: 'Brief.', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'The reader is on the Cases screen.' },
    ])
    expect(systemBlocks({ system: 'Brief.' })).toHaveLength(1)
  })
})

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
