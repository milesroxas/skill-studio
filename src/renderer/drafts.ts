/**
 * Unsaved work on the open skill, kept on disk as you type. Editing a file or a
 * case writes a draft here; a short pause after the last keystroke stores it,
 * so a reload, a quit or a switch to another skill loses nothing. Saving the
 * file or case clears its draft, unless more was typed while it was written. A
 * write that fails keeps what it carried for the next change or flush, and an
 * edit typed before the stored drafts are read waits for them, so it never
 * replaces them. A read that fails is tried again before anything is stored
 * over what it could not read.
 *
 * A save that ends after another skill was opened still clears its draft, in
 * the stored drafts of the skill it saved: left there, it would be saved twice.
 * Each case draft also keeps, in this window, when its case was saved as the
 * draft began, which the save sends so an edit made outside is never written
 * over unseen.
 */
import { type CaseDraft, emptyDrafts, type FileDraft, type SkillDrafts } from '@domain/schemas.ts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.ts'
import {
  afterCaseSave,
  afterFileSave,
  basesAfterCaseSave,
  type CaseBases,
  withBase,
  withCase,
  withFile,
} from './draft-edits.ts'

/** Long enough to batch a burst of typing, short enough that a crash loses a sentence at most. */
const STORE_AFTER_MS = 500

/**
 * How long to wait before each new try at reading the stored drafts. After the
 * last one the file is taken as unreadable, and the next edit starts it afresh.
 */
const READ_AGAIN_MS = [600, 2000, 5000]

const NO_BASES: CaseBases = {}

export type DraftStatus = 'loading' | 'idle' | 'pending' | 'stored' | 'failed'

export interface Drafts {
  files: Record<string, FileDraft>
  cases: Record<string, CaseDraft>
  status: DraftStatus
  /** When the drafts last reached disk. */
  storedAt: Date | null
  /**
   * When each drafted case was saved as its draft began, by draft key. Stored
   * with the drafts, so a draft read back after a restart still knows; one
   * stored before bases were kept has none until it is shown.
   */
  caseBases: CaseBases
  setFile: (path: string, draft: FileDraft | null) => void
  /**
   * Set or clear a case's draft. `base` is when the case was saved, given as a
   * draft begins; clearing the draft clears it.
   */
  setCase: (key: string, draft: CaseDraft | null, base?: string | null) => void
  /** The case under `key` is drafted on the case saved at `savedAt`: Keep my draft, over a newer case on disk. */
  baseCase: (key: string, savedAt: string | null) => void
  /**
   * `path` was saved as `sent`: its draft goes, unless more was typed while it
   * was written. `skill` is the skill it was saved in, which may no longer be
   * the open one.
   */
  savedFile: (path: string, sent: string, skill?: string) => void
  /**
   * The case under `key` was saved with the id `id`, stamped `savedAt`; `sent`
   * is its draft as it stood when the save began, and `skill` the skill it was
   * saved in.
   */
  savedCase: (
    key: string,
    sent: CaseDraft | undefined,
    id: string,
    savedAt: string | null,
    skill?: string,
  ) => void
  /** Drop every draft of the open skill without storing it: the files on disk replaced them. */
  discard: () => void
  /** Store what is waiting now, so a reader on disk sees every keystroke. A failed write still resolves. */
  flush: () => Promise<void>
}

