/**
 * The one place a draft from the side panel can land: the SKILL.md editor,
 * while it is open. The editor registers itself when it mounts with a skill
 * file and lets go when it leaves, so the panel's Replace button knows whether
 * there is anything to replace into.
 */
import { createStore, useStore } from './store.ts'

/**
 * Put `next` where `original` is in the file. `replaced` when it was found
 * once and changed; `missing` when the text is no longer there as it was.
 */
export type Replacer = (original: string, next: string) => 'replaced' | 'missing'

const replacer = createStore<Replacer | null>(null)

export function registerReplacer(next: Replacer | null): void {
  replacer.set(next)
}

/** The editor's replacer, or null while no skill file is open in the Editor. */
export function useReplacer(): Replacer | null {
  return useStore(replacer)
}
