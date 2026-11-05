/**
 * The person's preferences in the page: read once before the first render,
 * applied to the document as `data-theme` and `data-motion`, and stored by the
 * host on every change. `system` choices follow the OS live.
 */
import {
  DEFAULT_PREFERENCES,
  type Motion,
  type Preferences,
  type Theme,
} from '@domain/preferences.ts'
import { useSyncExternalStore } from 'react'
import { api } from './api.ts'

let current: Preferences = DEFAULT_PREFERENCES
const listeners = new Set<() => void>()

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

const resolveTheme = (theme: Theme): 'light' | 'dark' =>
  theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : theme
const resolveMotion = (motion: Motion): 'full' | 'reduced' =>
  motion === 'reduced' || reducedQuery.matches ? 'reduced' : 'full'

/**
 * Set the document's theme and motion. A theme change would run every
 * component's own color transition at once, so transitions are held off for
 * the frame it lands in.
 */
function apply({ theme, motion }: Preferences): void {
  const root = document.documentElement
  const nextTheme = resolveTheme(theme)
  if (root.dataset.theme && root.dataset.theme !== nextTheme) {
    root.dataset.switching = ''
    requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.switching))
  }
  root.dataset.theme = nextTheme
  root.dataset.motion = resolveMotion(motion)
}

darkQuery.addEventListener('change', () => apply(current))
reducedQuery.addEventListener('change', () => apply(current))

/** Read the stored preferences and apply them. Call before the first render. */
export async function loadPreferences(): Promise<void> {
  try {
    current = await api.preferences()
  } catch {
    // A host that cannot answer leaves the defaults in place.
  }
  apply(current)
}

/** Change some preferences: applied at once, then stored. */
export function setPreferences(patch: Partial<Preferences>): Promise<void> {
  current = { ...current, ...patch }
  apply(current)
  for (const listener of listeners) listener()
  return api.savePreferences(current).then(() => undefined)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, () => current)
}
