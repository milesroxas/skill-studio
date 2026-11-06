/**
 * Write the skill: SKILL.md and references/, edited in place on disk. Every
 * keystroke is kept as a draft, so unsaved text survives a reload or a quit;
 * saving writes the file and clears its draft.
 *
 * The file's header holds one switch for what the column shows (the text
 * styled, its Markdown, or what changed since the last save) and the two
 * actions on unsaved work. Save is the one filled button, and only while there
 * is something to save; Discard is always there, so nothing in the row moves
 * on the first keystroke.
 */

import { applyPracticeEdit, PRACTICE_EDIT } from '@domain/practice.ts'
import { rulesFromSkill } from '@domain/rules.ts'
import {
  applyTemplate,
  EXAMPLE_KINDS,
  isScaffold,
  RULE_GUIDE,
  referenceTemplate,
  type SkillTemplate,
  SNIPPETS,
  type Snippet,
} from '@domain/templates.ts'
import { metaText, readFrontMatter } from '@domain/text.ts'
import { useEffect, useRef, useState } from 'react'
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
  ListHeader,
  Loading,
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
import { Segmented } from '../components/Segmented.tsx'
import { GuideBox, GuideList, PairList, Starter } from '../components/starters.tsx'
import { Code, Hint, Text } from '../components/text.tsx'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import type { Ctx } from '../ctx.ts'
import { lineDiff } from '../diff.ts'
import { useFetch } from '../hooks.ts'
import { shortcut } from '../keys.ts'

