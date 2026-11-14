/**
 * How taxing a case is to run, read off the case as it is written: a level
 * from 1 to 5, as a file's size is (`size.ts`), and the parts it is made of.
 *
 * It weighs only what writing the answer costs, in points where a bare prompt
 * is 2. The points are set against the cost of 27 recorded attempts
 * (November 2026, Sonnet): a prompt alone cost about $0.05, a case with a
 * picture, a folder of 9 files and a page for an answer about $0.20, and the
 * same with 27 files about $0.23. A prompt of 16 words cost what one of 77 did.
 *
 * Grading has no part in it. Jev read 2,000 to 57,000 tokens an output at
 * $0.042 a million, a hundredth of what the writing cost, so a check, a good
 * answer or the phone width adds no weight.
 *
 * The model is left out too, though it counts for more than any of these:
 * it is picked when the run starts, not written into the case.
 */
import { type SizeBand, sizeBand } from './size.ts'
import { words } from './text.ts'

/** What of a case is counted. */
export interface CaseLoad {
  prompt: string
  pictures: number
  /** Files that are not pictures, those inside a folder with them. */
  files: number
  /** The answer is a page or a picture, not text. */
  drawn: boolean
}

export type WeightPart = 'base' | 'prompt' | 'pictures' | 'files' | 'drawn'

export interface CaseWeight {
  points: number
  /** 1 to 5. */
  level: number
  /** Up to 3 is fine, 4 is heavy and 5 very heavy, as a file's size stands. */
  band: SizeBand
  /** What adds to it, heaviest first. `base` is every case's: reading the skill and writing an answer. */
  parts: Array<{ part: WeightPart; points: number }>
}

const BASE = 2
/** A long request is read, not written: it adds little. */
const PROMPT_WORDS = 300
const PROMPT_MOST = 1
const PICTURE = 1.5
/** The first file costs most; past thirty a folder is not read whole. */
const FILE_FIRST = 1
const FILE_EACH = 0.1
const FILES_MOST = 4
/** A page or a picture takes several times the writing a note does. */
const DRAWN = 3

/** The most points at levels 1 to 4. Anything past the last is level 5. */
const STEPS = [3, 4.5, 6.5, 9] as const

export function caseWeight(load: CaseLoad): CaseWeight {
  const parts: CaseWeight['parts'] = [{ part: 'base', points: BASE }]
  const asked = words(load.prompt).length
  if (asked) parts.push({ part: 'prompt', points: Math.min(PROMPT_MOST, asked / PROMPT_WORDS) })
  if (load.pictures) parts.push({ part: 'pictures', points: load.pictures * PICTURE })
  if (load.files)
    parts.push({
      part: 'files',
      points: Math.min(FILES_MOST, FILE_FIRST + load.files * FILE_EACH),
    })
  if (load.drawn) parts.push({ part: 'drawn', points: DRAWN })
  const points = parts.reduce((sum, p) => sum + p.points, 0)
  const step = STEPS.findIndex((most) => points <= most)
  const level = step === -1 ? STEPS.length + 1 : step + 1
  return {
    points,
    level,
    band: sizeBand(level),
    parts: parts.sort((a, b) => b.points - a.points),
  }
}
