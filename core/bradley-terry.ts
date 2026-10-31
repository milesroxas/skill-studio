import type { Preference, Vote } from './schemas.ts'

export interface Rating {
  id: string
  /** Bradley-Terry strength, mean 1. */
  strength: number
  /** log(strength) on a 0-centred scale, easier to read. */
  score: number
  wins: number
  losses: number
  ties: number
  games: number
}

interface Game {
  a: string
  b: string
  vote: Vote
}

/**
 * Bradley-Terry strengths from pairwise votes, by the MM algorithm. A tie is
 * half a win for each side. Items never voted on get strength 1.
 */
export function bradleyTerry(games: Game[], iterations = 200): Rating[] {
  const ids = [...new Set(games.flatMap((g) => [g.a, g.b]))]
  const wins = new Map<string, number>(ids.map((id) => [id, 0]))
  const losses = new Map<string, number>(ids.map((id) => [id, 0]))
  const ties = new Map<string, number>(ids.map((id) => [id, 0]))
  const pairs = new Map<string, { a: string; b: string; aWins: number; bWins: number }>()
  for (const g of games) {
    const key = g.a < g.b ? `${g.a}|${g.b}` : `${g.b}|${g.a}`
    const [a, b] = key.split('|')
    const pair = pairs.get(key) ?? { a, b, aWins: 0, bWins: 0 }
    const winner = g.vote === 'a' ? g.a : g.vote === 'b' ? g.b : null
    if (winner === null) {
      pair.aWins += 0.5
      pair.bWins += 0.5
      ties.set(g.a, (ties.get(g.a) ?? 0) + 1)
      ties.set(g.b, (ties.get(g.b) ?? 0) + 1)
    } else {
      const loser = winner === g.a ? g.b : g.a
      if (winner === a) pair.aWins += 1
      else pair.bWins += 1
      wins.set(winner, (wins.get(winner) ?? 0) + 1)
      losses.set(loser, (losses.get(loser) ?? 0) + 1)
    }
    pairs.set(key, pair)
  }
  const strength = new Map<string, number>(ids.map((id) => [id, 1]))
  for (let it = 0; it < iterations; it += 1) {
    const next = new Map<string, number>()
    for (const id of ids) {
      let w = 0
      let denom = 0
      for (const pair of pairs.values()) {
        if (pair.a !== id && pair.b !== id) continue
        const other = pair.a === id ? pair.b : pair.a
        const n = pair.aWins + pair.bWins
        w += pair.a === id ? pair.aWins : pair.bWins
        denom += n / ((strength.get(id) ?? 1) + (strength.get(other) ?? 1))
      }
      // A small prior keeps an undefeated item finite.
      next.set(id, denom ? (w + 0.01) / (denom + 0.01) : 1)
    }
    const total = [...next.values()].reduce((s, v) => s + v, 0) / ids.length
    for (const [id, v] of next) strength.set(id, v / total)
  }
  return ids
    .map((id) => ({
      id,
      strength: strength.get(id) ?? 1,
      score: Math.log(strength.get(id) ?? 1),
      wins: wins.get(id) ?? 0,
      losses: losses.get(id) ?? 0,
      ties: ties.get(id) ?? 0,
      games: (wins.get(id) ?? 0) + (losses.get(id) ?? 0) + (ties.get(id) ?? 0),
    }))
    .sort((x, y) => y.strength - x.strength)
}

/** Ratings per criterion, with Jev's and human votes kept apart. */
export function leaderboards(
  preferences: Preference[],
): Record<string, { jev: Rating[]; human: Rating[] }> {
  const out: Record<string, { jev: Rating[]; human: Rating[] }> = {}
  const criteria = [...new Set(preferences.map((p) => p.criterion))]
  for (const criterion of criteria) {
    const of = (by: Preference['by']) =>
      bradleyTerry(
        preferences
          .filter((p) => p.criterion === criterion && p.by === by)
          .map((p) => ({ a: p.a, b: p.b, vote: p.vote })),
      )
    out[criterion] = { jev: of('jev'), human: of('human') }
  }
  return out
}

/** Votes keyed by unordered pair and criterion, for `agreement`. */
export function voteKeys(preferences: Preference[], by: Preference['by']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of preferences) {
    if (p.by !== by) continue
    const flipped = p.a > p.b
    const key = flipped ? `${p.b}|${p.a}|${p.criterion}` : `${p.a}|${p.b}|${p.criterion}`
    const vote = flipped ? (p.vote === 'a' ? 'b' : p.vote === 'b' ? 'a' : 'tie') : p.vote
    out[key] = vote
  }
  return out
}
