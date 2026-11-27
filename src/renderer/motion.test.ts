import { describe, expect, it } from 'vitest'
import { drawnList, nextHeard, nextPresence, type PresenceState } from './motion.ts'

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

describe('nextHeard', () => {
  type Roles = Array<'user' | 'assistant'>
  /** One render of a conversation: its messages, whether the reply on its way is drawn, and whether it shows text. */
  type Render = [roles: Roles, drawn: boolean, writing: boolean]
  /** The place of the reply a screen reader hears arrive whole, after each render, each read twice. */
  const whole = (renders: Render[]): Array<number | null> => {
    let heard: Parameters<typeof nextHeard>[0] = { wait: null, streamed: null, whole: null }
    return renders.map(([roles, drawn, writing]) => {
      const once = nextHeard(heard, roles, { drawn, writing })
      // A render read twice, as React may, comes to the same answer.
      heard = nextHeard(once, roles, { drawn, writing })
      expect(heard).toEqual(once)
      return heard.whole
    })
  }
  const opened: Roles = ['user', 'assistant']
  const asked: Roles = [...opened, 'user']

  it('hears a question the app puts itself once, as it takes the place of the wait', () => {
    expect(
      whole([
        [opened, false, false],
        // The answer is sent, and the wait for what comes next is drawn after it.
        [asked, true, false],
        // The question lands while the sent answer is still shown as on its way.
        [[...asked, 'assistant', 'user'], true, false],
        [[...asked, 'assistant'], false, false],
        // It stays live while it is the newest reply: the next answer is sent, and a reply is written.
        [[...asked, 'assistant', 'user'], true, false],
        [[...asked, 'assistant', 'user'], true, true],
        // A newer reply takes over, and it was heard as it was written.
        [[...asked, 'assistant', 'user', 'assistant'], false, false],
      ]),
    ).toEqual([null, null, 3, 3, 3, 3, null])
  })

  it('does not hear a reply again once it was heard as it was written', () => {
    // Joined in the render that drops the wait.
    expect(
      whole([
        [asked, true, false],
        [asked, true, true],
        [[...asked, 'assistant'], false, false],
      ]),
    ).toEqual([null, null, null])
    // Joined after a render without it, as the Assistant's reply does.
    expect(
      whole([
        [asked, true, true],
        [asked, false, false],
        [[...asked, 'assistant'], false, false],
      ]),
    ).toEqual([null, null, null])
  })

  it('hears nothing as a conversation opens, nor a reply that joins once the wait is gone', () => {
    expect(whole([[opened, false, false]])).toEqual([null])
    expect(
      whole([
        [asked, true, false],
        [asked, false, false],
        [[...asked, 'assistant'], false, false],
      ]),
    ).toEqual([null, null, null])
  })
})
