/**
 * Scoring edited on Results is unsaved work like a file's or a case's: it is
 * kept with the skill's drafts as it changes, so a reload, a quit or a switch
 * to another skill loses nothing, and it is given back when the skill opens.
 * Saving it, or setting it back to what is saved, clears the draft.
 */
import type { BenchConfig } from '@domain/schemas.ts'
import { useEffect, useRef } from 'react'
import type { State } from './api.ts'
import type { Drafts } from './drafts.ts'
import { mergedConfig, scoringDirty } from './model.ts'

/** The scoring to give back from a stored draft; null when there is none, or it says what is saved. */
export const restoredScoring = (
  draft: BenchConfig | null,
  saved: Partial<BenchConfig> | null,
): BenchConfig | null => {
  if (!draft) return null
  const config = mergedConfig(draft)
  return scoringDirty(config, saved) ? config : null
}

/** The draft to keep for the scoring in hand: none once it says what is saved. */
export const scoringToKeep = (
  config: BenchConfig,
  saved: Partial<BenchConfig> | null,
): BenchConfig | null => (scoringDirty(config, saved) ? config : null)

const same = (a: BenchConfig | null, b: BenchConfig | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

export function useScoringDraft({
  skillPath,
  state,
  config,
  setConfig,
  drafts,
}: {
  skillPath: string
  state: State | null
  config: BenchConfig | null
  setConfig: (config: BenchConfig) => void
  drafts: Pick<Drafts, 'scoring' | 'setScoring' | 'status'>
}): void {
  /** The skill whose stored draft was given back: until then nothing is stored over it. */
  const restored = useRef<string | null>(null)
  // The skill's state, its scoring and its drafts are all read, and all of the open skill.
  const ready =
    state !== null &&
    state.skill.path === skillPath &&
    config !== null &&
    drafts.status !== 'loading'
  const saved = state?.savedConfig ?? null
  const { scoring, setScoring } = drafts

  useEffect(() => {
    if (!ready || !config) return
    if (restored.current !== skillPath) {
      restored.current = skillPath
      // An edit made here before the drafts were read is newer than the stored one: it stays.
      const back = scoringDirty(config, saved) ? null : restoredScoring(scoring, saved)
      // The next pass keeps it, as any edit is kept.
      if (back) return setConfig(back)
    }
    const keep = scoringToKeep(config, saved)
    if (!same(keep, scoring)) setScoring(keep)
  }, [ready, skillPath, config, saved, scoring, setScoring, setConfig])
}
