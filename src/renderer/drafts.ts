/**
 * Unsaved work on the open skill, kept on disk as you type. Editing a file or a
 * case writes a draft here; a short pause after the last keystroke stores it,
 * so a reload, a quit or a switch to another skill loses nothing. Saving the
 * file or case clears its draft.
 */
import { type CaseDraft, emptyDrafts, type FileDraft, type SkillDrafts } from '@domain/schemas.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api.ts'

/** Long enough to batch a burst of typing, short enough that a crash loses a sentence at most. */
const STORE_AFTER_MS = 500

export type DraftStatus = 'loading' | 'idle' | 'pending' | 'stored' | 'failed'

export interface Drafts {
  files: Record<string, FileDraft>
  cases: Record<string, CaseDraft>
  status: DraftStatus
  /** When the drafts last reached disk. */
  storedAt: Date | null
  setFile: (path: string, draft: FileDraft | null) => void
  setCase: (key: string, draft: CaseDraft | null) => void
}

const without = <T>(all: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _, ...rest } = all
  return rest
}

export function useDrafts(skillPath: string): Drafts {
  const [drafts, setDrafts] = useState<SkillDrafts>(emptyDrafts)
  const [status, setStatus] = useState<DraftStatus>('loading')
  const [storedAt, setStoredAt] = useState<Date | null>(null)
  /** The drafts not yet on disk, with their skill; null when nothing waits. */
  const waiting = useRef<{ skill: string; drafts: SkillDrafts } | null>(null)
  const skill = useRef(skillPath)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const store = useCallback(() => {
    clearTimeout(timer.current)
    const next = waiting.current
    if (!next) return
    waiting.current = null
    api.saveDrafts(next.skill, next.drafts).then(
      ({ updatedAt }) => {
        setStoredAt(updatedAt ? new Date(updatedAt) : null)
        setStatus(waiting.current ? 'pending' : 'stored')
      },
      () => setStatus('failed'),
    )
  }, [])

  // Load the open skill's drafts. Anything still waiting for the last skill is stored first.
  useEffect(() => {
    store()
    skill.current = skillPath
    setDrafts(emptyDrafts())
    setStoredAt(null)
    if (!skillPath) return setStatus('idle')
    setStatus('loading')
    let live = true
    api.drafts(skillPath).then(
      (loaded) => {
        if (!live) return
        setDrafts(loaded)
        setStoredAt(loaded.updatedAt ? new Date(loaded.updatedAt) : null)
        setStatus('idle')
      },
      () => live && setStatus('failed'),
    )
    return () => {
      live = false
    }
  }, [skillPath, store])

  // Leaving the page stores what is waiting at once.
  useEffect(() => {
    window.addEventListener('pagehide', store)
    return () => window.removeEventListener('pagehide', store)
  }, [store])

  const change = useCallback(
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

  const setFile = useCallback(
    (path: string, draft: FileDraft | null) =>
      change((all) => ({
        ...all,
        files: draft ? { ...all.files, [path]: draft } : without(all.files, path),
      })),
    [change],
  )
  const setCase = useCallback(
    (key: string, draft: CaseDraft | null) =>
      change((all) => ({
        ...all,
        cases: draft ? { ...all.cases, [key]: draft } : without(all.cases, key),
      })),
    [change],
  )

  return { files: drafts.files, cases: drafts.cases, status, storedAt, setFile, setCase }
}
