/**
 * The width a page is shown at on Results' stage, kept for the next case and
 * the next launch: a reader checking phones checks every case at a phone's width.
 * Until one is picked a page takes the stage's own width: not every page is a
 * website, and a device's width is a guess about one that is.
 */
import { pixelText } from '@domain/scoring.ts'
import { useState } from 'react'
import { createStore, useStore } from './store.ts'

const STAGE_WIDTHS = [
  /** The stage's own width, so the page lays itself out to the room it has. */
  { value: 'fit', label: 'Full width', detail: 'Fills the space', px: null },
  { value: 'phone', label: 'Phone', detail: '390 px', px: 390 },
  { value: 'tablet', label: 'Tablet', detail: '820 px', px: 820 },
  { value: 'desktop', label: 'Desktop', detail: '1280 px', px: 1280 },
] as const

type StageWidth = (typeof STAGE_WIDTHS)[number]['value']

const KEY = 'skill-studio.stage-width'

function stored(): StageWidth {
  try {
    const value = localStorage.getItem(KEY)
    return STAGE_WIDTHS.find((w) => w.value === value)?.value ?? 'fit'
  } catch {
    return 'fit'
  }
}

const width = createStore<StageWidth>(stored())

function setStageWidth(next: StageWidth): void {
  width.set(next)
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // Kept for this session only.
  }
}

const useStageWidth = (): StageWidth => useStore(width)

/** The width in CSS pixels a choice draws the page at; null for the stage's own. */
const stagePixels = (choice: StageWidth): number | null =>
  STAGE_WIDTHS.find((w) => w.value === choice)?.px ?? null

/** The size a page is drawn at wherever a case shows one, and what changes it. */
export interface PageSize {
  /** The choice in force: the case's own size, or one of `STAGE_WIDTHS`. */
  choice: string
  /** The width in CSS pixels; null for the room the page is given. */
  width: number | null
  /** The height that goes with the width, so the page shows whole; null to fill the room's height. */
  height: number | null
  /** A short name the control shows, and the pixels as a line under it in the list. */
  options: Array<{ value: string; label: string; detail: string }>
  pick: (choice: string) => void
}

/**
 * One size for every page of a case, on the stage and in the cards: a size
 * picked in one place holds in the other. A case with a size (`bench.size`)
 * opens at it; any other at the last width picked.
 */
export function usePageSize(caseSize: [number, number] | null): PageSize {
  const kept = useStageWidth()
  /** A size picked on this case; until then the case's own, else the last width picked. */
  const [picked, setPicked] = useState<StageWidth | 'case' | null>(null)
  const choice = picked ?? (caseSize ? 'case' : kept)
  return {
    choice,
    width: choice === 'case' ? (caseSize?.[0] ?? null) : stagePixels(choice),
    height: choice === 'case' ? (caseSize?.[1] ?? null) : null,
    options: [
      ...(caseSize ? [{ value: 'case', label: 'Case size', detail: pixelText(caseSize) }] : []),
      ...STAGE_WIDTHS.map(({ value, label, detail }) => ({ value, label, detail })),
    ],
    pick: (next) => {
      const width = STAGE_WIDTHS.find((w) => w.value === next)?.value
      setPicked(width ?? 'case')
      if (width) setStageWidth(width)
    },
  }
}
