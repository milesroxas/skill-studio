import { describe, expect, it } from 'vitest'
import { scorers } from './scorers.ts'

describe('scorers', () => {
  it('names the layer that marks the checks as one of the pack’s own layers, or none', () => {
    for (const pack of scorers) if (pack.checks !== null) expect(pack.layers).toContain(pack.checks)
    expect(scorers.filter((p) => p.checks).map((p) => p.id)).toEqual(['generic', 'code', 'design'])
  })
})
