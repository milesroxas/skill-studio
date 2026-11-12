/**
 * The one place a draft from the side panel can land: the SKILL.md editor,
 * while it is open. The editor registers itself when it mounts with a skill
 * file and lets go when it leaves, so the panel's Apply button knows whether
 * there is anything to replace into. While a rule is being improved, the
 * editor also says what that rule reads now, as the writer and the panel
 * change it, so the conversation can go on after a draft is put in place.
 */
import { createEmitter, createStore, useStore } from './store.ts'

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

/** The rule being improved, as it reads in the file now, and the editor text it is in. */
export interface Passage {
  /** The editor's name for the file, so a file opened again finds its rule. */
  file: string
  text: string
  /** The rule's number as the editor draws it, such as `04`; null when the text is not one whole rule. */
  number: string | null
}

const passage = createStore<Passage | null>(null)

/** Follow a rule: the editor sets it as the conversation opens and as the rule's text changes. */
export const setPassage = (next: Passage | null): void => passage.set(next)

export const passageNow = (): Passage | null => passage.get()

/** Be told when the rule being improved changes or stops being followed; returns the unsubscribe. */
export const watchPassage = (listener: () => void): (() => void) => passage.subscribe(listener)

/** The rule being improved as it reads now; null when no rule is being improved. */
export const usePassage = (): Passage | null => useStore(passage)

const shown = createEmitter()

/** Bring the rule being improved into view in the editor, and flash it. */
export const showPassage = (): void => shown.emit()

/** The editor is told when the panel asks to see the rule; returns the unsubscribe. */
export const watchShow = (listener: () => void): (() => void) => shown.subscribe(listener)
