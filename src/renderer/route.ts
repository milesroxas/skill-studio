/**
 * A place in the app, as the URL hash writes it: `#/<screen>?a=...&b=...`.
 * Each entry of the window's history also carries its position and the skill
 * that was open, so Back and Forward know how far they reach and return to a
 * place in the skill it was seen in.
 */

import { currentScreen } from '@domain/preferences.ts'

export interface Place {
  screen: string
  params: URLSearchParams
}

/** What an entry of the window's history remembers, kept in its state. */
export interface Entry {
  /** The entry's position, counted from the first place this window showed. */
  index: number
  /** The skill open when the entry was made; empty when none was. */
  skill: string
}

export interface Route extends Place, Entry {
  /** The newest position: the furthest Forward reaches. Back is possible above 0. */
  last: number
  /** How the window came here: by a step to somewhere new, or by going Back or Forward. */
  arrival: 'step' | 'return'
}

export const placeOf = (hash: string): Place => {
  const [screen, query = ''] = hash.replace(/^#\/?/, '').split('?')
  return { screen: currentScreen(screen) || 'home', params: new URLSearchParams(query) }
}

export const hashOf = (screen: string, params: Record<string, string> = {}): string => {
  const query = new URLSearchParams(params).toString()
  return `#/${screen}${query ? `?${query}` : ''}`
}

/** The entry a history state holds; null for a state the app did not write. */
export const entryOf = (state: unknown): Entry | null => {
  if (typeof state !== 'object' || state === null) return null
  const { index, skill } = state as Partial<Entry>
  return typeof index === 'number' && typeof skill === 'string' ? { index, skill } : null
}
