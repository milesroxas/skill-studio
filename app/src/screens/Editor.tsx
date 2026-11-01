/** Write the skill: SKILL.md and references/, edited in place on disk. */

import { rulesFromSkill } from '@core/rules.ts'
import { metaText, readFrontMatter } from '@core/text.ts'
import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { TextArea } from '../components/TextArea.tsx'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'

/** A file being edited: its text now, and the text it had on disk (null when new). */
interface Draft {
  text: string
  previous: string | null
}

/** Unsaved drafts per skill, kept across screen switches (not page reloads). */
const drafts = new Map<string, Record<string, Draft>>()

const referencePath = (name: string): string | null => {
  const clean = name.trim().replace(/^references\//, '')
  if (!/^[\w][\w.-]*(\/[\w][\w.-]*)*$/.test(clean)) return null
  return `references/${/\.\w+$/.test(clean) ? clean : `${clean}.md`}`
}

export function Editor({ ctx }: { ctx: Ctx }) {
  const { state, route, go, toast, reload, config } = ctx
  const disk = useFetch(() => api.skillFiles('current'), [state.skill.path])
  const [edits, setEdits] = useState<Record<string, Draft>>(
    () => drafts.get(state.skill.path) ?? {},
  )
  const [showDiff, setShowDiff] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    drafts.set(state.skill.path, edits)
  }, [edits, state.skill.path])

  const files = disk.data?.files ?? {}
  const paths = [...new Set([...Object.keys(files), ...Object.keys(edits)])].sort((a, b) =>
    a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b),
  )
  const file = route.params.get('file') ?? 'SKILL.md'
  const saved = files[file] ?? null
  const draft = edits[file]
  const text = draft?.text ?? saved ?? ''
  const isDirty = (path: string) => edits[path] !== undefined && edits[path].text !== files[path]
  const dirtyCount = paths.filter(isDirty).length

  useEffect(() => {
    if (!dirtyCount) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirtyCount])

  const edit = (value: string) =>
    setEdits((all) => ({ ...all, [file]: { text: value, previous: all[file]?.previous ?? saved } }))

  const drop = (path: string) =>
    setEdits((all) => {
      const { [path]: _, ...rest } = all
      return rest
    })

  const save = async () => {
    if (!draft || !isDirty(file) || busy) return
    setBusy(true)
    try {
      await api.saveSkillFile(file, draft.text, draft.previous)
      drop(file)
      disk.reload()
      await reload()
      toast(`Saved ${file}`)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const create = () => {
    const path = referencePath(newName)
    if (!path) return toast('Use letters, digits, dots, dashes and slashes only.')
    if (paths.includes(path)) return toast(`${path} already exists.`)
    setEdits((all) => ({ ...all, [path]: { text: '', previous: null } }))
    setNewName('')
    go('edit', { file: path })
  }

  const remove = async () => {
    if (saved === null) {
      drop(file)
      return go('edit')
    }
    if (!window.confirm(`Delete ${file} from disk? Run snapshots keep their copy.`)) return
    try {
      await api.deleteSkillFile(file)
      drop(file)
      disk.reload()
      await reload()
      toast(`Deleted ${file}`)
      go('edit')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      save()
    }
  }

  const isSkill = file === 'SKILL.md'
  const meta = isSkill ? readFrontMatter(text).meta : {}
  const rules = isSkill && !config.rules?.length ? rulesFromSkill(text) : []
  const diff = showDiff ? lineDiff(saved ?? '', text) : []

  if (disk.error) return <p className="help">{disk.error}</p>
  if (!disk.data) return <p className="help">Loading…</p>

  return (
    <div className="split editor">
      <div className="stack editor-main">
        <div className="toolbar">
          <span className="mono">{file}</span>
          <small className="muted">
            {saved === null ? 'new, not on disk yet' : isDirty(file) ? 'unsaved changes' : 'saved'}
          </small>
          <span className="spacer" />
          <button type="button" aria-pressed={showDiff} onClick={() => setShowDiff((s) => !s)}>
            Compare with saved
          </button>
          <button
            type="button"
            disabled={!isDirty(file)}
            onClick={() => {
              drop(file)
              disk.reload()
            }}
          >
            Revert
          </button>
          <button
            type="button"
            className="primary"
            disabled={!isDirty(file) || busy}
            onClick={save}
            title="Cmd/Ctrl+S"
          >
            Save
          </button>
        </div>
        {showDiff ? (
          diff.length ? (
            <pre className="diff-lines">
              {diff.map((line) => (
                <span key={line.n} className={line.op}>
                  {line.op === 'fold'
                    ? '   …'
                    : `${line.op === 'ins' ? '+ ' : line.op === 'del' ? '- ' : '  '}${line.text}`}
                  {'\n'}
                </span>
              ))}
            </pre>
          ) : (
            <p className="help">No changes from the file on disk.</p>
          )
        ) : (
          <TextArea
            className="editor-text mono"
            aria-label={`Contents of ${file}`}
            spellCheck={false}
            value={text}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={onKey}
          />
        )}
      </div>

      <aside className="panel sticky">
        <div className="field">
          <span className="h3">Files</span>
          <ul className="file-list">
            {paths.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className="link mono"
                  aria-current={path === file ? 'true' : undefined}
                  onClick={() => go('edit', { file: path })}
                >
                  {path}
                  {isDirty(path) ? ' •' : ''}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="actions"
            onSubmit={(e) => {
              e.preventDefault()
              create()
            }}
          >
            <input
              aria-label="New reference file"
              placeholder="references/name.md"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" disabled={!newName.trim()}>
              Add
            </button>
          </form>
          {!isSkill ? (
            <button type="button" className="ghost bad" onClick={remove}>
              {saved === null ? 'Discard new file' : 'Delete file'}
            </button>
          ) : null}
        </div>

        {isSkill ? (
          <div className="field">
            <span className="h3">Front matter</span>
            <p className="small">
              <span className="muted">name</span>{' '}
              {metaText(meta, 'name') || <span className="bad">missing</span>}
            </p>
            <p className="small">
              <span className="muted">description</span>{' '}
              {metaText(meta, 'description') || <span className="bad">missing</span>}
            </p>
          </div>
        ) : null}

        {isSkill ? (
          <div className="field">
            <span className="h3">Graded rules</span>
            {config.rules?.length ? (
              <p className="help">
                bench.json lists its own rules, so SKILL.md bullets are not used.
              </p>
            ) : rules.length ? (
              <ol className="small rule-list">
                {rules.map((r) => (
                  <li key={r.id}>
                    {r.text}
                    {r.section ? <span className="muted"> · {r.section}</span> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="help">
                No rules yet. Each top-level bullet of four words or more is one.
              </p>
            )}
          </div>
        ) : null}

        <p className="help">
          {dirtyCount
            ? `${dirtyCount} file(s) not saved.`
            : state.versions.current.changed
              ? `Saved edits make ${state.versions.current.version} on the next run.`
              : `Matches ${state.versions.current.version}.`}
        </p>
      </aside>
    </div>
  )
}
