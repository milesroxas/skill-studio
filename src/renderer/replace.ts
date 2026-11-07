/**
 * The one place a draft from the side panel can land: the SKILL.md editor,
 * while it is open. The editor registers itself when it mounts with a skill
 * file and lets go when it leaves, so the panel's Replace button knows whether
 * there is anything to replace into.
 */
import { useSyncExternalStore } from 'react'

/**
 * Put `next` where `original` is in the file. `replaced` when it was found
 * once and changed; `missing` when the text is no longer there as it was.
 */
export type Replacer = (original: string, next: string) => 'replaced' | 'missing'

let replacer: Replacer | null = null
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function registerReplacer(next: Replacer | null): void {
  replacer = next
  for (const listener of listeners) listener()
}

/** The editor's replacer, or null while no skill file is open in the Editor. */
export function useReplacer(): Replacer | null {
  return useSyncExternalStore(subscribe, () => replacer)
}