const referencePath = (name: string): string | null => {
  const clean = name.trim().replace(/^references\//, '')
  if (!/^[\w][\w.-]*(\/[\w][\w.-]*)*$/.test(clean)) return null
  return `references/${/\.\w+$/.test(clean) ? clean : `${clean}.md`}`
}

/** What the file's column shows: the text in one of the editor's two views, or its changes. */
const VIEWS = [
  { value: 'formatted', label: 'Formatted', title: 'Edit with the Markdown styled in place' },
  { value: 'markdown', label: 'Markdown', title: 'Edit the plain Markdown source' },
  { value: 'changes', label: 'Changes', title: 'Read what changed since the file was saved' },
] as const

type View = (typeof VIEWS)[number]['value']

export function Editor({ ctx }: { ctx: Ctx }) {
  const { state, route, go, toast, confirm, reload, config, drafts } = ctx
  const disk = useFetch(() => api.skillFiles('current'), [state.skill.path])
  const edits = drafts.files
  const [showDiff, setShowDiff] = useState(false)
  const [newName, setNewName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useEditorMode((message) => toast(`Not saved: ${message}`))
  const editor = useRef<MarkdownEditorHandle>(null)
  const nameField = useRef<HTMLInputElement>(null)
  const naming = newName !== null
  useEffect(() => {
    if (naming) nameField.current?.focus()
  }, [naming])

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

  /**
   * Put a snippet at the cursor (or over the selection) and leave the cursor
   * inside it. While the changes are showing it still lands at the cursor, and
   * shows there as an added line.
   */
  const insert = (snippet: Snippet) => editor.current?.insert(snippet)

  /** The editor remembers Formatted or Markdown; the changes are a look, and are not kept. */
  const look = (next: View | null) => {
    if (!next) return
    setShowDiff(next === 'changes')
    if (next !== 'changes' && next !== mode) setMode(next)
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
    const path = referencePath(newName ?? '')
    if (!path) return toast('Use letters, digits, dots, dashes and slashes only.')
    if (paths.includes(path)) return toast(`${path} already exists.`)
    drafts.setFile(path, { text: referenceTemplate(path), previous: null })
    setNewName(null)
    go('edit', { file: path })
  }

  const discard = async () => {
    if (
      await confirm({
        title:
          saved === null ? `Discard the new file ${file}?` : `Discard your changes to ${file}?`,
        description:
          saved === null ? 'What you typed goes.' : 'The file stays as it was last saved.',
        action: 'Discard',
        destructive: true,
      })
    ) {
      drop(file)
      if (saved === null) go('edit', {}, { replace: true })
    }
  }

  const remove = async () => {
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
      go('edit', {}, { replace: true })
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const isSkill = file === 'SKILL.md'
  const meta = isSkill ? readFrontMatter(text).meta : {}
  const rules = isSkill && !config.rules?.length ? rulesFromSkill(text) : []
  const diff = showDiff ? lineDiff(saved ?? '', text) : []
  const blank = isSkill && isScaffold(text)
  /** The practice skill, run once and still holding its vague rule: offer the exact one. */
  const tightened = isSkill && state.practice && state.runs.length ? applyPracticeEdit(text) : null

  if (disk.error && !disk.data)
    return (
      <EmptyState
        size="screen"
        title="Could not read the skill’s files"
        actions={
          <Button type="button" onClick={disk.reload}>
            Try again
          </Button>
        }
      >
        {disk.error}
      </EmptyState>
    )
  if (!disk.data || drafts.status === 'loading') return <Loading size="screen" />

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
              Agents find a skill by its name and description, between the <Code>---</Code> lines at
              the top.
            </AlertDescription>
          </Alert>
        ) : null}
      </>
    ) : null

  return (
    <Workbench>
      <Column kind="list">
        <nav aria-label="Skill files" className="contents">
          <ListHeader
            title="Files"
            count={paths.length}
            addLabel="Add a reference file"
            addDisabled={naming}
            onAdd={() => setNewName('')}
          />
          <ColumnSection inset="list">
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
            {naming ? (
              <form
                className="contents"
                onSubmit={(e) => {
                  e.preventDefault()
                  create()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setNewName(null)
                }}
              >
                <Input
                  ref={nameField}
                  aria-label="Name of the new reference file"
                  placeholder="references/name.md"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  value={newName}
                  size="sm"
                  font="mono"
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Toolbar>
                  <Button type="submit" size="sm" disabled={!newName.trim()}>
                    Add file
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setNewName(null)}>
                    Cancel
                  </Button>
                </Toolbar>
              </form>
            ) : null}
          </ColumnSection>
        </nav>

        <ColumnSection inset="list" title="Insert">
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
          <Stack gap="xs">
            <GuideBox summary="How to write a rule">
              <GuideList>
                {RULE_GUIDE.map((item) => (
                  <li key={item.lead}>
                    <b>{item.lead}</b> {item.text}
                  </li>
                ))}
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
          </Stack>
        </ColumnSection>

        {isSkill ? (
          <ColumnSection inset="list" title="Graded rules">
            {config.rules?.length ? (
              <Hint>
                <Code>bench.json</Code> lists its own rules, so SKILL.md bullets are not used.
              </Hint>
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
          <Toolbar>
            <Button type="button" variant="outline" size="sm" onClick={() => go('versions')}>
              {current.changed ? `Save as ${current.version}` : 'See versions'}
            </Button>
          </Toolbar>
        </ColumnSection>
      </Column>

      <Column>
        <ColumnHeader>
          <ColumnTitle>
            <Text font="mono" size="ui" weight="medium">
              {file}
            </Text>
            <DraftNote
              drafts={drafts}
              dirty={isDirty(file)}
              saved={saved === null ? 'New, not on disk yet' : 'Saved'}
            />
          </ColumnTitle>
          <Segmented<View>
            aria-label="View"
            value={showDiff ? 'changes' : mode}
            onChange={look}
            options={VIEWS}
          />
          {!isSkill && saved !== null ? (
            <Button type="button" variant="destructive-ghost" size="sm" onClick={remove}>
              Delete file
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!isDirty(file) || busy}
            onClick={discard}
          >
            Discard
          </Button>
          {/* The label holds still while the file is written, so the row does not shift. */}
          <Button
            type="button"
            variant={isDirty(file) ? 'default' : 'ghost'}
            size="sm"
            disabled={!isDirty(file) || busy || stale}
            aria-busy={busy}
            onClick={save}
            title={shortcut('S')}
          >
            Save
          </Button>
        </ColumnHeader>
        <MarkdownEditor
          key={file}
          id={`${state.skill.path}:${file}`}
          ref={editor}
          mode={mode}
          instead={
            showDiff ? (
              <ColumnBody>
                {notes}
                {diff.length ? (
                  <DiffLines lines={diff} />
                ) : (
                  <Hint>No changes from the file on disk.</Hint>
                )}
              </ColumnBody>
            ) : undefined
          }
          aria-label={`Contents of ${file}`}
          placeholder={
            isSkill
              ? 'Write for the agent that loads this skill. One rule per bullet, with its why.'
              : 'Longer material SKILL.md points to. Say first when the agent should read it.'
          }
          value={text}
          onChange={edit}
          onSave={save}
          assist={{
            field: isSkill ? 'skill.file' : 'skill.reference',
            // A reference is written to serve the skill it belongs to.
            context: () =>
              isSkill
                ? []
                : [
                    {
                      label: 'SKILL.md',
                      text: edits['SKILL.md']?.text ?? files['SKILL.md'] ?? '',
                    },
                  ],
          }}
          banner={
            notes || blank || tightened ? (
              <ColumnBody>
                {notes}
                {tightened ? (
                  <Starter
                    aria-label="Tighten this rule"
                    title="Tighten this rule"
                    hint="One rule in this skill is vague on purpose. Swap it for an exact one, or write your own, then save and run again to see what the edit did."
                  >
                    <PairList pairs={[PRACTICE_EDIT]} marks={['vague', 'exact']} />
                    <Toolbar>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          edit(tightened)
                          requestAnimationFrame(() => editor.current?.focus())
                        }}
                      >
                        Use the exact rule
                      </Button>
                    </Toolbar>
                  </Starter>
                ) : null}
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
      </Column>
    </Workbench>
  )
}
