import { describe, expect, it } from 'vitest'
import { drawnList, nextPresence, type PresenceState } from './motion.ts'

const same = (key: string) => key
const empty: PresenceState<string> = { signature: '', items: [], fresh: new Set(), leaving: [] }
const at = (items: string[]): PresenceState<string> => ({
  signature: items.join('\n'),
  items,
  fresh: new Set(),
  leaving: [],
})
const drawn = (state: PresenceState<string>, items: string[]) =>
  drawnList(state, items, same).map((p) => `${p.key}${p.arrived ? '+' : ''}${p.leaving ? '-' : ''}`)

describe('nextPresence and drawnList', () => {
  it('rests a list filled from nothing, as one read from the backend is', () => {
    const next = nextPresence(empty, ['a', 'b'], same, false)
    expect(drawn(next, ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('keeps one that went in the place it had while it leaves, and marks one that came', () => {
    const next = nextPresence(at(['a', 'b', 'c']), ['a', 'c', 'd'], same, false)
    expect(drawn(next, ['a', 'c', 'd'])).toEqual(['a', 'b-', 'c', 'd+'])
  })

  it('stops one leaving when it comes back, as on Undo', () => {
    const gone = nextPresence(at(['a', 'b']), ['a'], same, false)
    const back = nextPresence(gone, ['a', 'b'], same, false)
    expect(drawn(back, ['a', 'b'])).toEqual(['a', 'b+'])
  })

  it('keeps nothing behind with movement reduced', () => {
    const next = nextPresence(at(['a', 'b']), ['a'], same, true)
    expect(drawn(next, ['a'])).toEqual(['a'])
  })
})
