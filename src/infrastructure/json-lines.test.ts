import { describe, expect, it } from 'vitest'
import { jsonLine } from './json-lines.ts'

describe('jsonLine', () => {
  it('reads an object', () => {
    expect(jsonLine('{"type":"result","n":1}')).toEqual({ type: 'result', n: 1 })
  })

  it('is null for text, and for JSON that is not an object', () => {
    for (const line of [
      'not json',
      '{"torn":',
      'null',
      '42',
      'true',
      '"word"',
      '[{"type":"a"}]',
      '',
    ])
      expect(jsonLine(line)).toBeNull()
  })
})
