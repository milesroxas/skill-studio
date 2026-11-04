/** Write the skill: SKILL.md and references/, edited in place on disk. */

import { rulesFromSkill } from '@domain/rules.ts'
import {
  applyTemplate,
  EXAMPLE_KINDS,
  insertAt,
  isScaffold,
  referenceTemplate,
  type SkillTemplate,
  SNIPPETS,
  type Snippet,
} from '@domain/templates.ts'
import { metaText, readFrontMatter } from '@domain/text.ts'
import { useEffect, useRef, useState } from 'react'
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
  const area = useRef<HTMLTextAreaElement>(null)

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

  /** Put a snippet at the cursor (or over the selection) and leave the cursor inside it. */
  const insert = (snippet: Snippet) => {
    const el = area.current
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = insertAt(text, start, end, snippet)
    edit(next.text)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(next.cursor, next.cursor)
    })
  }

  /** Replace the body of SKILL.md with a template's, keeping the front matter. */
  const startFrom = (template: SkillTemplate) => {
    if (
      !isScaffold(text) &&
      !window.confirm(`Replace what is in ${file} with the ${template.label} template?`)
    )
      return
    edit(applyTemplate(text, template, state.skill.name))
    requestAnimationFrame(() => area.current?.focus())
  }

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
    setEdits((all) => ({ ...all, [path]: { text: referenceTemplate(path), previous: null } }))
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
  const blank = isSkill && isScaffold(text)

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
          <>
            {blank ? (
              <section className="starter" aria-label="Start from a template">
                <div className="starter-text">
                  <span className="h3">Start from a template</span>
                  <span className="help">
                    Each one is a small, finished skill in the shape the judge grades: one rule per
                    bullet, with its why. Replace the rules with yours.
                  </span>
                </div>
                <div className="actions">
                  {EXAMPLE_KINDS.map((t) => (
                    <button key={t.id} type="button" title={t.summary} onClick={() => startFrom(t)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <TextArea
              ref={area}
              className="editor-text mono"
              aria-label={`Contents of ${file}`}
              spellCheck={false}
              placeholder={
                isSkill
                  ? 'Write for the agent that loads this skill. One rule per bullet, with its why.'
                  : 'Longer material SKILL.md points to. Say first when the agent should read it.'
              }
              value={text}
              onChange={(e) => edit(e.target.value)}
              onKeyDown={onKey}
            />
          </>
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

        <div className="field">
          <span className="h3">Insert</span>
          <div className="actions">
            {SNIPPETS.map((s) => (
              <button key={s.id} type="button" className="small" onClick={() => insert(s)}>
                {s.label}
              </button>
            ))}
          </div>
          <details className="guide-box">
            <summary>How to write a rule the agent follows</summary>
            <ol className="small guide-list">
              <li>
                <b>Encode process, not outcome.</b> "Lead with the change for the reader" beats
                "write clearly". The agent can walk a step; it cannot measure an adjective.
              </li>
              <li>
                <b>Write the why in the same bullet.</b> A rule with its reason generalises to cases
                you did not write down. A bare rule is applied blindly.
              </li>
              <li>
                <b>Be numeric or absolute.</b> "20 words or fewer", "never", "always". "Reasonably"
                and "where appropriate" change nothing.
              </li>
              <li>
                <b>Every line must change what the agent does.</b> Cut definitions of things it
                knows. Attention spent there is taken from your rules.
              </li>
              <li>
                <b>One skill, one aspect.</b> Writing, code, workflow or design. A skill that covers
                everything is followed on nothing.
              </li>
            </ol>
          </details>
          {isSkill && !blank ? (
            <details className="guide-box">
              <summary>Start over from a template</summary>
              <div className="actions">
                {EXAMPLE_KINDS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="small"
                    title={t.summary}
                    onClick={() => startFrom(t)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div>

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
