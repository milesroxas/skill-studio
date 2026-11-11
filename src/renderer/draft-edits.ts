/**
 * What a save does to the drafts, worked out without React so it can be
 * tested. A save takes a moment, and the writer may type through it: what was
 * typed meanwhile is unsaved work on top of what was just saved, never dropped.
 */
import { blankDraft, draftOf } from '@domain/case-draft.ts'
import {
  type Case,
  type CaseDraft,
  type FileDraft,
  NEW_CASE_KEY,
  type SkillDrafts,
} from '@domain/schemas.ts'

const without = <T>(all: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _, ...rest } = all
  return rest
}

/** Set or clear one file's draft. */
export const withFile = (all: SkillDrafts, path: string, draft: FileDraft | null): SkillDrafts => ({
  ...all,
  files: draft ? { ...all.files, [path]: draft } : without(all.files, path),
})

/** Set or clear one case's draft. */
export const withCase = (all: SkillDrafts, key: string, draft: CaseDraft | null): SkillDrafts => ({
  ...all,
  cases: draft ? { ...all.cases, [key]: draft } : without(all.cases, key),
})

/**
 * `path` was saved as `sent`. Its draft goes when it still says `sent`; text
 * typed while the file was being written stays, as a draft begun on `sent`.
 */
export function afterFileSave(all: SkillDrafts, path: string, sent: string): SkillDrafts {
  const draft = all.files[path]
  if (!draft) return all
  return withFile(all, path, draft.text === sent ? null : { text: draft.text, previous: sent })
}

/**
 * The case drafted under `key` was saved, with the id `id`. `sent` is its
 * draft as it stood when the save began. The draft goes when it still says
 * that; edits made while the case was being written stay, under the case's
 * id, which a new case only has once it is saved.
 */
export function afterCaseSave(
  all: SkillDrafts,
  key: string,
  sent: CaseDraft,
  id: string,
): SkillDrafts {
  const draft = all.cases[key]
  if (!draft) return all
  const cleared = withCase(all, key, null)
  return JSON.stringify(draft) === JSON.stringify(sent)
    ? cleared
    : withCase(cleared, id, { ...draft, id })
}

/**
 * When each drafted case was saved as its draft began, by draft key, as the
 * host stamps a case (`savedAt`). A save sends it, and the host refuses the
 * save when the case on disk is newer: an edit made outside the app since the
 * draft began is never written over unseen. Null for a case with no stamp.
 */
export type CaseBases = Record<string, string | null>

/** Set or clear the stamp the case under `key` was drafted on. */
export const withBase = (
  bases: CaseBases,
  key: string,
  savedAt: string | null | undefined,
): CaseBases => (savedAt === undefined ? without(bases, key) : { ...bases, [key]: savedAt })

/**
 * The case drafted under `key` was saved with the id `id`, and stamped
 * `savedAt`. What is typed while it is written stays a draft, under `id`,
 * begun on what was just saved.
 */
export const basesAfterCaseSave = (
  bases: CaseBases,
  key: string,
  id: string,
  savedAt: string | null,
): CaseBases => withBase(without(bases, key), id, savedAt)

/**
 * The form of a case as the screen shows it: its stored draft, or the case as
 * saved. A draft stored before cases held pictures has none listed: it keeps
 * the pictures the saved case has, so saving it does not remove them. One
 * stored before the phone setting keeps the saved case's.
 */
export const formDraft = (stored: CaseDraft | undefined, base: CaseDraft): CaseDraft =>
  stored
    ? {
        // The saved case's keys first, so a draft that says the same reads the same.
        ...base,
        ...stored,
        phone: stored.phone ?? base.phone,
        size: stored.size === undefined ? base.size : stored.size,
        images: stored.images ?? base.images,
        graders: stored.graders.map((g) => ({
          ...g,
          image:
            g.image === undefined
              ? (base.graders.find((b) => b.id === g.id)?.image ?? null)
              : g.image,
        })),
      }
    : base

/** Whether a stored case draft holds unsaved work: it differs from the case as saved, `base`. */
export const caseUnsaved = (stored: CaseDraft | undefined, base: CaseDraft): boolean =>
  stored !== undefined && JSON.stringify(formDraft(stored, base)) !== JSON.stringify(base)

/**
 * The cases with unsaved work, by draft key: a draft that says what the case
 * on disk says is none, such as one a save left while another skill was open.
 * The new case's draft counts while it holds anything.
 */
export const unsavedCases = (cases: readonly Case[], drafts: Record<string, CaseDraft>): string[] =>
  Object.keys(drafts).filter((key) => {
    if (key === NEW_CASE_KEY) return caseUnsaved(drafts[key], blankDraft())
    const saved = cases.find((c) => c.id === key)
    return saved !== undefined && caseUnsaved(drafts[key], draftOf(saved))
  })

/** The drafts of cases the skill no longer has: nothing shows them, so nothing could clear them. */
export const orphanCases = (
  cases: Record<string, CaseDraft>,
  ids: readonly string[],
  newKey: string,
): string[] => Object.keys(cases).filter((key) => key !== newKey && !ids.includes(key))
