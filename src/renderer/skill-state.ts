/**
 * The open skill as the window holds it: its state, the scoring in hand and
 * its files as saved, each read from the host and read again when it changes.
 *
 * Every call addresses the skill open when it is made, and a reply can land
 * after another skill was opened. Such a reply is dropped: one skill's state,
 * scoring or files are never shown, or saved, as another's. Reads of the one
 * skill can land out of order too: a reply is dropped only once a newer one
 * has landed, so a slow read never leaves the screen with nothing new.
 */
import type { BenchConfig } from '@domain/schemas.ts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, currentSkill, type State, setSkill } from './api.ts'
import type { Reporter } from './hooks.ts'
import { keptConfig, mergedConfig } from './model.ts'
import { createReads } from './reads.ts'

/** The open skill's files as saved: one copy, which the Editor and the side panel both read. */
export interface SavedFiles {
  /** Each file's text by path; null until read. */
  saved: Record<string, string> | null
  /** Why the last read failed; null once one has worked. */
  error: string | null
  /** A read is on its way. */
  loading: boolean
  reload: () => void
  /**
   * A file was just written with `text`, or deleted (null). The copy follows
   * at once, so the screen never shows the text from before the write while
   * the skill is read again.
   */
  took: (path: string, text: string | null) => void
}

export interface SkillState {
  /** Null until the skill is read, and while another is being opened. */
  state: State | null
  /** The scoring as edited; the saved scoring until it is changed. */
  config: BenchConfig | null
  setConfig: (config: BenchConfig) => void
  /** Why the skill could not be read. */
  error: string | null
  /**
   * Read the skill again. Resolves once this read and any asked for after it
   * have landed. A reply for a skill that is no longer the open one is dropped,
   * and so is one older than a reply already taken.
   */
  reload: () => Promise<void>
  files: SavedFiles
}

export function useSkillState(skillPath: string, report: Reporter): SkillState {
  const { state, config, setConfig, error, reload } = useSkillRead(skillPath, report)
  const files = useSavedFiles(
    skillPath,
    state?.skill.path ?? null,
    state?.versions.current.hash ?? null,
  )
  return { state, config, setConfig, error, reload, files }
}

/**
 * The open skill's state and the scoring in hand, read when the skill opens,
 * when the window comes back into focus, and on `reload`.
 */
function useSkillRead(skillPath: string, report: Reporter): Omit<SkillState, 'files'> {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<BenchConfig | null>(null)
  /** The scoring that was saved when the skill was last read: an edit is whatever differs from it. */
  const savedBefore = useRef<BenchConfig | null>(null)
  /** Whether the open skill has been read at all: a later read that fails is said, not shown. */
  const wasRead = useRef(false)
  /** Counts the skills opened: a read asked for under one is dropped once the next is open. */
  const opened = useRef(0)
  /** The skill's reads, which can land out of order: a reply is dropped once a newer one has landed. */
  const [reads] = useState(createReads)

  const reload = useCallback((): Promise<void> => {
    const skill = currentSkill()
    if (!skill) return Promise.resolve()
    const under = opened.current
    const elsewhere = () => skill !== currentSkill() || under !== opened.current
    return reads.read(
      () => api.state(),
      (next) => {
        if (elsewhere()) return
        const saved = mergedConfig(next.savedConfig)
        const before = savedBefore.current
        savedBefore.current = saved
        wasRead.current = true
        setState(next)
        setError(null)
        setConfig((current) => keptConfig(current, before, saved))
      },
      (e) => {
        if (elsewhere()) return
        setError(e.message)
        // The skill is on screen as last read: say that this read failed, since nothing else would.
        if (wasRead.current)
          report(`Could not read the skill again: ${e.message}`, { tone: 'destructive' })
      },
    )
  }, [report, reads])

  useEffect(() => {
    setSkill(skillPath)
    savedBefore.current = null
    wasRead.current = false
    opened.current += 1
    setState(null)
    setConfig(null)
    setError(null)
    void reload()
  }, [skillPath, reload])

  // Files are edited outside the app too: coming back to the window reads the skill again, so an
  // outside edit shows at once, and not first as a refused save.
  useEffect(() => {
    const look = () => void reload()
    window.addEventListener('focus', look)
    return () => window.removeEventListener('focus', look)
  }, [reload])

  return { state, config, setConfig, error, reload }
}

/**
 * The open skill's files as saved. `path` and `hash` are the skill and its
 * version as last read, null before it is. Opening another skill clears them.
 */
function useSavedFiles(skillPath: string, path: string | null, hash: string | null): SavedFiles {
  const [files, setFiles] = useState<{ skill: string; files: Record<string, string> } | null>(null)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [filesTick, setFilesTick] = useState(0)
  /** The read that has landed, by what it was asked for. */
  const [filesLanded, setFilesLanded] = useState<string | null>(null)
  /** Counts the writes told to `took`: a read asked for before one may hold the text from before it. */
  const writes = useRef(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: the files are cleared each time another skill opens.
  useEffect(() => {
    setFiles(null)
    setFilesError(null)
  }, [skillPath])

  // The files are read again whenever they change, here or from the side panel.
  const asked = path === null ? null : `${path}\n${hash}\n${filesTick}`
  useEffect(() => {
    if (asked === null || path === null) return
    let live = true
    const skill = currentSkill()
    const at = writes.current
    api.skillFiles('current').then(
      (loaded) => {
        if (!live || skill !== currentSkill()) return
        // A file was written while this was read: read again, so the older text never lands over it.
        if (at !== writes.current) return setFilesTick((t) => t + 1)
        setFiles({ skill: path, files: loaded.files })
        setFilesError(null)
        setFilesLanded(asked)
      },
      (e: Error) => {
        if (!live || skill !== currentSkill()) return
        setFilesError(e.message)
        setFilesLanded(asked)
      },
    )
    return () => {
      live = false
    }
  }, [asked, path])

  const reloadFiles = useCallback(() => setFilesTick((t) => t + 1), [])
  const took = useCallback((file: string, text: string | null) => {
    writes.current += 1
    setFiles((held) => {
      if (!held) return held
      const { [file]: _, ...rest } = held.files
      return { skill: held.skill, files: text === null ? rest : { ...rest, [file]: text } }
    })
  }, [])

  const saved = files && files.skill === path ? files.files : null
  const filesLoading = asked !== null && filesLanded !== asked
  return useMemo<SavedFiles>(
    () => ({ saved, error: filesError, loading: filesLoading, reload: reloadFiles, took }),
    [saved, filesError, filesLoading, reloadFiles, took],
  )
}
