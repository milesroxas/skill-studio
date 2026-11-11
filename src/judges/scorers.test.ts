import { BASE_PACK } from '@domain/config.ts'
import { describe, expect, it } from 'vitest'
import { scorers } from './scorers.ts'

describe('scorers', () => {
  it('gives each part of a score to one pack, so nothing is counted twice', () => {
    const layers = scorers.flatMap((pack) => pack.layers)
    expect(new Set(layers).size).toBe(layers.length)
  })

  it('grades rules and checks on any output, whatever kind of file it is', () => {
    const base = scorers.find((pack) => pack.id === BASE_PACK)
    expect(base?.layers).toEqual(['adherence', 'rubric'])
    // No kinds named: the pack applies to every sample.
    expect(base?.artifacts).toEqual([])
  })
})
