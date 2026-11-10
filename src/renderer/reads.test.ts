import { describe, expect, it } from 'vitest'
import { createReads } from './reads.ts'

/** A promise and the hands that settle it. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((done) => setTimeout(done, 0))

describe('createReads', () => {
  it('takes a reply that lands before a newer one, and drops one that lands after', async () => {
    const reads = createReads()
    const took: string[] = []
    const first = deferred<string>()
    const second = deferred<string>()
    const third = deferred<string>()
    void reads.read(
      () => first.promise,
      (v) => took.push(v),
      () => {},
    )
    void reads.read(
      () => second.promise,
      (v) => took.push(v),
      () => {},
    )
    void reads.read(
      () => third.promise,
      (v) => took.push(v),
      () => {},
    )
    first.resolve('one')
    await tick()
    third.resolve('three')
    await tick()
    second.resolve('two')
    await tick()
    expect(took).toEqual(['one', 'three'])
  })

  it('has an overtaken read wait for the newest before it resolves', async () => {
    const reads = createReads()
    const took: string[] = []
    const first = deferred<string>()
    const second = deferred<string>()
    let done = false
    void reads
      .read(
        () => first.promise,
        (v) => took.push(v),
        () => {},
      )
      .then(() => {
        done = true
      })
    void reads.read(
      () => second.promise,
      (v) => took.push(v),
      () => {},
    )
    first.resolve('one')
    await tick()
    expect(done).toBe(false)
    second.resolve('two')
    await tick()
    expect(done).toBe(true)
    expect(took).toEqual(['one', 'two'])
  })

  it('says a failure only of the newest read asked for', async () => {
    const reads = createReads()
    const failed: string[] = []
    const first = deferred<string>()
    const second = deferred<string>()
    const settled = reads.read(
      () => first.promise,
      () => {},
      (e) => failed.push(e.message),
    )
    void reads.read(
      () => second.promise,
      () => {},
      (e) => failed.push(e.message),
    )
    first.reject(new Error('old'))
    second.reject(new Error('new'))
    await settled
    expect(failed).toEqual(['new'])
  })
})
