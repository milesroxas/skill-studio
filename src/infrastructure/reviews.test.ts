import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadReviews, reviewsPath, saveCorrection } from './reviews.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'st-reviews-'))
  mkdirSync(join(dir, 'evals'), { recursive: true })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const onDisk = () => JSON.parse(readFileSync(reviewsPath(dir), 'utf8'))

describe('corrections', () => {
  it('keeps the reader’s answer on a verdict, and takes it back', () => {
    saveCorrection(dir, 'run/intro-s1', 'rule:Be brief.', true)
    saveCorrection(dir, 'run/intro-s1', 'check:Names Priya.', false)
    expect(loadReviews(dir).reviews['run/intro-s1'].corrections).toEqual({
      'rule:Be brief.': true,
      'check:Names Priya.': false,
    })
    saveCorrection(dir, 'run/intro-s1', 'rule:Be brief.', null)
    expect(loadReviews(dir).reviews['run/intro-s1'].corrections).toEqual({
      'check:Names Priya.': false,
    })
  })

  it('reads an output nobody corrected as having no corrections', () => {
    expect(loadReviews(dir)).toEqual({ reviews: {} })
  })
})

describe('a file written by an earlier version', () => {
  const earlier = {
    reviews: {
      'run/intro-s1': {
        rating: 4,
        layers: { adherence: 'good' },
        note: 'Kind.',
        updatedAt: 'then',
      },
    },
    preferences: [
      { a: 'x', b: 'y', criterion: 'overall', vote: 'b', by: 'jev', confidence: 0.9, at: 'then' },
      { a: 'x', b: 'y', criterion: 'tone', vote: 'a', by: 'human', at: 'then' },
      { a: 'x', b: 'y', criterion: 'overall', vote: 'a', by: 'human', at: 'then' },
    ],
  }

  beforeEach(() => writeFileSync(reviewsPath(dir), JSON.stringify(earlier)))

  it('is read for corrections only: its votes and other fields are not', () => {
    expect(loadReviews(dir)).toEqual({
      reviews: { 'run/intro-s1': { corrections: {}, updatedAt: 'then' } },
    })
  })

  it('keeps everything it held when a correction is written', () => {
    saveCorrection(dir, 'run/intro-s1', 'rule:Be brief.', true)
    const stored = onDisk()
    expect(stored.reviews['run/intro-s1']).toMatchObject({
      rating: 4,
      layers: { adherence: 'good' },
      note: 'Kind.',
      corrections: { 'rule:Be brief.': true },
    })
    expect(stored.preferences).toEqual(earlier.preferences)
  })
})
