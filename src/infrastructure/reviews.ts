/**
 * What the reader said lives in `<skill>/evals/reviews.json`: for each output
 * key (`<run>/<sample>`) their own answers where Jev's verdict was wrong, and
 * their picks between two outputs. A file written by an earlier version may
 * hold more beside these; whatever it holds is kept when the file is written.
 */
import { join } from 'node:path'
import { OVERALL, type Preference, type Review, type Reviews } from '@domain/schemas.ts'
import { readJson, writeJson } from './fs.ts'

export const reviewsPath = (skillDir: string): string => join(skillDir, 'evals/reviews.json')

/** One stored entry about an output: the app's own fields, and any others left as they are. */
export type StoredReview = Partial<Review> & Record<string, unknown>
/** One stored vote between two outputs, whoever cast it. */
export type StoredVote = Omit<Preference, 'by'> & { by: string }

/** The file as it is on disk. Deleting a version moves entries out of it and back whole. */
export interface StoredReviews {
  reviews?: Record<string, StoredReview>
  preferences?: StoredVote[]
  [key: string]: unknown
}

export const readStoredReviews = (skillDir: string): StoredReviews =>
  readJson<StoredReviews>(reviewsPath(skillDir), {})

export const writeStoredReviews = (skillDir: string, stored: StoredReviews): void =>
  writeJson(reviewsPath(skillDir), stored)

const readStored = readStoredReviews

const correctionsOf = (value: unknown): Record<string, boolean> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, boolean] => {
          return typeof entry[1] === 'boolean'
        }),
      )
    : {}

/** The reader's corrections and picks. A vote that is not the reader's own is not a pick. */
export function loadReviews(skillDir: string): Reviews {
  const stored = readStored(skillDir)
  return {
    reviews: Object.fromEntries(
      Object.entries(stored.reviews ?? {}).map(([key, review]) => [
        key,
        {
          corrections: correctionsOf(review.corrections),
          updatedAt: typeof review.updatedAt === 'string' ? review.updatedAt : '',
        },
      ]),
    ),
    preferences: (stored.preferences ?? []).filter(
      (p): p is Preference => p.by === 'human' && p.criterion === OVERALL,
    ),
  }
}

/**
 * The reader's own answer on one verdict of one output: `met` true or false,
 * or null to take the answer back and let Jev's stand again.
 */
export function saveCorrection(
  skillDir: string,
  key: string,
  verdict: string,
  met: boolean | null,
): void {
  const stored = readStored(skillDir)
  const reviews = stored.reviews ?? {}
  const review = reviews[key] ?? {}
  const corrections = correctionsOf(review.corrections)
  if (met === null) delete corrections[verdict]
  else corrections[verdict] = met
  reviews[key] = { ...review, corrections, updatedAt: new Date().toISOString() }
  writeStoredReviews(skillDir, { ...stored, reviews })
}

/** One pick per unordered pair; a new pick replaces the old. */
export function savePick(skillDir: string, pick: Pick<Preference, 'a' | 'b' | 'vote'>): void {
  const stored = readStored(skillDir)
  const same = (p: { a: string; b: string; by: string; criterion: string }) =>
    p.by === 'human' &&
    p.criterion === OVERALL &&
    ((p.a === pick.a && p.b === pick.b) || (p.a === pick.b && p.b === pick.a))
  const preferences = (stored.preferences ?? []).filter((p) => !same(p))
  preferences.push({ ...pick, criterion: OVERALL, by: 'human', at: new Date().toISOString() })
  writeStoredReviews(skillDir, { ...stored, preferences })
}
