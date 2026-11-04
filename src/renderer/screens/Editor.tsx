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
import {
  Field,
  List,
  Panel,
  PlainList,
  Spacer,
  Split,
  Stack,
  Toolbar,
} from '../components/layout.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { GuideBox, GuideList, Starter } from '../components/starters.tsx'
import { TextArea } from '../components/TextArea.tsx'
import { Heading, Hint, Text } from '../components/text.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Toggle } from '../components/ui/toggle.tsx'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { DiffLines } from './SkillDiff.tsx'

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
  const { state, route, go, toast, confirm, reload, config } = ctx
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
  const startFrom = async (template: SkillTemplate) => {
    if (
      !isScaffold(text) &&
      !(await confirm({
        title: `Replace what is in ${file}?`,
        description: `The ${template.label} template takes its place. The front matter stays.`,
        action: 'Replace',
      }))
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
    const ok = await confirm({
      title: `Delete ${file} from disk?`,
      description: 'Run snapshots keep their copy.',
      action: 'Delete',
      destructive: true,
    })
    if (!ok) return
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

  if (disk.error) return <Hint>{disk.error}</Hint>
  if (!disk.data) return <Hint>Loading…</Hint>

  return (
    <Split layout="editor">
      <Stack gap="md">
        <Toolbar>
          <Text font="mono">{file}</Text>
          <Text tone="muted" size="xs">
            {saved === null ? 'new, not on disk yet' : isDirty(file) ? 'unsaved changes' : 'saved'}
          </Text>
          <Spacer />
          <Toggle variant="outline" pressed={showDiff} onPressedChange={setShowDiff}>
            Compare with saved
          </Toggle>
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty(file)}
            onClick={() => {
              drop(file)
              disk.reload()
            }}
          >
            Revert
          </Button>
          <Button type="button" disabled={!isDirty(file) || busy} onClick={save} title="Cmd/Ctrl+S">
            Save
          </Button>
        </Toolbar>
        {showDiff ? (
          diff.length ? (
            <DiffLines lines={diff} />
          ) : (
            <Hint>No changes from the file on disk.</Hint>
          )
        ) : (
          <>
            {blank ? (
              <Starter
                aria-label="Start from a template"
                title="Start from a template"
                hint="Each one is a small, finished skill in the shape the judge grades: one rule per bullet, with its why. Replace the rules with yours."
              >
                <Toolbar>
                  {EXAMPLE_KINDS.map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      variant="outline"
                      title={t.summary}
                      onClick={() => startFrom(t)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </Toolbar>
              </Starter>
            ) : null}
            <TextArea
              ref={area}
              variant="code"
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
      </Stack>

      <Panel sticky>
        <aside className="contents">
          <Field>
            <Heading level={3} as="span">
              Files
            </Heading>
            <PlainList>
              {paths.map((path) => (
                <li key={path}>
                  <NavButton current={path === file} onClick={() => go('edit', { file: path })}>
                    <Text font="mono" wrap="anywhere">
                      {path}
                      {isDirty(path) ? ' •' : ''}
                    </Text>
                  </NavButton>
                </li>
              ))}
            </PlainList>
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault()
                create()
              }}
            >
              <Toolbar>
                <Input
                  aria-label="New reference file"
                  placeholder="references/name.md"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={newName}
                  width="grow"
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Button type="submit" variant="outline" disabled={!newName.trim()}>
                  Add
                </Button>
              </Toolbar>
            </form>
            {!isSkill ? (
              <Toolbar>
                <Button type="button" variant="destructive-ghost" onClick={remove}>
                  {saved === null ? 'Discard new file' : 'Delete file'}
                </Button>
              </Toolbar>
            ) : null}
          </Field>

          {isSkill ? (
            <Field>
              <Heading level={3} as="span">
                Front matter
              </Heading>
              <Text as="p" size="xs">
                <Text tone="muted">name</Text>{' '}
                {metaText(meta, 'name') || <Text tone="destructive">missing</Text>}
              </Text>
              <Text as="p" size="xs">
                <Text tone="muted">description</Text>{' '}
                {metaText(meta, 'description') || <Text tone="destructive">missing</Text>}
              </Text>
            </Field>
          ) : null}

          <Field>
            <Heading level={3} as="span">
              Insert
            </Heading>
            <Toolbar>
              {SNIPPETS.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insert(s)}
                >
                  {s.label}
                </Button>
              ))}
            </Toolbar>
            <GuideBox summary="How to write a rule the agent follows">
              <GuideList>
                <li>
                  <b>Encode process, not outcome.</b> "Lead with the change for the reader" beats
                  "write clearly". The agent can walk a step; it cannot measure an adjective.
                </li>
                <li>
                  <b>Write the why in the same bullet.</b> A rule with its reason generalises to
                  cases you did not write down. A bare rule is applied blindly.
                </li>
                <li>
                  <b>Be numeric or absolute.</b> "20 words or fewer", "never", "always".
                  "Reasonably" and "where appropriate" change nothing.
                </li>
                <li>
                  <b>Every line must change what the agent does.</b> Cut definitions of things it
                  knows. Attention spent there is taken from your rules.
                </li>
                <li>
                  <b>One skill, one aspect.</b> Writing, code, workflow or design. A skill that
                  covers everything is followed on nothing.
                </li>
              </GuideList>
            </GuideBox>
            {isSkill && !blank ? (
              <GuideBox summary="Start over from a template">
                <Toolbar>
                  {EXAMPLE_KINDS.map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      title={t.summary}
                      onClick={() => startFrom(t)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </Toolbar>
              </GuideBox>
            ) : null}
          </Field>

          {isSkill ? (
            <Field>
              <Heading level={3} as="span">
                Graded rules
              </Heading>
              {config.rules?.length ? (
                <Hint>bench.json lists its own rules, so SKILL.md bullets are not used.</Hint>
              ) : rules.length ? (
                <List variant="number" size="xs" gap="sm">
                  {rules.map((r) => (
                    <li key={r.id}>
                      {r.text}
                      {r.section ? <Text tone="muted"> · {r.section}</Text> : null}
                    </li>
                  ))}
                </List>
              ) : (
                <Hint>No rules yet. Each top-level bullet of four words or more is one.</Hint>
              )}
            </Field>
          ) : null}

          <Hint>
            {dirtyCount
              ? `${dirtyCount} file(s) not saved.`
              : state.versions.current.changed
                ? `Saved edits make ${state.versions.current.version} on the next run.`
                : `Matches ${state.versions.current.version}.`}
          </Hint>
        </aside>
      </Panel>
    </Split>
  )
}
