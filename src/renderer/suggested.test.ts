import type { Meets, ProposedCheck } from '@domain/proposal.ts'
import { describe, expect, it } from 'vitest'
import { askedIn, missedFact, standsLine, waitingFor } from './suggested.ts'

/** A suggestion for `note`, with the answers read on it, missed first when `no` is among them. */
const suggestion = (
  id: string,
  check: string,
  meets: Meets[],
  more: Partial<ProposedCheck> = {},
): ProposedCheck => ({
  id,
  case: 'note',
  cases: [],
  check,
  why: 'Why it matters.',
  basis: { in: 'request', file: null, quote: 'The words that ask for it.' },
  fault: meets.includes('no') ? { key: 'first/note-s1', file: null, quote: null } : null,
  answers: meets.map((m, i) => ({ key: `first/note-s${i + 1}`, meets: m })),
  tells: 'unclear',
  state: 'proposed',
  ...more,
})

describe('waitingFor', () => {
  const met = suggestion('a', 'The note is one line.', ['yes', 'yes'])
  const missed = suggestion('b', 'The note is signed.', ['yes', 'no'])

  it('lists the ones an answer missed first', () => {
    expect(waitingFor([met, missed], 'note', []).map((s) => s.id)).toEqual(['b', 'a'])
  })

  it("leaves out another case's, a decided one, and one a check says already", () => {
    const elsewhere = suggestion('c', 'The page has a title.', ['no'], { case: 'page' })
    const dropped = suggestion('d', 'The note is short.', ['no'], { state: 'dropped' })
    const every = suggestion('e', 'No codename.', ['yes'], { case: null })
    const list = [met, missed, elsewhere, dropped, every]
    // Said in other case and spacing, a check still says it.
    expect(waitingFor(list, 'note', ['the note is  SIGNED']).map((s) => s.id)).toEqual(['a'])
  })
})

describe('missedFact', () => {
  it('counts the ones an answer missed', () => {
    const list = [
      suggestion('a', 'One.', ['no']),
      suggestion('b', 'Two.', ['yes', 'no']),
      suggestion('c', 'Three.', ['yes']),
    ]
    expect(missedFact(list)).toBe('2 missed by an answer')
  })

  it('says it of one alone, and says when every answer meets them', () => {
    expect(missedFact([suggestion('a', 'One.', ['no'])])).toBe('missed by an answer')
    expect(missedFact([suggestion('a', 'One.', ['yes'])])).toBe('met by every answer')
  })
})

describe('standsLine', () => {
  it('counts the answers read', () => {
    expect(standsLine(suggestion('a', 'One.', ['yes', 'no', 'no']))).toBe(
      'Missed by 2 of 3 answers',
    )
    expect(standsLine(suggestion('a', 'One.', ['yes', 'yes', 'yes']))).toBe('Met by all 3 answers')
    expect(standsLine(suggestion('a', 'One.', ['yes']))).toBe('Met by the one answer read')
    expect(standsLine(suggestion('a', 'One.', ['yes', 'cannot tell']))).toBe(
      'Met by 1 of 2 answers',
    )
  })
})

describe('askedIn', () => {
  it('names where the words that ask for it are', () => {
    const at = (basis: ProposedCheck['basis']) => askedIn(suggestion('a', 'One.', [], { basis }))
    expect(at({ in: 'input', file: 'brief.md', quote: 'q' })).toBe('brief.md')
    expect(at({ in: 'note', file: null, quote: 'q' })).toBe('A good answer')
    expect(at({ in: 'request', file: null, quote: 'q' })).toBe('the request')
  })
})
