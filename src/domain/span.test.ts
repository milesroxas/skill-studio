import { describe, expect, it } from 'vitest'
import { joinParts, type Span } from './span.ts'
import { readingOf } from './verdict.ts'

const SPANS: Span[] = ['any', 'every', 'start', 'end', 'whole']
const cuts = { yes: 0.7, no: 0.3 }
const MET = 0.9
const MISSED = 0.1
const UNSURE = 0.5

describe('joinParts', () => {
  it('reads one part, read, as the answer itself, whatever the span', () => {
    for (const span of [...SPANS, null]) expect(joinParts(span, [0.42], cuts)).toBe(0.42)
  })

  it('reads nothing read as not read', () => {
    for (const span of [...SPANS, null]) {
      expect(joinParts(span, [null], cuts)).toBeNull()
      expect(joinParts(span, [null, null], cuts)).toBeNull()
    }
  })

  describe('any: the fact holds when some part holds it', () => {
    it('takes the highest part when every part was read', () => {
      expect(joinParts('any', [MISSED, 0.95, MET], cuts)).toBe(0.95)
      expect(joinParts('any', [MISSED, 0.2], cuts)).toBe(0.2)
      expect(joinParts('any', [MISSED, UNSURE], cuts)).toBe(UNSURE)
    })
    it('lets a yes stand when another part was not read', () => {
      expect(joinParts('any', [MET, null], cuts)).toBe(MET)
      expect(joinParts('any', [null, MISSED, MET], cuts)).toBe(MET)
    })
    it('reads no yes with a part not read as not read', () => {
      expect(joinParts('any', [MISSED, null], cuts)).toBeNull()
      expect(joinParts('any', [UNSURE, null], cuts)).toBeNull()
    })
  })

  describe('every: the fact holds only when no part breaks it', () => {
    it('takes the lowest part when every part was read', () => {
      expect(joinParts('every', [MET, 0.05, MISSED], cuts)).toBe(0.05)
      expect(joinParts('every', [MET, 0.8], cuts)).toBe(0.8)
      expect(joinParts('every', [MET, UNSURE], cuts)).toBe(UNSURE)
    })
    it('lets a no stand when another part was not read', () => {
      expect(joinParts('every', [MISSED, null], cuts)).toBe(MISSED)
      expect(joinParts('every', [null, MET, MISSED], cuts)).toBe(MISSED)
    })
    it('reads no no with a part not read as not read', () => {
      expect(joinParts('every', [MET, null], cuts)).toBeNull()
      expect(joinParts('every', [UNSURE, null], cuts)).toBeNull()
    })
  })

  it('start: the first part, when it was read', () => {
    expect(joinParts('start', [MISSED, MET], cuts)).toBe(MISSED)
    expect(joinParts('start', [MET, null], cuts)).toBe(MET)
    expect(joinParts('start', [null, MET], cuts)).toBeNull()
  })

  it('end: the last part, when it was read', () => {
    expect(joinParts('end', [MISSED, MET], cuts)).toBe(MET)
    expect(joinParts('end', [null, MISSED], cuts)).toBe(MISSED)
    expect(joinParts('end', [MET, null], cuts)).toBeNull()
  })

  it('whole: not read whenever the output is in more than one part', () => {
    expect(joinParts('whole', [MET, MET], cuts)).toBeNull()
    expect(joinParts('whole', [MISSED, MISSED, MISSED], cuts)).toBeNull()
    expect(joinParts('whole', [MET, null], cuts)).toBeNull()
  })

  describe('unknown span', () => {
    it('answers when every part reads the same way, as sure as the least sure part', () => {
      expect(joinParts(null, [0.95, 0.8], cuts)).toBe(0.8)
      expect(joinParts(undefined, [0.05, 0.2], cuts)).toBe(0.2)
      // Every part not sure, every part read: not sure, which counts in no layer either.
      expect(readingOf(joinParts(null, [0.4, UNSURE], cuts), cuts)).toBe('unsure')
    })
    it('reads parts that differ as not read', () => {
      expect(joinParts(null, [MET, MISSED], cuts)).toBeNull()
      expect(joinParts(null, [MET, UNSURE], cuts)).toBeNull()
      expect(joinParts(null, [MISSED, UNSURE], cuts)).toBeNull()
    })
    it('reads a part not read as not read, whatever the rest says', () => {
      expect(joinParts(null, [MET, null], cuts)).toBeNull()
      expect(joinParts(null, [MISSED, null], cuts)).toBeNull()
    })
  })

  it('reads a joined answer as the join does under the same cuts', () => {
    const parts = [
      [MET, MISSED],
      [MET, 0.8],
      [MISSED, 0.2],
      [UNSURE, MET],
    ]
    for (const span of [...SPANS, null])
      for (const answer of parts) {
        const joined = joinParts(span, answer, cuts)
        if (joined !== null) expect(readingOf(joined, cuts)).not.toBe('unread')
      }
    // A stricter yes moves the join with it: 0.8 is no longer met, so two parts at 0.95 and 0.8 differ.
    expect(joinParts(null, [0.95, 0.8], { yes: 0.85, no: 0.3 })).toBeNull()
  })
})
