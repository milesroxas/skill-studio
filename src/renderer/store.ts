/**
 * The page's small stores: a value kept outside React, and the components
 * that read it told when it changes. `createEmitter` is the telling alone,
 * for a module that keeps several values and says once that any changed.
 */
import { useSyncExternalStore } from 'react'

export interface Emitter {
  /** Tell every listener. */
  emit: () => void
  /** Be told of every change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
}

export function createEmitter(): Emitter {
  const listeners = new Set<() => void>()
  return {
    emit: () => {
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export interface Store<T> extends Emitter {
  get: () => T
  /** Keep `next` and tell the listeners; the same value again tells nobody. */
  set: (next: T) => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const emitter = createEmitter()
  return {
    ...emitter,
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      emitter.emit()
    },
  }
}

/** A store's value, kept in step with it. */
export const useStore = <T>(store: Store<T>): T => useSyncExternalStore(store.subscribe, store.get)
