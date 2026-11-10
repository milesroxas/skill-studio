import { describe, expect, it } from 'vitest'
import { Jev } from './jev.ts'

describe('Jev.pool', () => {
  it('runs every item and keeps their order', async () => {
    const jev = new Jev()
    const out = await jev.pool([3, 1, 2], async (n) => {
      await new Promise((done) => setTimeout(done, n))
      return n * 10
    })
    expect(out).toEqual([30, 10, 20])
  })

  it('has at most six in flight', async () => {
    let inFlight = 0
    let most = 0
    await new Jev().pool(Array.from({ length: 20 }), async () => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await new Promise((done) => setTimeout(done, 1))
      inFlight -= 1
    })
    expect(most).toBe(6)
  })

  it('starts no further item once one has failed', async () => {
    const started: number[] = []
    const work = async (n: number) => {
      started.push(n)
      await new Promise((done) => setTimeout(done, 1))
      if (n === 0) throw new Error('Jev is down')
    }
    const items = Array.from({ length: 40 }, (_, i) => i)
    await expect(new Jev().pool(items, work)).rejects.toThrow('Jev is down')
    // Let the calls already in flight settle: none of them may take another.
    await new Promise((done) => setTimeout(done, 20))
    // The six in flight when it failed, and no more of the forty.
    expect(started).toEqual([0, 1, 2, 3, 4, 5])
  })
})
