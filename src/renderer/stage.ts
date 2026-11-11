/**
 * The width a page is shown at on Results' stage, kept for the next case and
 * the next launch: a reader checking phones checks every case at a phone's width.
 */
import { createStore, useStore } from './store.ts'

export const STAGE_WIDTHS = [
  { value: 'phone', label: 'Phone', px: 390 },
  { value: 'tablet', label: 'Tablet', px: 820 },
  { value: 'desktop', label: 'Desktop', px: 1280 },
  /** The stage's own width, so the page lays itself out to the room it has. */
  { value: 'fit', label: 'Fit', px: null },
] as const

export type StageWidth = (typeof STAGE_WIDTHS)[number]['value']

const KEY = 'skill-studio.stage-width'

function stored(): StageWidth {
  try {
    const value = localStorage.getItem(KEY)
    return STAGE_WIDTHS.find((w) => w.value === value)?.value ?? 'desktop'
  } catch {
    return 'desktop'
  }
}

const width = createStore<StageWidth>(stored())

export function setStageWidth(next: StageWidth): void {
  width.set(next)
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Kept for this session only.
  }
}

export const useStageWidth = (): StageWidth => useStore(width)

/** The width in CSS pixels a choice draws the page at; null for the stage's own. */
export const stagePixels = (choice: StageWidth): number | null =>
  STAGE_WIDTHS.find((w) => w.value === choice)?.px ?? null
