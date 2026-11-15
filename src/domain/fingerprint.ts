/**
 * Fingerprints that grew a part. A case's fingerprints (`RunCase.ask`,
 * `RunCase.yardstick`) are made of the part every app writes and, after a
 * colon, the part added since: the case's run settings. One written before
 * that part was added holds the first part alone, and is compared with the
 * first part only, so updating the app reads nothing as changed that was not.
 */

/** The fingerprint of `parts`, the first one first, as one string. */
export const fingerprint = (...parts: string[]): string => parts.join(':')

/**
 * Whether `kept`, a fingerprint a run or a grading wrote, says the same as
 * `now`: the whole of it, or its first part for one that holds that alone.
 */
export function sameFingerprint(kept: string, now: string): boolean {
  if (kept.includes(':')) return kept === now
  return kept === now.split(':')[0]
}
