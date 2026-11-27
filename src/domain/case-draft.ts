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
  artifact: c.bench.artifact ?? null,
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
  artifact: null,
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

/**
 * An ANSI escape sequence: a CSI run (`ESC [ ... final`, or its one-byte form
 * U+009B), an OSC run up to its end (`ESC ] ... BEL` or `ESC \`), or ESC and
 * one more character. A terminal acts on it, moving the cursor or erasing a
 * line, rather than showing it.
 */
const ESCAPES =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it finds.
  /\u001b\[[0-?]*[ -/]*[@-~]|\u009b[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[ -/]*[0-~]/g

/**
 * A character that is acted on rather than shown: a C0 or C1 control, but
 * for those that are white space (tab, the line breaks, U+0085), and the
 * Unicode direction overrides and isolates (U+202A to U+202E, U+2066 to
 * U+2069), which turn the text after them around.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it finds.
const UNSHOWN = /[\u0000-\u0008\u000e-\u001f\u007f-\u0084\u0086-\u009f\u202a-\u202e\u2066-\u2069]/g

/**
 * Text as it is safe to print to a terminal or write into a page: what
 * either would act on rather than show (`ESCAPES`, `UNSHOWN`) taken out, so a
 * name cannot erase the line above it or turn the words after it around.
 * White space, line breaks among it, is kept.
 */
export const printable = (text: string): string => text.replace(ESCAPES, '').replace(UNSHOWN, '')

/**
 * A title as it is saved and shown: nothing a terminal or a page would act
 * on rather than show (`printable`), and one line, every run of white space,
 * a line break or a tab among them, one space, and none at either end. A
 * title is one line wherever it shows, and the Cases form's field cannot make
 * two.
 */
export const oneLineTitle = (title: string): string =>
  printable(title)
    .replace(/\p{White_Space}+/gu, ' ')
    .trim()

/** Whether a title holds a line break between its words, which it is read and saved with a space for. */
export const breaksLine = (title: string): boolean =>
  /[\n\v\f\r\u0085\u2028\u2029]/u.test(title.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''))

/** Whether a case has a title of its own. One without is read with its id in the title's place. */
export const hasTitle = (c: Pick<Case, 'id' | 'title'>): boolean =>
  oneLineTitle(c.title) !== '' && c.title !== c.id

/**
 * How a case is named wherever it shows: its title, or the start of its
 * prompt when it has none. Never its id, which only names its folder.
 */
export function caseName(c: Pick<Case, 'id' | 'title' | 'prompt'>): string {
  if (hasTitle(c)) return oneLineTitle(c.title)
  const start = promptStart(c.prompt)
  return words(c.prompt).length > ID_WORDS ? `${start}…` : start || c.id
}

/** A title as two that read as one are the same: one line (`oneLineTitle`), and no capitals. */
export const titleKey = (title: string): string => oneLineTitle(title).toLowerCase()

/** Two titles that read as one: the same words, whatever their capitals or the white space between and around them. */
export const sameTitle = (a: string, b: string): boolean => titleKey(a) === titleKey(b)

/**
 * Whether a case other than `own` has the title. Cases are told apart by
 * title alone, so no two may share one.
 */
export const titleTaken = (
  cases: readonly Pick<Case, 'id' | 'title'>[],
  title: string,
  own: string | null = null,
): boolean =>
  oneLineTitle(title) !== '' &&
  cases.some((c) => c.id !== own && hasTitle(c) && sameTitle(c.title, title))

/** The title, or with the first number after it that no case's title has: "Tone check 2". */
export function unusedTitle(cases: readonly Pick<Case, 'id' | 'title'>[], title: string): string {
  const base = oneLineTitle(title)
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
