import { describe, expect, it } from 'vitest'
import { createEmitter, createStore } from './store.ts'

describe('createStore', () => {
  it('keeps a value and tells its listeners of each change', () => {
    const store = createStore(1)
    const seen: number[] = []
    store.subscribe(() => seen.push(store.get()))
    store.set(2)
    store.set(3)
    expect(store.get()).toBe(3)
    expect(seen).toEqual([2, 3])
  })

  it('tells nobody when the value is the same again', () => {
    const store = createStore('a')
    let told = 0
    store.subscribe(() => {
      told += 1
    })
    store.set('a')
    expect(told).toBe(0)
  })

  it('stops telling a listener that unsubscribed', () => {
    const store = createStore(0)
    let told = 0
    const stop = store.subscribe(() => {
      told += 1
    })
    store.set(1)
    stop()
    store.set(2)
    expect(told).toBe(1)
  })
})

describe('createEmitter', () => {
  it('tells every listener, including one that unsubscribes another while told', () => {
    const emitter = createEmitter()
    const told: string[] = []
    let stopSecond = () => {}
    emitter.subscribe(() => {
      told.push('first')
      stopSecond()
    })
    stopSecond = emitter.subscribe(() => told.push('second'))
    emitter.emit()
    emitter.emit()
    expect(told).toEqual(['first', 'second', 'first'])
  })
})
