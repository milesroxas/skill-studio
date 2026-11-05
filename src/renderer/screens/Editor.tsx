/**
 * Write the skill: SKILL.md and references/, edited in place on disk. Every
 * keystroke is kept as a draft, so unsaved text survives a reload or a quit;
 * saving writes the file and clears its draft.
 */

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
import { PlusIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../api.ts'
import { DiffLines } from '../components/DiffLines.tsx'
import { DraftNote } from '../components/DraftNote.tsx'
import {
  Column,
  ColumnBody,
  ColumnHeader,
  ColumnSection,
  ColumnTitle,
  EmptyState,
  List,
  PlainList,
  Stack,
  Toolbar,
  Workbench,
} from '../components/layout.tsx'
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
  useEditorMode,
} from '../components/MarkdownEditor.tsx'
import { NavButton } from '../components/NavButton.tsx'
import { GuideBox, GuideList, Starter } from '../components/starters.tsx'
import { Hint, Text } from '../components/text.tsx'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Toggle } from '../components/ui/toggle.tsx'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { shortcut } from '../keys.ts'

const referencePath = (name: string): string | null => {
  const clean = name.trim().replace(/^references\//, '')
  if (!/^[\w][\w.-]*(\/[\w][\w.-]*)*$/.test(clean)) return null
  return `references/${/\.\w+$/.test(clean) ? clean : `${clean}.md`}`
}

export function Editor({ ctx }: { ctx: Ctx }) {
  const { state, route, go, toast, confirm, reload, config, drafts } = ctx
  const disk = useFetch(() => api.skillFiles('current'), [state.skill.path])
  const edits = drafts.files
  const [showDiff, setShowDiff] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useEditorMode()
  const editor = useRef<MarkdownEditorHandle>(null)

  const files = disk.data?.files ?? {}
  const paths = [...new Set([...Object.keys(files), ...Object.keys(edits)])].sort((a, b) =>
    a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b),
  )
  const file = route.params.get('file') ?? 'SKILL.md'
  const saved = files[file] ?? null
  const draft = edits[file]
  const text = draft?.text ?? saved ?? ''
  const isDirty = (path: string) => edits[path] !== undefined && edits[path].text !== files[path]
  /** The file changed on disk after this draft began: saving would be refused. */
  const stale = draft !== undefined && saved !== null && draft.previous !== saved

  const edit = (value: string) =>
    drafts.setFile(
      file,
      value === saved && !stale ? null : { text: value, previous: draft?.previous ?? saved },
    )

  /** Put a snippet at the cursor (or over the selection) and leave the cursor inside it. */
  const insert = (snippet: Snippet) => {
    if (editor.current) return editor.current.insert(snippet)
    // The diff is showing: add the snippet at the end.
    edit(insertAt(text, text.length, text.length, snippet).text)
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
    requestAnimationFrame(() => editor.current?.focus())
  }

  const drop = (path: string) => drafts.setFile(path, null)

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
    drafts.setFile(path, { text: referenceTemplate(path), previous: null })
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

  const isSkill = file === 'SKILL.md'
  const meta = isSkill ? readFrontMatter(text).meta : {}
  const rules = isSkill && !config.rules?.length ? rulesFromSkill(text) : []
  const diff = showDiff ? lineDiff(saved ?? '', text) : []
  const blank = isSkill && isScaffold(text)

  if (disk.error)
    return <EmptyState title="Could not read the skill's files">{disk.error}</EmptyState>
  if (!disk.data || drafts.status === 'loading') return <EmptyState>Loading…</EmptyState>

  const missing = isSkill ? ['name', 'description'].filter((k) => !metaText(meta, k)) : []
  const current = state.versions.current

  /** What to know about the file before editing it: a newer copy on disk, missing front matter. */
  const notes =
    stale || missing.length ? (
      <>
        {stale ? (
          <Alert variant="warning" role="status">
            <AlertTitle>{file} changed on disk since this draft began</AlertTitle>
            <AlertDescription>
              <p>Keep your draft to save over the file, or take the file as it is now.</p>
              <Toolbar>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => draft && drafts.setFile(file, { ...draft, previous: saved })}
                >
                  Keep my draft
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => drop(file)}>
                  Use the file on disk
                </Button>
              </Toolbar>
            </AlertDescription>
          </Alert>
        ) : null}
        {missing.length ? (
          <Alert variant="warning">
            <AlertTitle>Front matter needs {missing.join(' and ')}</AlertTitle>
            <AlertDescription>
              Agents find a skill by its name and description, between the --- lines at the top.
            </AlertDescription>
          </Alert>
        ) : null}
      </>
    ) : null

  return (
    <Workbench>
      <Column kind="list">
        <nav aria-label="Skill files" className="contents">
          <ColumnSection inset="list" title="Files">
            <PlainList gap="none" bleed>
              {paths.map((path) => (
                <li key={path}>
                  <NavButton current={path === file} onClick={() => go('edit', { file: path })}>
                    <Text font="mono" size="xs" wrap="anywhere">
                      {path}
                      {isDirty(path) ? <Text tone="warning"> •</Text> : null}
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
              <Toolbar wrap={false}>
                <Input
                  aria-label="New reference file"
                  placeholder="references/name.md"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={newName}
                  width="grow"
                  size="sm"
                  font="mono"
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Add reference file"
                  title="Add reference file"
                  disabled={!newName.trim()}
                >
                  <PlusIcon aria-hidden="true" />
                </Button>
              </Toolbar>
            </form>
          </ColumnSection>
        </nav>

        <ColumnSection inset="list" title="Insert">
          <Toolbar>
            {SNIPPETS.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => insert(s)}
              >
                {s.label}
              </Button>
            ))}
          </Toolbar>
          <Stack gap="xs">
            <GuideBox summary="How to write a rule">
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
                      size="xs"
                      title={t.summary}
                      onClick={() => startFrom(t)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </Toolbar>
              </GuideBox>
            ) : null}
          </Stack>
        </ColumnSection>

        {isSkill ? (
          <ColumnSection inset="list" title="Graded rules">
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
          </ColumnSection>
        ) : null}

        <ColumnSection inset="list" title="Version">
          <Hint>
            {current.changed
              ? `The saved files are not a version yet. Save them as ${current.version} to keep a copy you can return to.`
              : `The saved files are ${current.version}${current.name ? `, ${current.name}` : ''}.`}
          </Hint>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => go('versions')}>
              {current.changed ? `Save as ${current.version}` : 'See versions'}
            </Button>
          </div>
        </ColumnSection>
      </Column>

      <Column>
        <ColumnHeader>
          <ColumnTitle>
            <Text font="mono" size="sm" weight="medium">
              {file}
            </Text>
            <DraftNote
              drafts={drafts}
              dirty={isDirty(file)}
              saved={saved === null ? 'New, not on disk yet' : 'Saved'}
            />
          </ColumnTitle>
          <Toggle variant="outline" size="sm" pressed={showDiff} onPressedChange={setShowDiff}>
            Compare with saved
          </Toggle>
          {!isSkill ? (
            <Button type="button" variant="destructive-ghost" size="sm" onClick={remove}>
              {saved === null ? 'Discard file' : 'Delete'}
            </Button>
          ) : null}
          {draft ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Discard your changes to ${file}?`,
                    description: 'The draft goes and the file stays as it is on disk.',
                    action: 'Discard',
                    destructive: true,
                  })
                )
                  drop(file)
              }}
            >
              Discard
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={!isDirty(file) || busy || stale}
            onClick={save}
            title={shortcut('S')}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </ColumnHeader>
        {showDiff ? (
          <ColumnBody>
            {notes}
            {diff.length ? (
              <DiffLines lines={diff} />
            ) : (
              <Hint>No changes from the file on disk.</Hint>
            )}
          </ColumnBody>
        ) : (
          <MarkdownEditor
            key={file}
            ref={editor}
            mode={mode}
            onModeChange={setMode}
            aria-label={`Contents of ${file}`}
            placeholder={
              isSkill
                ? 'Write for the agent that loads this skill. One rule per bullet, with its why.'
                : 'Longer material SKILL.md points to. Say first when the agent should read it.'
            }
            value={text}
            onChange={edit}
            onSave={save}
            banner={
              notes || blank ? (
                <ColumnBody>
                  {notes}
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
                            size="sm"
                            title={t.summary}
                            onClick={() => startFrom(t)}
                          >
                            {t.label}
                          </Button>
                        ))}
                      </Toolbar>
                    </Starter>
                  ) : null}
                </ColumnBody>
              ) : null
            }
          />
        )}
      </Column>
    </Workbench>
  )
}
