/** A case as the Cases form edits it: the draft that `skill.saveCase` takes. Pure functions. */
import { type ImageRef, imageTypeOf } from './image.ts'
import type { Case, CaseDraft } from './schemas.ts'

/** A case's own pictures: the images in its `files/`. A legacy case's files stay where they are. */
export const picturesOf = (c: Case): string[] =>
  c.dir ? c.files.filter((f) => f.startsWith(`${c.dir}/files/`) && imageTypeOf(f)) : []

const savedPicture = (file: string): ImageRef => ({
  name: file.split('/').at(-1) ?? file,
  file,
  upload: null,
})

/** A saved case as the form edits it. */
export const draftOf = (c: Case): CaseDraft => ({
  id: c.id,
  title: c.title === c.id ? '' : c.title,
  prompt: c.prompt,
  expectedOutcome: c.expectedOutcome,
  words: c.bench.words ?? null,
  images: picturesOf(c).map(savedPicture),
  graders: c.graders.map((g) => ({
    id: g.id,
    statement: g.statement,
    weight: g.weight,
    image: g.image ? savedPicture(g.image) : null,
  })),
})

/**
 * The weights a check can have. 1 is usual. The form sets 1 or 2, the ×2
 * mark; a grader file written by hand, or the Assistant, may say up to 5.
 */
const CHECK_WEIGHT = { min: 1, max: 5 }

/** The weight the ×2 mark sets. */
export const DOUBLE = 2

/** How a check that counts more is marked wherever it is listed: "×2". */
export const weightMark = (weight: number): string => `×${weight}`

/** `value` as a check's weight: whole, within the range, or null when it is not a number. */
export const checkWeight = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(CHECK_WEIGHT.max, Math.max(CHECK_WEIGHT.min, Math.round(value)))
    : null

export const newCheck = (): CaseDraft['graders'][number] => ({
  id: null,
  statement: '',
  weight: 1,
  image: null,
})

export const blankDraft = (): CaseDraft => ({
  id: '',
  title: '',
  prompt: '',
  expectedOutcome: '',
  words: null,
  images: [],
  graders: [newCheck()],
})
