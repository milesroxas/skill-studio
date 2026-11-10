/**
 * How a change the assistant proposes stands against the open skill, worked
 * out without React so it can be tested: what its row says, whether it is
 * done, and whether applying it would lose the reader's unsaved work.
 */
import { newCaseId } from '@domain/case-draft.ts'
import { caseHolds, type SkillChange } from '@domain/changes.ts'
import type { Case } from '@domain/schemas.ts'
import type { SkillVersion, SkillVersions } from '@domain/views.ts'
import { changeSummary, type DiffLine } from './diff.ts'
import { plural } from './model.ts'

type CaseChange = Extract<SkillChange, { kind: 'case' }>

/**
 * A proposed file against the skill. `before` is the file as saved: null for
 * one the skill does not have, undefined until the files are read. `draft` is
 * the reader's unsaved text, when there is some.
 */
export interface FileStanding {
  before: string | null | undefined
  draft: string | undefined
  text: string
}

/** A proposed file's standing, from the files as saved (null until read) and the drafts. */
export const fileStanding = (
  files: Record<string, string> | null,
  drafts: Record<string, { text: string }>,
  path: string,
  text: string,
): FileStanding => ({
  before: files ? (files[path] ?? null) : undefined,
  draft: drafts[path]?.text,
  text,
})

/**
 * The files with unsaved text: those whose draft differs from the file as
 * saved. A draft that says what the disk says is not unsaved work. Until the
 * saved files are read (`files` null), every draft counts.
 */
export const unsavedFiles = (
  files: Record<string, string> | null,
  drafts: Record<string, { text: string }>,
): string[] => Object.keys(drafts).filter((path) => !files || drafts[path]?.text !== files[path])

/** The row opens to a diff: there is a saved file to read, and the change differs from what the reader sees. */
export const showsDiff = (standing: FileStanding): boolean =>
  standing.before !== undefined && !fileDone(standing) && shownText(standing) !== standing.text

/** What the row shows the change against: the unsaved text when there is some. */
export const shownText = ({ before, draft }: FileStanding): string | null | undefined =>
  draft ?? before

/** The change is already saved. */
export const fileDone = ({ before, text }: FileStanding): boolean => before === text

/** Applying would drop unsaved edits that are neither the saved text nor the change's. */
export const losesEdits = ({ before, draft, text }: FileStanding): boolean =>
  draft !== undefined && draft !== before && draft !== text

const lineCount = (text: string): string => plural(text.split('\n').length - 1, 'line')

/** The row's detail: how much the change is, against what the reader sees. */
export function fileDetail(standing: FileStanding, lines: DiffLine[]): string {
  const { before, draft, text } = standing
  const shown = shownText(standing)
  if (before === undefined) return 'Reading the saved file…'
  if (fileDone(standing)) return lineCount(text)
  if (shown === null || shown === undefined) return `New file, ${lineCount(text)}`
  if (shown === text) return 'Saves your unsaved text'
  return `${changeSummary(shown, text, lines)}${draft === undefined ? '' : ' to your unsaved text'}`
}

/** A proposed case against the skill: the saved case it replaces, when there is one. */
export interface CaseStanding {
  saved: { id: string; title: string; dir: string | null } | undefined
  /** Whether the saved case already says what the change says. */
  done: boolean
  /** The reader has unsaved edits to the saved case. */
  drafted: boolean
  /**
   * A new case only: the id of a saved case with the same title, such as this
   * one added before and edited since. Adding makes a second.
   */
  twin?: string
}

const sameTitle = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * The saved case a proposed one lands on, and the id it is written under. A
 * case the assistant named replaces the case of that name. One it left
 * unnamed only replaces nothing: its id is made from its title, which can
 * match an unrelated case, so it is added under an id clear of the skill's,
 * unless a case of that id already says exactly what it says. A saved case
 * with its title, or with the id its title makes, is its twin: the row says
 * so, since it may be this one, added and edited since.
 */
export function caseTarget(
  change: CaseChange,
  cases: readonly Case[],
): { saved: Case | undefined; id: string; twin?: Case } {
  if (change.idGiven) return { saved: cases.find((c) => c.id === change.id), id: change.id }
  const held = cases.find((c) => caseHolds(change, c))
  if (held) return { saved: held, id: held.id }
  const named = { title: change.title, prompt: change.prompt }
  const first = newCaseId(named, [])
  const twin = cases.find(
    (c) => c.id === first || (change.title !== '' && sameTitle(c.title, change.title)),
  )
  const id = newCaseId(
    named,
    cases.map((c) => c.id),
  )
  return twin ? { saved: undefined, id, twin } : { saved: undefined, id }
}

/** A case kept in `evals.json`, which the app does not write. */
export const legacyCase = ({ saved }: CaseStanding): boolean =>
  saved !== undefined && saved.dir === null

export function caseDetail(standing: CaseStanding, checks: number): string {
  if (legacyCase(standing)) return 'Kept in evals.json: change it there'
  const kind = standing.done ? 'Case' : standing.saved ? 'Replaces a case' : 'New case'
  const twin = !standing.saved && standing.twin ? ` · ${standing.twin} has the same title` : ''
  return `${kind}, ${plural(checks, 'check')}${twin}`
}

/** What replacing the saved case does to it, for the question asked first. */
export const replaceWarning = ({ drafted }: CaseStanding): string =>
  drafted
    ? 'Its prompt and checks become the assistant’s, and your unsaved edits to it go.'
    : 'Its prompt and checks become the assistant’s. Its pictures stay.'

/** The labels of a case row's button: to apply, while applying, and once applied. */
export const caseLabels = ({
  saved,
  done,
}: CaseStanding): { label: string; busy: string; done: string } => ({
  label: saved ? 'Replace' : 'Add',
  busy: saved ? 'Replacing…' : 'Adding…',
  done: saved && !done ? 'Replaced' : 'Added',
})

/**
 * The version a proposed one is already saved as: by this change, which named
 * it, or by hand, when the files are a saved version as they stand.
 */
export const versionSaved = (
  versions: SkillVersions | undefined,
  name: string,
): SkillVersion | undefined =>
  versions?.versions.find((v) => v.saved && v.name === name) ??
  (versions && !versions.current.changed ? versions.current : undefined)

export function versionDetail(
  versions: SkillVersions | undefined,
  saved: SkillVersion | undefined,
): string {
  if (saved) return `Version ${saved.version}`
  return versions ? `Saves the files as ${versions.current.version}` : 'A version of the files'
}
