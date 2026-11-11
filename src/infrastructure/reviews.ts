/**
 * What the reader said lives in `<skill>/evals/reviews.json`: for each output
 * key (`<run>/<sample>`) their own answers where Jev's verdict was wrong. A
 * file written by an earlier version may hold more beside these, such as the
 * votes between two outputs in `preferences`. Nothing reads them, and whatever
 * the file holds is kept when it is written.
 */
import { join } from 'node:path'
import type { Review, Reviews } from '@domain/schemas.ts'
import { readJson, writeJson } from './fs.ts'

export const reviewsPath = (skillDir: string): string => join(skillDir, 'evals/reviews.json')

/** One stored entry about an output: the app's own fields, and any others left as they are. */
export type StoredReview = Partial<Review> & Record<string, unknown>
/**
 * One vote between two outputs, as an earlier version wrote it. Only the two
 * output keys are read, so a deleted version takes the votes on its runs along.
 */
export type StoredVote = { a: string; b: string } & Record<string, unknown>

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

/** The reader's corrections. */
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
