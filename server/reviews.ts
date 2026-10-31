/**
 * Human judgments live in `<skill>/evals/reviews.json`: one review per output
 * key (`<run>/<sample>`) and the pairwise preferences, Jev's and the human's.
 * Anchors are outputs promoted to `evals/anchors/` with a label.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Preference, Review, Reviews } from '@core/schemas.ts'
import { readFrontMatter, slug } from '@core/text.ts'
import { assertSafe, assertSafePath, readJson, today, writeJson } from './fs.ts'
import { anchorsDir, sampleFile } from './runs.ts'

export const reviewsPath = (skillDir: string): string => join(skillDir, 'evals/reviews.json')

const EMPTY: Reviews = { reviews: {}, preferences: [] }

export const loadReviews = (skillDir: string): Reviews =>
  readJson<Reviews>(reviewsPath(skillDir), structuredClone(EMPTY))

export function saveReview(skillDir: string, key: string, review: Omit<Review, 'updatedAt'>): void {
  const stored = loadReviews(skillDir)
  stored.reviews[key] = { ...review, updatedAt: new Date().toISOString() }
  writeJson(reviewsPath(skillDir), stored)
}

/** One vote per unordered pair, criterion and voter; a new vote replaces the old. */
export function savePreference(skillDir: string, preference: Omit<Preference, 'at'>): void {
  const stored = loadReviews(skillDir)
  const same = (p: Preference) =>
    p.by === preference.by &&
    p.criterion === preference.criterion &&
    ((p.a === preference.a && p.b === preference.b) ||
      (p.a === preference.b && p.b === preference.a))
  stored.preferences = stored.preferences.filter((p) => !same(p))
  stored.preferences.push({ ...preference, at: new Date().toISOString() })
  writeJson(reviewsPath(skillDir), stored)
}

export interface PromoteOptions {
  run: string
  sample: string
  /** Sample-relative artifact path; the markdown file to copy. */
  file: string
  case: string
  label: 'good' | 'bad'
  tests: string[]
  about: string
}

/** Copy an output into `evals/anchors/` with the front matter the grader reads. */
export function promoteAnchor(skillDir: string, options: PromoteOptions): string {
  assertSafe(options.run, 'run')
  assertSafe(options.sample, 'sample')
  assertSafePath(options.file, 'file')
  const source = sampleFile(skillDir, options.run, options.sample, options.file)
  const body = readFrontMatter(readFileSync(source, 'utf8')).text
  const name = `${slug(`${options.run}-${options.sample.replace(/\.md$/, '')}`)}-${options.label}.md`
  const head = [
    '---',
    `case: ${options.case}`,
    `label: ${options.label}`,
    ...(options.label === 'bad' && options.tests.length
      ? [`tests: ${options.tests.join(', ')}`]
      : []),
    `about: Promoted from evals/runs/${options.run}/${options.sample} on ${today()}.${
      options.about ? ` ${options.about.replace(/\n/g, ' ')}` : ''
    }`,
    '---',
    '',
  ].join('\n')
  mkdirSync(anchorsDir(skillDir), { recursive: true })
  const path = join(anchorsDir(skillDir), name)
  writeFileSync(path, `${head}${body}\n`)
  return path
}
