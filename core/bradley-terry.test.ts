import { describe, expect, it } from 'vitest'
import { bradleyTerry, leaderboards, voteKeys } from './bradley-terry.ts'
import type { Preference } from './schemas.ts'

const pref = (p: Partial<Preference> & Pick<Preference, 'a' | 'b' | 'vote'>): Preference => ({
  criterion: 'overall',
  by: 'human',
  at: '2026-10-31T00:00:00Z',
  ...p,
})

describe('bradleyTerry', () => {
  it('ranks a clear winner first and a clear loser last', () => {
    const ratings = bradleyTerry([
      { a: 'x', b: 'y', vote: 'a' },
      { a: 'y', b: 'z', vote: 'a' },
      { a: 'z', b: 'x', vote: 'b' },
      { a: 'x', b: 'y', vote: 'a' },
    ])
    expect(ratings.map((r) => r.id)).toEqual(['x', 'y', 'z'])
    expect(ratings[0].score).toBeGreaterThan(0)
    expect(ratings[2].score).toBeLessThan(0)
  })

  it('reads a b vote the same whichever side the item sits on', () => {
    const ratings = bradleyTerry([{ a: 'y', b: 'x', vote: 'b' }])
    expect(ratings[0].id).toBe('x')
    expect(ratings[0]).toMatchObject({ wins: 1, losses: 0, games: 1 })
  })

  it('gives equal strength when every game is a tie', () => {
    const ratings = bradleyTerry([
      { a: 'x', b: 'y', vote: 'tie' },
      { a: 'y', b: 'x', vote: 'tie' },
    ])
    for (const r of ratings) {
      expect(r.strength).toBeCloseTo(1)
      expect(r).toMatchObject({ wins: 0, losses: 0, ties: 2, games: 2 })
    }
  })

  it('keeps strengths finite and averaging 1 for an undefeated item', () => {
    const ratings = bradleyTerry([
      { a: 'x', b: 'y', vote: 'a' },
      { a: 'x', b: 'z', vote: 'a' },
    ])
    for (const r of ratings) expect(Number.isFinite(r.strength)).toBe(true)
    const avg = ratings.reduce((s, r) => s + r.strength, 0) / ratings.length
    expect(avg).toBeCloseTo(1)
  })

  it('is empty with no games', () => expect(bradleyTerry([])).toEqual([]))
})

describe('leaderboards', () => {
  it('keeps criteria and voters apart', () => {
    const boards = leaderboards([
      pref({ a: 'x', b: 'y', vote: 'a', by: 'human' }),
      pref({ a: 'x', b: 'y', vote: 'b', by: 'jev' }),
      pref({ a: 'x', b: 'y', vote: 'a', criterion: 'tone' }),
    ])
    expect(Object.keys(boards).sort()).toEqual(['overall', 'tone'])
    expect(boards.overall.human[0].id).toBe('x')
    expect(boards.overall.jev[0].id).toBe('y')
    expect(boards.tone.jev).toEqual([])
  })
})

describe('voteKeys', () => {
  it('keys by unordered pair and flips the vote to match', () => {
    const keys = voteKeys(
      [pref({ a: 'r/b', b: 'r/a', vote: 'a' }), pref({ a: 'r/d', b: 'r/c', vote: 'tie' })],
      'human',
    )
    expect(keys).toEqual({ 'r/a|r/b|overall': 'b', 'r/c|r/d|overall': 'tie' })
  })

  it('makes the same vote from either order agree', () => {
    const human = voteKeys([pref({ a: 'p', b: 'q', vote: 'a' })], 'human')
    const jev = voteKeys([pref({ a: 'q', b: 'p', vote: 'b', by: 'jev' })], 'jev')
    expect(jev).toEqual(human)
  })

  it('only takes the asked voter', () => {
    expect(voteKeys([pref({ a: 'p', b: 'q', vote: 'a', by: 'jev' })], 'human')).toEqual({})
  })
})