export function useDrafts(skillPath: string): Drafts {
  const [drafts, setDrafts] = useState<SkillDrafts>(emptyDrafts)
  const [status, setStatus] = useState<DraftStatus>('loading')
  const [storedAt, setStoredAt] = useState<Date | null>(null)
  /** The drafts not yet on disk, with their skill; null when nothing waits. */
  const waiting = useRef<{ skill: string; drafts: SkillDrafts } | null>(null)
  /** The drafts a write is carrying now: leaving the page sends them again, kept alive. */
  const carrying = useRef<{ skill: string; drafts: SkillDrafts } | null>(null)
  const skill = useRef(skillPath)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** The write under way, so a flush waits for one a timer already started. */
  const writing = useRef<Promise<void>>(Promise.resolve())
  /** The last change to the stored drafts of a skill no longer open: reading that skill again waits for it. */
  const elsewhere = useRef<Promise<void>>(Promise.resolve())
  /**
   * The stored drafts are still being read, and the edits made meanwhile. They
   * are applied over what loads: a draft built on nothing would, once stored,
   * replace every other file's and case's draft with nothing.
   */
  const loading = useRef(false)
  const queued = useRef<Array<(all: SkillDrafts) => SkillDrafts>>([])

  const store = useCallback((): Promise<void> => {
    clearTimeout(timer.current)
    const next = waiting.current
    if (!next) return writing.current
    waiting.current = null
    carrying.current = next
    const done = () => {
      if (carrying.current === next) carrying.current = null
    }
    writing.current = api.saveDrafts(next.skill, next.drafts).then(
      ({ updatedAt }) => {
        done()
        // Another skill is open by now: its own read says where its drafts stand.
        if (next.skill !== skill.current) return
        setStoredAt(updatedAt ? new Date(updatedAt) : null)
        setStatus(waiting.current ? 'pending' : 'stored')
      },
      () => {
        done()
        // The drafts wait for the next change or flush, unless a newer set is waiting already.
        if (!waiting.current) waiting.current = next
        if (next.skill === skill.current) setStatus('failed')
      },
    )
    return writing.current
  }, [])

  /** Take an edit: into the drafts, and on to disk after a pause. */
  const apply = useCallback(
    (update: (all: SkillDrafts) => SkillDrafts) => {
      setDrafts((all) => {
        const next = update(all)
        waiting.current = { skill: skill.current, drafts: next }
        return next
      })
      setStatus('pending')
      clearTimeout(timer.current)
      timer.current = setTimeout(store, STORE_AFTER_MS)
    },
    [store],
  )

  // Load the open skill's drafts. Anything still waiting for the last skill is stored first.
  useEffect(() => {
    void store()
    skill.current = skillPath
    queued.current = []
    setDrafts(emptyDrafts())
    setStoredAt(null)
    if (!skillPath) {
      loading.current = false
      return setStatus('idle')
    }
    loading.current = true
    setStatus('loading')
    let live = true
    let again: ReturnType<typeof setTimeout> | undefined
    /** The edits typed while the read was under way, over `base`. */
    const settle = (base: SkillDrafts, status: DraftStatus) => {
      loading.current = false
      const edits = queued.current
      queued.current = []
      setDrafts(base)
      setStatus(status)
      for (const edit of edits) apply(edit)
    }
    // After the writes under way, which may hold this skill's own drafts, stored as it was left.
    const read = (tries: number) =>
      Promise.all([writing.current, elsewhere.current])
        .then(() => api.drafts(skillPath))
        .then(
          (loaded) => {
            if (!live) return
            setStoredAt(loaded.updatedAt ? new Date(loaded.updatedAt) : null)
            settle(loaded, 'idle')
          },
          () => {
            if (!live) return
            const wait = READ_AGAIN_MS[tries]
            // Edits keep waiting meanwhile: stored now, they would replace drafts that are only out of reach.
            if (wait !== undefined) again = setTimeout(() => read(tries + 1), wait)
            // Nothing to build on: what was typed is kept in the page, and stored on the next change or flush.
            else settle(emptyDrafts(), 'failed')
          },
        )
    void read(0)
    return () => {
      live = false
      clearTimeout(again)
    }
  }, [skillPath, store, apply])

  // Leaving the page stores what is waiting at once. A write already under way was sent as an
  // ordinary request, which the page takes with it: its drafts go again, as one kept alive.
  useEffect(() => {
    const leave = () => {
      if (!waiting.current && carrying.current) waiting.current = carrying.current
      void store()
    }
    window.addEventListener('pagehide', leave)
    return () => window.removeEventListener('pagehide', leave)
  }, [store])

  const change = useCallback(
    (update: (all: SkillDrafts) => SkillDrafts) => {
      // The stored drafts are not read yet: the edit waits for them, and is applied over them.
      if (loading.current) queued.current.push(update)
      else apply(update)
    },
    [apply],
  )

  const setFile = useCallback(
    (path: string, draft: FileDraft | null) => change((all) => withFile(all, path, draft)),
    [change],
  )

  /**
   * Change the stored drafts of a skill that is no longer open: read them,
   * change them and write them back, after any write under way, so the switch
   * that left it has stored them first. A failure leaves them as they were.
   */
  const changeStored = useCallback(
    (forSkill: string, update: (all: SkillDrafts) => SkillDrafts) => {
      elsewhere.current = Promise.all([writing.current, elsewhere.current])
        .then(() => api.drafts(forSkill))
        .then((all) => api.saveDrafts(forSkill, update(all)))
        .then(
          () => {},
          () => {},
        )
    },
    [],
  )

  /** Change the drafts of `forSkill`: those in the page when it is the open skill, else those on disk. */
  const changeIn = useCallback(
    (forSkill: string, update: (all: SkillDrafts) => SkillDrafts) =>
      forSkill === skill.current ? change(update) : changeStored(forSkill, update),
    [change, changeStored],
  )
  /** Change one skill's case bases, which are stored with its drafts. */
  const rebase = useCallback(
    (forSkill: string, update: (held: CaseBases) => CaseBases) =>
      changeIn(forSkill, (all) => ({ ...all, caseBases: update(all.caseBases ?? NO_BASES) })),
    [changeIn],
  )

  const setCase = useCallback(
    (key: string, draft: CaseDraft | null, base?: string | null) => {
      change((all) => withCase(all, key, draft))
      if (draft === null) rebase(skill.current, (held) => withBase(held, key, undefined))
      else if (base !== undefined) rebase(skill.current, (held) => withBase(held, key, base))
    },
    [change, rebase],
  )
  const baseCase = useCallback(
    (key: string, savedAt: string | null) =>
      rebase(skill.current, (held) => withBase(held, key, savedAt)),
    [rebase],
  )
  const savedFile = useCallback(
    (path: string, sent: string, forSkill = skill.current) =>
      changeIn(forSkill, (all) => afterFileSave(all, path, sent)),
    [changeIn],
  )
  const savedCase = useCallback(
    (
      key: string,
      sent: CaseDraft | undefined,
      id: string,
      savedAt: string | null,
      forSkill = skill.current,
    ) => {
      changeIn(forSkill, (all) =>
        sent ? afterCaseSave(all, key, sent, id) : withCase(all, key, null),
      )
      rebase(forSkill, (held) => basesAfterCaseSave(held, key, id, savedAt))
    },
    [changeIn, rebase],
  )

  const discard = useCallback(() => {
    clearTimeout(timer.current)
    waiting.current = null
    queued.current = []
    setDrafts(emptyDrafts())
    setStoredAt(null)
    setStatus('idle')
  }, [])

  const { files, cases } = drafts
  const caseBases = drafts.caseBases ?? NO_BASES
  return useMemo(
    () => ({
      files,
      cases,
      status,
      storedAt,
      caseBases,
      setFile,
      setCase,
      baseCase,
      savedFile,
      savedCase,
      discard,
      flush: store,
    }),
    [
      files,
      cases,
      status,
      storedAt,
      caseBases,
      setFile,
      setCase,
      baseCase,
      savedFile,
      savedCase,
      discard,
      store,
    ],
  )
}
