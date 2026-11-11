/**
 * What deleting one run does to the version it was made with. A version stays
 * listed while some copy of it is kept: its saved copy, or another run of it.
 * When the run is the last, the delete saves the version from the run's own
 * snapshot first; only a run that kept no snapshot takes its version with it.
 * The backend acts on this and the dialog says it, so both read it here.
 */
export type VersionAfterRunDelete = 'none' | 'stays' | 'saved' | 'goes'

export function versionAfterRunDelete({
  version,
  saved,
  otherRuns,
  snapshot,
}: {
  /** The version the run was made with; empty for a run that recorded none. */
  version: string
  /** The version has a saved copy of its own. */
  saved: boolean
  /** Runs of the same version besides this one. */
  otherRuns: number
  /** The run kept its snapshot of the skill (`_skill/`). */
  snapshot: boolean
}): VersionAfterRunDelete {
  if (!version) return 'none'
  if (saved || otherRuns > 0) return 'stays'
  return snapshot ? 'saved' : 'goes'
}
