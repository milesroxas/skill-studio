/** A case as the Cases form edits it: the draft that `skill.saveCase` takes. Pure functions. */
import { type ImageRef, imageTypeOf } from './image.ts'
import type { InputEntry } from './inputs.ts'
import type { Case, CaseDraft } from './schemas.ts'
import { slug } from './text.ts'

/** A case's input file by its path inside the case's `files/`; a legacy case's by its name. */
export function inputName(c: Pick<Case, 'dir'>, file: string): string {
  const own = `${c.dir}/files/`
  return c.dir && file.startsWith(own) ? file.slice(own.length) : (file.split('/').at(-1) ?? file)
}

/**
 * Whether one of a case's input files is a picture the request comes with,
 * which the judge sees too: an image right in its `files/`. One in a folder
 * there is an input file like the rest of the folder. Every image a legacy
 * case names is a picture.
 */
export const isPicture = (c: Pick<Case, 'dir'>, file: string): boolean =>
  imageTypeOf(file) !== null &&
  (c.dir ? file.startsWith(`${c.dir}/files/`) && !inputName(c, file).includes('/') : true)

/** A case's own pictures, the ones the form edits. A legacy case's files stay where they are. */
export const picturesOf = (c: Pick<Case, 'files' | 'dir'>): string[] =>
  c.dir ? c.files.filter((f) => isPicture(c, f)) : []

/**
 * A case's input files that are not its pictures, as the form lists them: one
 * entry for each file or folder right in its `files/`, less the ones the draft
 * takes out, with the ones it adds. One added under a name already there
 * takes its place.
 */
export function inputEntries(
  c: Pick<Case, 'files' | 'dir'> | null,
  draft: Pick<CaseDraft, 'added' | 'removed'>,
): InputEntry[] {
  const added = draft.added ?? []
  const gone = new Set([...(draft.removed ?? []), ...added.map((a) => a.name)])
  const saved = new Map<string, InputEntry>()
  for (const file of c?.files ?? []) {
    if (isPicture(c ?? { dir: null }, file)) continue
    const path = inputName(c ?? { dir: null }, file)
    const [name] = path.split('/')
    if (gone.has(name)) continue
    const entry = saved.get(name) ?? { name, files: 0, folder: path !== name, added: false }
    entry.files += 1
    saved.set(name, entry)
  }
  return [
    ...saved.values(),
    ...added.map((a) => ({ name: a.name, files: a.files, folder: a.folder, added: true })),
  ]
}

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
  phone: c.bench.phone === true,
  size: c.bench.size ?? null,
  images: picturesOf(c).map(savedPicture),
  added: [],
  removed: [],
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
  phone: false,
  size: null,
  images: [],
  added: [],
  removed: [],
  graders: [newCheck()],
})

/** Enough of a prompt to name a case after, when it has no title. */
const ID_WORDS = 6
const ID_MAX = 40

const words = (prompt: string): string[] => prompt.trim().split(/\s+/).filter(Boolean)

/** The first words of a prompt, enough to name a case after when it has no title. */
export const promptStart = (prompt: string): string => words(prompt).slice(0, ID_WORDS).join(' ')

/** Whether a case has a title of its own. One without is read with its id in the title's place. */
export const hasTitle = (c: Pick<Case, 'id' | 'title'>): boolean =>
  c.title.trim() !== '' && c.title !== c.id

/**
 * How a case is named wherever it shows: its title, or the start of its
 * prompt when it has none. Never its id, which only names its folder.
 */
export function caseName(c: Pick<Case, 'id' | 'title' | 'prompt'>): string {
  if (hasTitle(c)) return c.title.trim()
  const start = promptStart(c.prompt)
  return words(c.prompt).length > ID_WORDS ? `${start}…` : start || c.id
}

/** Two titles that read as one: the same words, whatever their capitals or the spaces at their ends. */
export const sameTitle = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Whether a case other than `own` has the title. Cases are told apart by
 * title alone, so no two may share one.
 */
export const titleTaken = (
  cases: readonly Pick<Case, 'id' | 'title'>[],
  title: string,
  own: string | null = null,
): boolean =>
  title.trim() !== '' && cases.some((c) => c.id !== own && hasTitle(c) && sameTitle(c.title, title))

/** The title, or with the first number after it that no case's title has: "Tone check 2". */
export function unusedTitle(cases: readonly Pick<Case, 'id' | 'title'>[], title: string): string {
  const base = title.trim()
  let free = base
  for (let n = 2; titleTaken(cases, free); n += 1) free = `${base} ${n}`
  return free
}

/**
 * The id a new case is saved under, which is its folder's name: its title as a
 * slug, or the first words of its prompt when it has none, with a number after
 * it when a case already has that id. A case can then be written as a prompt
 * alone, and still be found by name.
 */
export function newCaseId(
  draft: Pick<CaseDraft, 'title' | 'prompt'>,
  taken: readonly string[],
): string {
  const base = slug(draft.title, ID_MAX) || slug(promptStart(draft.prompt), ID_MAX) || 'case'
  let id = base
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`
  return id
}

/** The most pixels a case's size may give a side. */
export const MAX_SIDE = 10_000

/** Why a case's size cannot be saved, or null when it can, or there is none. */
export const sizeProblem = (size: [number, number] | null | undefined): string | null =>
  size && !size.every((side) => Number.isInteger(side) && side > 0 && side <= MAX_SIDE)
    ? `The width and the height must be whole pixels, from 1 to ${MAX_SIDE.toLocaleString('en-US')}.`
    : null
